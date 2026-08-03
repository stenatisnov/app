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
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("overviewTitle")}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, href, count]) => (
          <Link
            key={href}
            href={href}
            className="card hover:border-[var(--brand)]"
          >
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="text-3xl font-bold">{count}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
