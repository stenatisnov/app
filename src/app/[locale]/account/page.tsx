import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatAppDateTime } from "@/lib/time";
import { changePasswordAction } from "@/app/actions";
import { StatusBanner } from "@/components/StatusBanner";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const session = await requireSession();
  const tAccount = await getTranslations("account");

  const [user, ledger] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, include: { personType: true } }),
    prisma.creditLedger.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="card">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{tAccount("title")}</h1>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-[var(--ink)]">
          <dt className="text-[var(--muted)]">{tAccount("email")}</dt>
          <dd>{user.email}</dd>
          <dt className="text-[var(--muted)]">{tAccount("personType")}</dt>
          <dd>{user.personType?.name ?? "—"}</dd>
          <dt className="text-[var(--muted)]">{tAccount("credits")}</dt>
          <dd>{user.credits}</dd>
        </dl>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("changePasswordTitle")}</h2>
        {ok === "1" && (
          <div className="mt-2">
            <StatusBanner tone="info">{tAccount("changePasswordSuccess")}</StatusBanner>
          </div>
        )}
        {error && (
          <div className="mt-2">
            <StatusBanner tone="danger">
              {tAccount(`errors.${error}` as "errors.short" | "errors.mismatch" | "errors.current")}
            </StatusBanner>
          </div>
        )}
        <form action={changePasswordAction} className="mt-3 flex max-w-sm flex-col gap-3">
          {user.passwordHash && (
            <input type="password" name="currentPassword" placeholder={tAccount("currentPassword")} required className="input" />
          )}
          <input type="password" name="newPassword" placeholder={tAccount("newPassword")} required minLength={8} className="input" />
          <input
            type="password"
            name="confirmPassword"
            placeholder={tAccount("confirmNewPassword")}
            required
            minLength={8}
            className="input"
          />
          <button type="submit" className="btn btn-primary">
            {tAccount("changePasswordSubmit")}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("historyTitle")}</h2>
        <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
          {ledger.map((row) => (
            <li key={row.id} className="flex justify-between py-2 text-[var(--ink)]">
              <span>
                {formatAppDateTime(row.createdAt)} — {row.reason}
              </span>
              <span className={row.delta >= 0 ? "text-[var(--ok)]" : "text-[var(--muted)]"}>
                {row.delta >= 0 ? `+${row.delta}` : row.delta}
              </span>
            </li>
          ))}
          {ledger.length === 0 && <li className="py-2 text-[var(--muted)]">—</li>}
        </ul>
      </div>
    </div>
  );
}
