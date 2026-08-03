import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { PaymentStatus, UserStatus } from "@prisma/client";
import { Link } from "@/i18n/navigation";

export default async function AdminOverviewPage() {
  const t = await getTranslations("admin");
  const tNav = await getTranslations("admin.nav");

  const [pendingUsers, pendingPayments, guestPasses] = await Promise.all([
    prisma.user.count({ where: { status: UserStatus.PENDING } }),
    prisma.paymentOrder.count({ where: { status: PaymentStatus.PENDING } }),
    prisma.guestPass.count(),
  ]);

  const tiles: [string, string, number][] = [
    [tNav("users"), "/admin/users", pendingUsers],
    [tNav("payments"), "/admin/payments", pendingPayments],
    [tNav("guests"), "/admin/guests", guestPasses],
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("overviewTitle")}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, href, count]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-neutral-200 p-4 hover:border-brand dark:border-neutral-800"
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="text-3xl font-bold">{count}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
