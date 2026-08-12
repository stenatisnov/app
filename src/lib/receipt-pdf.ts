import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { PT_SANS_REGULAR_BASE64 } from "./fonts/pt-sans-regular";

const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 595;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

export type ReceiptPdfData = {
  orderId: string;
  confirmedAtLabel: string;
  buyerName: string | null;
  buyerEmail: string;
  /** Set when the purchase was made for a dependent (companion) rather than the buyer themselves. */
  dependentName: string | null;
  paymentTypeLabel: string;
  itemLabel: string;
  amountLabel: string;
  credits: number;
  /** The admin-configured, already-placeholder-substituted email body — printed verbatim as the PDF's opening message, so editing the text in Nastavení changes both the email and the receipt. */
  messageText: string;
};

/**
 * Builds the PDF "účtenka" attached to the payment-confirmation email. The
 * itemized detail (order id, date, buyer, item) always has this fixed
 * layout; `messageText` (the admin-configurable email body) is printed
 * above it verbatim, so the wording an admin edits in Nastavení shows up
 * in both places.
 *
 * Uses `pdf-lib` + `@pdf-lib/fontkit` with an embedded PT Sans font (rather
 * than one of pdf-lib's built-in standard fonts) because the standard fonts
 * only support WinAnsi/MacRoman encoding, neither of which has Czech
 * diacritics (č, ř, š, ů, ...) — drawing those with a standard font either
 * throws or silently drops the glyph. PT Sans is bundled as a base64
 * module (`./fonts/pt-sans-regular`) rather than read from disk since the
 * D1/Workers branch has no filesystem.
 */
export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = Buffer.from(PT_SANS_REGULAR_BASE64, "base64");
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawText = (text: string, opts: { size: number; color?: ReturnType<typeof rgb>; gap?: number }) => {
    page.drawText(text, { x: MARGIN, y, size: opts.size, font, color: opts.color ?? INK });
    y -= opts.size + (opts.gap ?? 8);
  };

  const drawRule = () => {
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1,
      color: LINE,
    });
    y -= 16;
  };

  /** Greedily wraps `text` onto lines that fit `maxWidth` at the given size. */
  const wrapText = (text: string, size: number, maxWidth: number): string[] => {
    if (!text) return [""];
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  /** Draws free-form multi-line text (the configurable message), wrapped to the full content width, preserving blank lines from the source template. */
  const drawParagraphs = (text: string, opts: { size: number; color?: ReturnType<typeof rgb> }) => {
    const size = opts.size;
    for (const rawLine of text.split("\n")) {
      if (!rawLine.trim()) {
        y -= size * 0.7;
        continue;
      }
      for (const line of wrapText(rawLine, size, CONTENT_WIDTH)) {
        page.drawText(line, { x: MARGIN, y, size, font, color: opts.color ?? INK });
        y -= size * 1.4;
      }
    }
  };

  const VALUE_X = MARGIN + 140;
  const VALUE_WIDTH = PAGE_WIDTH - MARGIN - VALUE_X;

  const drawRow = (label: string, value: string) => {
    const size = 11;
    const lines = wrapText(value, size, VALUE_WIDTH);
    page.drawText(label, { x: MARGIN, y, size: 10, font, color: MUTED });
    for (const line of lines) {
      page.drawText(line, { x: VALUE_X, y, size, font, color: INK });
      y -= 16;
    }
    y -= 8;
  };

  drawText("Účtenka", { size: 22, gap: 4 });
  drawText("Stěna Letňák Tišnov", { size: 11, color: MUTED, gap: 20 });
  drawRule();

  drawParagraphs(data.messageText, { size: 11 });
  y -= 12;
  drawRule();

  drawRow("Číslo objednávky", data.orderId);
  drawRow("Datum potvrzení", data.confirmedAtLabel);
  drawRow("Zákazník", data.buyerName ? `${data.buyerName} <${data.buyerEmail}>` : data.buyerEmail);
  if (data.dependentName) drawRow("Pro", data.dependentName);
  drawRow("Typ platby", data.paymentTypeLabel);
  drawRow("Položka", data.itemLabel);
  drawRow("Počet vstupů", String(data.credits));

  drawRule();
  drawText(`Celkem: ${data.amountLabel}`, { size: 14 });

  return pdfDoc.save();
}
