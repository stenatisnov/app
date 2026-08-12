import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { PT_SANS_REGULAR_BASE64 } from "./fonts/pt-sans-regular";

const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 595;
const MARGIN = 40;
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
};

/**
 * Builds the PDF "účtenka" attached to the payment-confirmation email. Kept
 * separate from the (admin-configurable) email body — the itemized detail
 * always lives here, in a fixed layout, rather than in freely-editable text.
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

  const drawRow = (label: string, value: string) => {
    page.drawText(label, { x: MARGIN, y, size: 10, font, color: MUTED });
    page.drawText(value, { x: MARGIN + 140, y, size: 11, font, color: INK });
    y -= 24;
  };

  drawText("Účtenka", { size: 22, gap: 4 });
  drawText("Stěna Letňák Tišnov", { size: 11, color: MUTED, gap: 20 });
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

  y -= 20;
  drawText("Děkujeme za nákup.", { size: 10, color: MUTED });

  return pdfDoc.save();
}
