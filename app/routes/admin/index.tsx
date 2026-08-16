import { PaymentStatus, UserStatus } from "@prisma/client";
import { data } from "react-router";
import type { Route } from "./+types/index";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import { useTranslations } from "@/i18n/i18n.client";
import { Link } from "@/i18n/navigation";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const [pendingUsers, pendingPayments, guestPasses] = await Promise.all([
      prisma.user.count({ where: { status: UserStatus.PENDING } }),
      prisma.paymentOrder.count({ where: { status: PaymentStatus.PENDING } }),
      prisma.guestPass.count(),
    ]);
    return data({ pendingUsers, pendingPayments, guestPasses });
  });
}

export default function AdminOverviewPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const { pendingUsers, pendingPayments, guestPasses } = loaderData;

  const tiles: [string, string, number][] = [
    [t("nav.users"), "/admin/users", pendingUsers],
    [t("nav.payments"), "/admin/payments", pendingPayments],
    [t("nav.guests"), "/admin/guests", guestPasses],
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("overviewTitle")}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, href, count]) => (
          <Link key={href} href={href} className="card hover:border-[var(--brand)]">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="text-3xl font-bold">{count}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
