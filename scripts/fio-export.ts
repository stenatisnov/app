#!/usr/bin/env -S npx tsx
/**
 * Downloads everything that moved on the club's Fio account in a date range and
 * writes it to a CSV.
 *
 * Standalone on purpose — it talks to the bank directly and needs neither the
 * app nor a database, so it can be run by hand at any time:
 *
 *     FIO_TOKEN=... npx tsx scripts/fio-export.ts
 *
 * The token is the same read-only "Sledování účtu" one the app's payment poll
 * uses (admin → Nastavení → Fio, or Fio internetbanking → Nastavení → API).
 * Here it comes from the environment (`.env` works too, `dotenv` is loaded
 * below) rather than from the settings table, so the script doesn't need DB
 * credentials to run.
 *
 * Reads through the "periods" endpoint (API docs §5.2.1), not "last"
 * (§5.2.3): "periods" is a plain read and, unlike "last", doesn't move the
 * per-token "transactions since the previous call" bookmark that the running
 * app polls with — so running this export never costs the app a payment.
 *
 * The CSV is written the way Czech Excel expects a CSV: semicolon-separated
 * (with a comma delimiter, our decimal commas would split columns), UTF-8 with
 * a BOM (so diacritics survive), amounts with a decimal comma and two places.
 * Change `csvField`/`formatAmount` if some other tool needs to read it instead.
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { toAppDateValue } from "../src/lib/time";

/**
 * Overridable only so this script can be exercised against a local stand-in
 * without a real token; normal runs leave it unset and hit the real bank.
 */
const API_BASE = (process.env.FIO_API_BASE ?? "https://fioapi.fio.cz/v1/rest").replace(/\/+$/, "");

const DEFAULT_FROM = "2026-04-11";

/**
 * Fio caps how long a single requested period may be, so a longer range is
 * fetched as several windows. Kept a couple of days short of a year so a
 * leap-year range can't land exactly on whatever the real limit turns out to
 * be — the exact bound is the bank's, the point here is only to never exceed it.
 */
const MAX_WINDOW_DAYS = 364;

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 3_000;
const MAX_ATTEMPTS = 3;
/** Fio answers 409 when a token was queried a moment ago; the 5xx family is usually transient. Both are worth one more try. */
const RETRYABLE_STATUSES = new Set([409, 429, 500, 502, 503, 504]);

const DAY_MS = 86_400_000;

/**
 * The CSV's columns, in the order the bank's own statement lists them, each
 * mapped to the Fio column *names* it can arrive under.
 *
 * Fio labels every column it sends (`{"value": …, "name": "Objem", "id": 1}`),
 * so fields are resolved by name rather than by the documented `columnN`
 * positions that `src/lib/fio.ts` uses: the positions are easy to get subtly
 * wrong (KS and VS sit right next to each other, and a wrong index here would
 * silently mislabel money rather than fail), and we don't need to be fast.
 * When a name doesn't come back the field is left empty and, if *no* row
 * carried names at all, the script stops instead of writing an empty file —
 * see `resolvedAnyNames`.
 */
const COLUMNS: Array<{ header: string; names: readonly string[]; format?: (value: string) => string }> = [
  { header: "Datum", names: ["Datum"], format: dateOnly },
  { header: "Objem", names: ["Objem"], format: formatAmount },
  { header: "Měna", names: ["Měna"] },
  { header: "VS", names: ["VS"] },
  { header: "KS", names: ["KS"] },
  { header: "SS", names: ["SS"] },
  { header: "Protiúčet", names: ["Protiúčet"] },
  { header: "Kód banky", names: ["Kód banky"] },
  { header: "Název protiúčtu", names: ["Název protiúčtu"] },
  { header: "Zpráva pro příjemce", names: ["Zpráva pro příjemce"] },
  { header: "Uživatelská identifikace", names: ["Uživatelská identifikace"] },
  { header: "Typ pohybu", names: ["Typ pohybu"] },
  { header: "ID pohybu", names: ["ID pohybu"] },
];

const USAGE = `Stáhne pohyby na Fio účet do CSV.

  npx tsx scripts/fio-export.ts [přepínače]

  --from RRRR-MM-DD   od kterého dne (výchozí ${DEFAULT_FROM})
  --to   RRRR-MM-DD   do kterého dne včetně (výchozí dnešek)
  --out  SOUBOR       kam zapsat CSV (výchozí fio-payments_<od>_<do>.csv)
  --incoming-only     jen příchozí platby, bez odchozích
  --token TOKEN       API token (jinak z FIO_TOKEN v prostředí nebo .env)
  -h, --help          tahle nápověda

Token je read-only "Sledování účtu" z Fio internetbankingu (Nastavení → API);
aplikace používá tentýž v admin → Nastavení → Fio.`;

type FioColumn = { value?: unknown; name?: string } | null | undefined;
type FioRow = Record<string, FioColumn>;
type FioStatement = {
  info?: Record<string, unknown>;
  transactionList?: { transaction?: FioRow[] | FioRow | null } | null;
};
type Payment = Record<string, string>;

function fail(message: string): never {
  console.error(`Chyba: ${message}`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "2026-08-12+0200" → "2026-08-12". The offset is a timezone tag, not a time of day. */
function dateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

/**
 * Fio sends amounts as JSON numbers ("Objem"), but which type arrives has been
 * inconsistent historically (see the note in `src/lib/fio.ts`), so coerce and
 * fall back to the raw text rather than printing "NaN".
 *
 * No thousands separator on purpose: a spreadsheet reads "1250,50" as a number
 * to sum, but "1 250,50" (the Czech locale's non-breaking space) as text.
 */
function formatAmount(value: string): string {
  const amount = parseAmount(value);
  return Number.isFinite(amount) ? amount.toFixed(2).replace(".", ",") : value;
}

function parseAmount(value: string): number {
  return Number(value.replace(/\s/g, "").replace(",", "."));
}

/** RFC 4180 quoting, plus the semicolon we use as the delimiter. */
function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function assertIsoDay(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail(`${flag} musí být datum ve tvaru RRRR-MM-DD, dostal jsem "${value}"`);
  }
  return value;
}

type Options = { from: string; to: string; out: string; token: string; incomingOnly: boolean };

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    from: DEFAULT_FROM,
    to: toAppDateValue(),
    out: "",
    token: process.env.FIO_TOKEN?.trim() ?? "",
    incomingOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`chybí hodnota pro ${arg}`);
      return value;
    };

    switch (arg) {
      case "--from":
        opts.from = next();
        break;
      case "--to":
        opts.to = next();
        break;
      case "--out":
        opts.out = next();
        break;
      case "--token":
        opts.token = next().trim();
        break;
      case "--incoming-only":
        opts.incomingOnly = true;
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        fail(`neznámý přepínač "${arg}" (viz --help)`);
    }
  }

  assertIsoDay(opts.from, "--from");
  assertIsoDay(opts.to, "--to");
  if (opts.from > opts.to) fail(`--from (${opts.from}) je později než --to (${opts.to})`);
  // A prefix of the range keeps repeated exports of different periods apart.
  opts.out ||= `fio-payments_${opts.from}_${opts.to}.csv`;

  if (!opts.token) {
    fail(
      "chybí API token. Nastav FIO_TOKEN=… v prostředí nebo v .env, případně předej --token.\n" +
        "       Token je read-only \"Sledování účtu\" z Fio internetbankingu (Nastavení → API).",
    );
  }

  return opts;
}

/** Splits `from`..`to` (both inclusive) into windows Fio will accept in one request. */
function windows(from: string, to: string): Array<[string, string]> {
  const last = Date.parse(`${to}T00:00:00Z`);
  const out: Array<[string, string]> = [];

  for (let start = Date.parse(`${from}T00:00:00Z`); start <= last; ) {
    const stop = Math.min(start + (MAX_WINDOW_DAYS - 1) * DAY_MS, last);
    out.push([isoDay(start), isoDay(stop)]);
    start = stop + DAY_MS;
  }

  return out;
}

async function fetchPeriod(token: string, from: string, to: string): Promise<FioStatement> {
  const url = `${API_BASE}/periods/${encodeURIComponent(token)}/${from}/${to}/transactions.json`;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const body = await res.text();

    if (!res.ok) {
      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new Error(`Fio API vrátilo ${res.status} pro období ${from}–${to}: ${body.slice(0, 200)}`);
    }

    let parsed: { accountStatement?: FioStatement | null };
    try {
      parsed = JSON.parse(body) as { accountStatement?: FioStatement | null };
    } catch {
      throw new Error(`Fio API neposlalo JSON pro období ${from}–${to}: ${body.slice(0, 200)}`);
    }
    if (!parsed.accountStatement) {
      throw new Error(`Fio API neposlalo výpis pro období ${from}–${to}: ${body.slice(0, 200)}`);
    }

    return parsed.accountStatement;
  }
}

type Normalised = { payments: Payment[]; account: string; currency: string; resolvedAnyNames: boolean };

function normalise(statement: FioStatement): Normalised {
  const listed = statement.transactionList?.transaction;
  const rows: FioRow[] = Array.isArray(listed) ? listed : listed ? [listed] : [];

  const payments: Payment[] = [];
  let resolvedAnyNames = false;

  for (const row of rows) {
    const byName = new Map<string, string>();
    for (const column of Object.values(row)) {
      if (!column || typeof column.name !== "string" || column.value == null) continue;
      resolvedAnyNames = true;
      if (!byName.has(column.name)) byName.set(column.name, String(column.value).trim());
    }

    payments.push(
      Object.fromEntries(
        COLUMNS.map((column) => {
          const raw = column.names.map((name) => byName.get(name)).find((value) => value !== undefined) ?? "";
          return [column.header, column.format ? column.format(raw) : raw];
        }),
      ),
    );
  }

  const accountId = statement.info?.accountId;
  const bankId = statement.info?.bankId;
  const currency = statement.info?.currency;

  return {
    payments,
    account: accountId ? `${String(accountId)}${bankId ? `/${String(bankId)}` : ""}` : "",
    currency: typeof currency === "string" ? currency : "CZK",
    resolvedAnyNames,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const collected: Normalised[] = [];
  const periods = windows(opts.from, opts.to);

  for (const [from, to] of periods) {
    collected.push(normalise(await fetchPeriod(opts.token, from, to)));
    // Only polite: the common case is a single request, but a multi-year range
    // would otherwise fire several at the token back to back.
    if (periods.length > 1 && to !== opts.to) await sleep(1_000);
  }

  const seen = new Set<string>();
  const payments = collected
    .flatMap((part) => part.payments)
    .filter((payment) => {
      // Windows don't overlap, so a duplicate here would mean the bank reported
      // the same movement twice; drop it rather than count the money twice.
      const id = payment["ID pohybu"];
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => a["Datum"].localeCompare(b["Datum"]) || parseAmount(a["Objem"]) - parseAmount(b["Objem"]));

  const total = payments.length;
  if (total > 0 && !collected.some((part) => part.resolvedAnyNames)) {
    fail(
      "Fio poslalo pohyby bez názvů sloupců, nedá se poznat, který sloupec je který.\n" +
        "       Skript je potřeba upravit na poziční mapování (viz `columnN` v src/lib/fio.ts).",
    );
  }

  const incoming = payments.filter((payment) => parseAmount(payment["Objem"]) > 0);
  const outgoing = payments.filter((payment) => parseAmount(payment["Objem"]) < 0);
  const written = opts.incomingOnly ? incoming : payments;

  const lines = [COLUMNS.map((column) => csvField(column.header)).join(";")];
  for (const payment of written) {
    lines.push(COLUMNS.map((column) => csvField(payment[column.header] ?? "")).join(";"));
  }
  // The BOM is spelled out as an escape: as a literal it is invisible in the
  // source, and linters rightly flag it as stray whitespace.
  const BOM = "\uFEFF";
  await writeFile(opts.out, BOM + lines.join("\r\n") + "\r\n", "utf8");

  const money = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sum = (rows: Payment[]) => rows.reduce((total, row) => total + parseAmount(row["Objem"]), 0);
  const account = collected.find((part) => part.account)?.account ?? "";

  console.log(`Fio export ${opts.from} … ${opts.to}${account ? `, účet ${account}` : ""}`);
  console.log(`Staženo ${total} pohybů: ${incoming.length} příchozích (${money.format(sum(incoming))}), ${outgoing.length} odchozích`);
  console.log(`Zapsáno ${written.length} řádků do ${opts.out}`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
