import QRCode from "qrcode";

/**
 * Czech "Short Payment Descriptor" (SPD) bank-transfer QR payload.
 * Spec: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */

/** ISO 7064 MOD 97-10 checksum, used by the IBAN check digits. */
function mod97(numeric: string): number {
  let checksum = 0;
  for (const ch of numeric) {
    checksum = (checksum * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  return checksum;
}

/** Parses a domestic "prefix-number/bank" string, or separate number + bank code fields. */
export function parseCzechAccount(
  accountNumber: string,
  bankCode = "",
): { prefix: string; number: string; bankCode: string } | null {
  let raw = accountNumber.trim().replace(/\s+/g, "");
  let bank = bankCode.trim().replace(/\s+/g, "");

  if (raw.includes("/")) {
    const [left, right] = raw.split("/");
    raw = left || "";
    bank = right || bank;
  }
  if (!raw || !bank) return null;

  let prefix = "";
  let number = raw;
  if (raw.includes("-")) {
    const [p, n] = raw.split("-");
    prefix = p || "";
    number = n || "";
  }

  if (prefix !== "" && !/^\d{1,6}$/.test(prefix)) return null;
  if (!/^\d{1,10}$/.test(number)) return null;
  if (!/^\d{4}$/.test(bank)) return null;

  return { prefix: prefix || "0", number, bankCode: bank };
}

/** Converts a CZ domestic account + bank code to IBAN, or normalizes an existing IBAN. */
export function toCzechIban(accountNumber: string, bankCode = ""): string | null {
  const cleaned = accountNumber.trim().replace(/\s+/g, "").toUpperCase();
  if (/^CZ\d{22}$/.test(cleaned)) return cleaned;

  const parsed = parseCzechAccount(accountNumber, bankCode);
  if (!parsed) return null;

  const prefix = parsed.prefix.padStart(6, "0");
  const number = parsed.number.padStart(10, "0");
  const bank = parsed.bankCode.padStart(4, "0");
  const bban = `${bank}${prefix}${number}`;
  // "CZ00" -> letters as digits (C=12, Z=35) -> "123500", per ISO 13616.
  const check = 98 - mod97(`${bban}123500`);
  return `CZ${String(check).padStart(2, "0")}${bban}`;
}

export function buildSpdPayload(params: {
  accountNumber: string;
  bankCode: string;
  amountCzk: number;
  variableSymbol?: string;
  constantSymbol?: string;
  message?: string;
}): string {
  const iban = toCzechIban(params.accountNumber, params.bankCode);
  if (!iban) throw new Error("INVALID_ACCOUNT");

  const amount = Number(params.amountCzk);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("INVALID_AMOUNT");

  const parts = ["SPD*1.0", `ACC:${iban}`, `AM:${amount.toFixed(2)}`, "CC:CZK"];

  if (params.variableSymbol) {
    const vs = String(params.variableSymbol).replace(/\D/g, "").slice(0, 10);
    if (vs) parts.push(`X-VS:${vs}`);
  }

  if (params.constantSymbol) {
    const ks = String(params.constantSymbol).replace(/\D/g, "").slice(0, 4);
    if (ks) parts.push(`X-KS:${ks}`);
  }

  if (params.message) {
    // SPD forbids '*' inside field values; also keep it plain-ASCII and short.
    const msg = params.message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (msg) parts.push(`MSG:${msg}`);
  }

  return parts.join("*");
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width: 280 });
}
