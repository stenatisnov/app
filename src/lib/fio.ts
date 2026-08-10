import type { PrismaClient } from "@prisma/client";
import { PaymentStatus } from "@prisma/client";
import { audit } from "./audit";
import { confirmPaymentOrder } from "./payments";
import { getFioSettingsStored, setSetting, type FioSettings } from "./settings";

type FioColumn = { value: unknown } | null | undefined;

type FioTransaction = {
  idPohyb: string;
  amountCzk: number;
  variableSymbol: string | null;
};

/**
 * Fio's "last" endpoint returns only transactions since the previous
 * successful call — the bookmark is tracked server-side per token, so we
 * don't need to persist a cursor of our own. An empty result leaves the
 * bookmark untouched, so polling on a fixed interval is always safe.
 * https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf §5.2.3
 */
async function fetchNewFioTransactions(token: string): Promise<FioTransaction[]> {
  const res = await fetch(`https://fioapi.fio.cz/v1/rest/last/${encodeURIComponent(token)}/transactions.json`);
  if (!res.ok) throw new Error(`FIO_HTTP_${res.status}`);

  const body = (await res.json()) as {
    accountStatement?: { transactionList?: { transaction?: Record<string, FioColumn>[] } | null };
  };
  const rows = body.accountStatement?.transactionList?.transaction ?? [];

  // Column indices per §5.3.1.6: column22 = ID pohybu, column1 = Objem, column5 = VS.
  // Fio's JSON is inconsistent about whether numeric-looking fields come back
  // as JSON numbers or strings, so every value is coerced explicitly rather
  // than trusted to already be the right type.
  return rows.map((row) => ({
    idPohyb: String(row.column22?.value ?? ""),
    amountCzk: Number(row.column1?.value ?? NaN),
    variableSymbol: row.column5?.value != null ? String(row.column5.value).trim() : null,
  }));
}

/**
 * Polls Fio for new bank transfers and auto-confirms any pending QR payment
 * order whose variable symbol (and exact amount, as a safety check) matches
 * an incoming credit. Runs at most once every `pollIntervalSeconds` (or
 * always, when `force` is set — the admin's "check now" button), same
 * "IfDue" shape as the backup jobs in `backup.ts`.
 *
 * Only VS + amount both matching triggers auto-confirm. Any other incoming
 * credit (missing/unknown VS, amount mismatch, a plain bank transfer with
 * no matching pending order) is real money that arrived but couldn't be
 * attributed automatically — recorded as a "payment.fio.unmatched" audit
 * entry so it surfaces on the payment-control page for manual follow-up,
 * instead of silently vanishing.
 */
export async function runFioPollIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const settings = await getFioSettingsStored(prisma);
  if (!opts.force && !settings.enabled) return;
  if (!settings.token) {
    if (opts.force) throw new Error("FIO_NOT_CONFIGURED");
    return;
  }

  const frequencyMs = Math.max(30, settings.pollIntervalSeconds) * 1_000;
  const now = new Date();
  if (!opts.force && settings.lastRunAt && now.getTime() - new Date(settings.lastRunAt).getTime() < frequencyMs) return;

  try {
    const transactions = await fetchNewFioTransactions(settings.token);
    let matchedCount = 0;

    for (const txn of transactions) {
      if (!(txn.amountCzk > 0)) continue;

      // Each transaction is handled independently — one unexpected failure here
      // (e.g. an exception while confirming) must not abort the rest of the
      // batch, since Fio's own "new since last call" bookmark has already moved
      // past every transaction in `transactions` by this point: anything we
      // don't finish processing now won't be returned by the next poll either.
      try {
        const order = txn.variableSymbol
          ? await prisma.paymentOrder.findFirst({
              where: { status: PaymentStatus.PENDING, variableSymbol: txn.variableSymbol },
            })
          : null;

        if (order && Math.round(order.amountCzk) === Math.round(txn.amountCzk)) {
          const result = await confirmPaymentOrder(
            order.id,
            { source: "fio", meta: { fioIdPohyb: txn.idPohyb, variableSymbol: txn.variableSymbol, amountCzk: txn.amountCzk } },
            prisma,
          );
          if (result.ok) {
            matchedCount++;
          } else {
            // Matched by VS + amount, but confirmPaymentOrder still declined (e.g.
            // the order stopped being PENDING between our lookup and the confirm
            // call) — log it instead of silently dropping the transaction, so a
            // matched payment that didn't actually get confirmed doesn't vanish
            // without a trace.
            await audit(
              {
                action: "payment.fio.confirm",
                success: false,
                userId: order.userId,
                message: result.reason,
                meta: { orderId: order.id, fioIdPohyb: txn.idPohyb, variableSymbol: txn.variableSymbol, amountCzk: txn.amountCzk },
              },
              prisma,
            );
          }
          continue;
        }

        await audit(
          {
            action: "payment.fio.unmatched",
            success: false,
            meta: { fioIdPohyb: txn.idPohyb, variableSymbol: txn.variableSymbol, amountCzk: txn.amountCzk },
          },
          prisma,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await audit(
          {
            action: "payment.fio.confirm",
            success: false,
            message,
            meta: { fioIdPohyb: txn.idPohyb, variableSymbol: txn.variableSymbol, amountCzk: txn.amountCzk },
          },
          prisma,
        );
      }
    }

    const next: FioSettings = {
      ...settings,
      lastRunAt: now.toISOString(),
      lastMatchedCount: matchedCount,
      lastError: "",
      lastErrorAt: "",
    };
    await setSetting("fio", next, prisma);
    if (matchedCount > 0) {
      await audit({ action: "payment.fio.poll", success: true, meta: { matchedCount, checked: transactions.length } }, prisma);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: FioSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("fio", next, prisma);
    await audit({ action: "payment.fio.poll", success: false, message }, prisma);
    throw err;
  }
}
