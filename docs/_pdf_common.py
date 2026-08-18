"""Shared building blocks for docs/generate-navod-*.py — one visual style for
both the member and staff printable guides. Keep this the single source of
truth for the look; don't fork the CSS between the two generator scripts.
"""
import base64
import io
from pathlib import Path

import qrcode
from weasyprint import HTML

APP_URL = "https://stenatisnov.app"

STYLE = """
  @page { size: A4; margin: 18mm 16mm 16mm 16mm; }
  :root {
    --ink: #20272A;
    --slate: #5B6560;
    --muted: #55605C;
    --accent: #B8791F;
    --badge-bg: #F5EDE2;
    --badge-text: #3D2A08;
    --card-border: #DDE2DA;
    --tip-bg: #E7EDF1;
    --tip-accent: #3D6B8C;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Serif", serif; color: var(--ink); font-size: 11.4pt; }

  .eyebrow {
    font-family: "Noto Sans", sans-serif; text-transform: uppercase; letter-spacing: 0.09em;
    color: var(--accent); font-weight: 700; font-size: 8.6pt; margin-bottom: 3mm;
  }
  h1 { font-family: "Noto Sans", sans-serif; font-weight: 800; font-size: 23pt; color: var(--ink); margin: 0 0 2.5mm; }
  .subtitle { font-family: "Noto Serif", serif; color: var(--muted); font-size: 11.4pt; margin: 0 0 4mm; max-width: 150mm; }
  .rule-strong { border: none; border-top: 1.6pt solid var(--ink); margin: 0 0 5mm; }

  .qrbox {
    border: 1px solid var(--card-border); border-radius: 8px; padding: 4mm 5mm;
    display: flex; align-items: center; gap: 5mm; margin-bottom: 6mm;
  }
  .qrbox img { width: 22mm; height: 22mm; border: 1px solid var(--card-border); border-radius: 4px; padding: 1mm; flex: 0 0 auto; }
  .qr-title { font-family: "Noto Sans", sans-serif; font-weight: 700; color: var(--ink); font-size: 11.4pt; margin-bottom: 1mm; }
  .qr-desc { font-family: "Noto Serif", serif; color: var(--muted); font-size: 10.6pt; margin-bottom: 1.5mm; }
  .qr-link { font-family: "Noto Sans", sans-serif; font-weight: 700; color: var(--accent); text-decoration: underline; font-size: 13pt; }

  .columns { column-count: 2; column-gap: 9mm; column-rule: 1px solid var(--card-border); }
  .columns.single-col { column-count: 1; column-rule: none; }
  section { break-inside: auto; }
  /* Manual page break before a section, for explicit control over which
     sections land on which printed page — independent of how much room
     is left in the current page's columns. */
  section.new-page { break-before: page; }
  /* Single-column guides have few, tall sections — a mid-section break
     leaves an orphaned heading with a lot of trailing blank space below it.
     Starting each section on a fresh page reads as a deliberate chapter
     break instead. The two-column member guide packs tighter and doesn't
     need this. */
  .columns.single-col section + section { break-before: page; }
  h2 {
    font-family: "Noto Sans", sans-serif; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--accent); font-weight: 800; font-size: 13.5pt; margin: 0 0 2.5mm;
    padding-bottom: 1.3mm; border-bottom: 1.4pt solid var(--accent); break-after: avoid;
  }
  section + section h2 { margin-top: 6mm; }
  .section-intro {
    font-family: "Noto Serif", serif; color: var(--muted); font-size: 9.8pt; line-height: 1.35;
    margin: 0 0 3mm;
  }

  .card {
    display: flex; gap: 3.5mm; border: 1px solid var(--card-border); border-radius: 9px;
    padding: 2.6mm 3.8mm; margin-bottom: 2.8mm; break-inside: avoid;
  }
  .badge {
    flex: 0 0 auto; width: 10mm; height: 10mm; background: var(--badge-bg);
    border: 1.4pt solid var(--accent); border-radius: 6px; display: flex; align-items: center;
    justify-content: center; font-family: "Noto Sans", sans-serif; font-weight: 700;
    color: var(--badge-text); font-size: 12.5pt;
  }
  .content { flex: 1; min-width: 0; }
  .content .title { font-family: "Noto Sans", sans-serif; font-weight: 700; color: var(--ink); font-size: 11.8pt; margin-bottom: 1mm; }
  .content p { font-family: "Noto Serif", serif; color: var(--ink); font-size: 10.4pt; line-height: 1.3; margin: 0 0 1.2mm; }
  .content p:last-child { margin-bottom: 0; }

  .option { margin-top: 1.5mm !important; }
  .bullet {
    display: inline-block; width: 5px; height: 5px; border: 1.3pt solid var(--accent);
    border-radius: 50%; margin-right: 5px; vertical-align: middle;
  }
  .pill {
    display: inline-block; font-family: "Noto Sans", sans-serif; font-weight: 700; font-size: 10pt;
    color: var(--badge-text); background: var(--badge-bg); border: 1.3pt solid var(--accent);
    border-radius: 999px; padding: 0.5mm 3mm;
  }

  .tip {
    background: var(--tip-bg); border-left: 3pt solid var(--tip-accent); border-radius: 5px;
    padding: 2mm 3.5mm; margin-top: 2mm !important; font-size: 10.1pt; line-height: 1.35;
    break-inside: avoid;
  }
  .tip strong { font-family: "Noto Sans", sans-serif; color: var(--tip-accent); }

  .shot { text-align: center; margin: 0 0 2.5mm; break-inside: avoid; }
  .shot img {
    width: 100%; border: 1px solid var(--card-border); border-radius: 10px;
    box-shadow: 0 1.5pt 4pt rgba(32, 39, 42, 0.16);
  }
  .shot .cap {
    font-family: "Noto Sans", sans-serif; font-weight: 700; color: var(--slate);
    font-size: 8.4pt; margin-top: 1.5mm;
  }

  .footer-rule { border: none; border-top: 1px solid var(--card-border); margin: 4mm 0 3mm; }
  .footer { font-family: "Noto Serif", serif; color: var(--muted); font-size: 9.8pt; margin: 0; }
  .footer a { color: var(--accent); text-decoration: underline; }
  em { font-style: italic; }
"""

FOOTER = """
<hr class="footer-rule">
<p class="footer">Technický problém s appkou nebo bránou? Napište na
  <a href="mailto:aplikace@stenatisnov.cz">aplikace@stenatisnov.cz</a> nebo volejte
  <a href="tel:+420774983511">+420 774 983 511</a>.</p>
"""


def qr_data_uri(url: str = APP_URL) -> str:
    buf = io.BytesIO()
    qrcode.make(url, border=1).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def qrbox(title: str, desc: str, link_text: str = "stenatisnov.app") -> str:
    return f"""
<div class="qrbox">
  <img src="{qr_data_uri()}" alt="QR">
  <div>
    <div class="qr-title">{title}</div>
    <div class="qr-desc">{desc}</div>
    <a class="qr-link" href="{APP_URL}">{link_text}</a>
  </div>
</div>"""


def card(num, title, body_html) -> str:
    return f"""
    <div class="card">
      <div class="badge">{num}</div>
      <div class="content">
        <div class="title">{title}</div>
        {body_html}
      </div>
    </div>"""


def step(*parts: str) -> str:
    """Concatenates a card and its screenshot (or any other parts). Deliberately *not* wrapped in a
    break-inside:avoid group: `.card` and `.shot` are each already atomic on their own, and letting
    the pager split between them (rather than forcing the whole pair to jump columns as one block)
    is what keeps columns packed instead of leaving a card-sized gap behind."""
    return "".join(parts)


def section_intro(text: str) -> str:
    return f'<p class="section-intro">{text}</p>'


def option(label, text) -> str:
    return f'<p class="option"><span class="bullet"></span><span class="pill">{label}</span> — {text}</p>'


def tip(lead, text) -> str:
    return f'<div class="tip"><strong>{lead}</strong> {text}</div>'


def screenshot(path: Path, caption: str, width_mm: int = 52) -> str:
    """Embeds a PNG screenshot (from docs/screens/) with a caption below it."""
    b64 = base64.b64encode(Path(path).read_bytes()).decode()
    return f"""
<div class="shot" style="max-width: {width_mm}mm; margin-left: auto; margin-right: auto;">
  <img src="data:image/png;base64,{b64}" alt="{caption}">
  <div class="cap">{caption}</div>
</div>"""


def page_shell(body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"><style>{STYLE}</style></head>
<body>{body}</body>
</html>"""


def write_pdf(body: str, out_path) -> None:
    HTML(string=page_shell(body)).write_pdf(str(out_path))
