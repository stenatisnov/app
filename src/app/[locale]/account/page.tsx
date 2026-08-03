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
      <div>
        <h1 className="text-2xl font-semibold">{tAccount("title")}</h1>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">{tAccount("email")}</dt>
          <dd>{user.email}</dd>
          <dt className="text-neutral-500">{tAccount("personType")}</dt>
          <dd>{user.personType?.name ?? "—"}</dd>
          <dt className="text-neutral-500">{tAccount("credits")}</dt>
          <dd>{user.credits}</dd>
        </dl>
      </div>

      <div>
        <h2 className="text-lg font-medium">{tAccount("changePasswordTitle")}</h2>
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
        <form action={changePasswordAction} className="mt-3 flex flex-col gap-3 max-w-sm">
          {user.passwordHash && (
            <input
              type="password"
              name="currentPassword"
              placeholder={tAccount("currentPassword")}
              required
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
            />
          )}
          <input
            type="password"
            name="newPassword"
            placeholder={tAccount("newPassword")}
            required
            minLength={8}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder={tAccount("confirmNewPassword")}
            required
            minLength={8}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
          <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white">
            {tAccount("changePasswordSubmit")}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-medium">{tAccount("historyTitle")}</h2>
        <ul className="mt-3 divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          {ledger.map((row) => (
            <li key={row.id} className="flex justify-between py-2">
              <span>
                {formatAppDateTime(row.createdAt)} — {row.reason}
              </span>
              <span className={row.delta >= 0 ? "text-emerald-600" : "text-neutral-500"}>
                {row.delta >= 0 ? `+${row.delta}` : row.delta}
              </span>
            </li>
          ))}
          {ledger.length === 0 && <li className="py-2 text-neutral-400">—</li>}
        </ul>
      </div>
    </div>
  );
}
