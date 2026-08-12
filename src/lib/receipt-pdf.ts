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

/**
 * Builds the PDF "účtenka" attached to the payment-confirmation email. The
 * body is entirely the admin-configured text (Admin > Nastavení, with its
 * `{PAYMENT_TYPE}`/`{AMOUNT}`/`{CREDITS}` placeholders already substituted
 * by the caller) — no itemized breakdown is added on top of it. Only the
 * title/branding lines are fixed.
 *
 * Uses `pdf-lib` + `@pdf-lib/fontkit` with an embedded PT Sans font (rather
 * than one of pdf-lib's built-in standard fonts) because the standard fonts
 * only support WinAnsi/MacRoman encoding, neither of which has Czech
 * diacritics (č, ř, š, ů, ...) — drawing those with a standard font either
 * throws or silently drops the glyph. PT Sans is bundled as a base64
 * module (`./fonts/pt-sans-regular`) rather than read from disk since the
 * D1/Workers branch has no filesystem.
 */
export async function generateReceiptPdf(messageText: string): Promise<Uint8Array> {
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

  /** Draws free-form multi-line text, wrapped to the full content width, preserving blank lines from the source template. */
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

  drawText("Účtenka", { size: 22, gap: 4 });
  drawText("Stěna Letňák Tišnov", { size: 11, color: MUTED, gap: 20 });
  drawRule();

  drawParagraphs(messageText, { size: 11 });

  return pdfDoc.save();
}
