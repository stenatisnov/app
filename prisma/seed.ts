import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Seeds the local throwaway SQLite file used only when authoring new
 * migrations with `npm run db:migrate` (DATABASE_URL from .env, not D1).
 * The real D1 database is seeded separately with `npm run db:seed`, which
 * runs scripts/seed-d1.mjs instead — see that file for why D1 needs a
 * different approach.
 */
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

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASS;
  if (adminEmail && adminPass) {
    const passwordHash = await bcrypt.hash(adminPass, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash, role: Role.ROOT, status: UserStatus.APPROVED },
      create: {
        email: adminEmail,
        name: "Admin",
        passwordHash,
        role: Role.ROOT,
        status: UserStatus.APPROVED,
        personTypeId: adult.id,
      },
    });
    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId: admin.id, groupId: defaultGroup.id } },
      update: {},
      create: { userId: admin.id, groupId: defaultGroup.id },
    });
    console.log(`Bootstrap root synced: ${adminEmail}`);
  }

  console.log("Local authoring DB seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
