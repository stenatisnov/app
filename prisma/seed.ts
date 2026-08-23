import { PackageKind, PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

// Standalone client (not `@/lib/db`) — this script runs via `tsx` outside
// Next.js's module resolution, so it constructs its own client the same way.
const prisma = new PrismaClient();

const DEFAULT_SETTINGS = {
  lock: { url: "", token: "", method: "POST", openDurationSec: 5, cooldownSec: 60, timeoutMs: 5000 },
  qrPayment: { accountNumber: "", bankCode: "", messageTemplate: "Stena Letnak {vs}", vsPrefix: "1" },
  gopay: { goid: "", clientId: "", clientSecret: "", sandbox: true },
};

async function main() {
  const adult = await prisma.personType.upsert({
    where: { name: "Dospělý" },
    update: {},
    create: { name: "Dospělý", isDefault: true },
  });

  const hasDefaultType = await prisma.personType.findFirst({ where: { isDefault: true } });
  if (!hasDefaultType) {
    await prisma.personType.update({ where: { id: adult.id }, data: { isDefault: true } });
  }

  // kind: CREDITS matters here, not just the credits value — a FAMILY
  // package is also always credits: 1 (see PackageKind.FAMILY), and without
  // this filter this would delete it on every seed run (every container
  // restart), not just the standard 1/5/10 packages this is meant to reset.
  await prisma.pricePackage.deleteMany({
    where: { personTypeId: adult.id, kind: PackageKind.CREDITS, credits: { in: [1, 5, 10] } },
  });
  await prisma.pricePackage.createMany({
    data: [
      { personTypeId: adult.id, credits: 1, priceCzk: 150 },
      { personTypeId: adult.id, credits: 5, priceCzk: 650 },
      { personTypeId: adult.id, credits: 10, priceCzk: 1200 },
    ],
  });

  let defaultGroup = await prisma.group.findFirst({ where: { isDefault: true } });
  if (!defaultGroup) {
    defaultGroup = await prisma.group.create({
      data: {
        name: "Výchozí",
        isDefault: true,
        is24_7: false,
        windows: {
          create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, fromMin: 6 * 60, toMin: 22 * 60 })),
        },
      },
    });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // Bootstrap/sync the root account from env on every seed run, so a fresh
  // deploy always has a working root login without a manual DB step.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASS;
  if (adminEmail && adminPass) {
    const passwordHash = await bcrypt.hash(adminPass, 12);
    const byEmail = await prisma.user.findUnique({ where: { email: adminEmail } });
    const existingAdmin =
      byEmail ??
      (await prisma.user.findFirst({
        where: { role: { in: [Role.ROOT, Role.ADMIN] } },
        orderBy: { createdAt: "asc" },
      }));

    if (existingAdmin) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          email: adminEmail,
          passwordHash,
          role: Role.ROOT,
          status: UserStatus.APPROVED,
          personTypeId: existingAdmin.personTypeId ?? adult.id,
        },
      });
      console.log(`Bootstrap root updated: ${adminEmail}`);
    } else {
      const admin = await prisma.user.create({
        data: {
          email: adminEmail,
          name: "Admin",
          passwordHash,
          role: Role.ROOT,
          status: UserStatus.APPROVED,
          personTypeId: adult.id,
        },
      });
      await prisma.userGroup.create({ data: { userId: admin.id, groupId: defaultGroup.id } });
      console.log(`Bootstrap root created: ${adminEmail}`);
    }
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
