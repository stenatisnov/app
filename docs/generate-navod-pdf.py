#!/usr/bin/env python3
"""Regenerates docs/navod-clenove.pdf — the printable member guide.

Run whenever the content of app/routes/navod.tsx (or its messages/cs.json
"guide" strings) changes; this script's body content is a hand-kept mirror of
that page's Czech copy, not derived from it programmatically. Keep the two in
sync by eye. Shared visual style lives in docs/_pdf_common.py — see also
generate-navod-staff-pdf.py, which uses the same look.

Requires: pip install weasyprint qrcode
Needs the "Noto Sans" and "Noto Serif" font families installed system-wide
(e.g. Fedora: dnf install google-noto-sans-fonts google-noto-serif-fonts).

Usage: python3 docs/generate-navod-pdf.py
"""
from pathlib import Path

from _pdf_common import card, option, qrbox, screenshot, step, tip, write_pdf, FOOTER

HERE = Path(__file__).resolve().parent
OUT = HERE / "navod-clenove.pdf"
SCREENS = HERE / "screens"


def build_body() -> str:
    intro = f"""
<div class="eyebrow">Provozní návod &middot; pro schválené i nové členy</div>
<h1>LETŇÁK &ndash; Lezecká stěna Tišnov</h1>
<p class="subtitle">Jak si založit účet, dobít kredity nebo permanentku, vstoupit na stěnu a vzít s sebou doprovod — krok za krokem.</p>
<hr class="rule-strong">
{qrbox("Odkaz na appku", "Naskenujte mobilem, nebo otevřete v prohlížeči:")}
"""

    sections = f"""
<div class="columns">

  <section>
    <h2>Než začnete</h2>
    {step(card(1, "Založte si účet",
          "<p>Na úvodní stránce klikněte na <em>Registrace</em>. Vyplňte jméno, e-mail, "
          "nepovinně telefon, datum narození a heslo (alespoň 8 znaků) a odešlete formulář.</p>"
          + tip("Aktivace účtu:", "K aktivaci účtu je nutné ověřit e-mailovou adresu — po registraci "
                "vám přijde ověřovací e-mail s odkazem. Pokud ho ve schránce nevidíte, zkontrolujte "
                "prosím i složku Spam.")),
          screenshot(SCREENS / "clen-01-registrace.png", "Registrační formulář na mobilu", width_mm=33))}
  </section>

  <section>
    <h2>Každá návštěva</h2>

    {card(1, "Přihlaste se",
          "<p>Zadejte e-mail a heslo. Přihlášení vydrží — appku si klidně přidejte na plochu telefonu.</p>")}

    {step(card(2, "Vstupte na stěnu",
          "<p>Na domovské stránce nejprve zaškrtněte (červený text) souhlas s provozním řádem — bez "
          "něj se vstupní tlačítko neaktivuje. Pak klikněte na velké tlačítko s počtem zbývajících "
          "vstupů. Appka nabídne tři možnosti:</p>"
          + option("Prokázat se obsluze", "v provozní době appka zobrazí QR kód — ukažte ho obsluze, "
                   "která vám naskenováním strhne vstup.")
          + option("Otevřít bránu", "mimo provozní dobu appka po potvrzení rovnou odemkne bránu a "
                   "odečte jeden vstup. Bránu otevírej pouze pokud vedle ní stojíš. Uslyšíš cvaknutí "
                   "a zámek se uvolní na 5 sekund. Bránu otevři tahem k sobě.")
          + option("Storno", "dialog zavře bez odečtení vstupu.")),
          screenshot(SCREENS / "clen-02b-vstup-volby.png", "Tři možnosti po kliknutí na vstupní tlačítko", width_mm=34))}
  </section>

  <section>
    <h2>Kredity a permanentky</h2>
    {step(card(1, "Dokupte si vstupy",
          "<p>V dolním menu na záložce <em>Koupit vstupy</em> vyberte balíček — buď jednotlivé vstupy "
          "(kredity), nebo časově neomezenou permanentku (týden / měsíc / rok, pokud je pro váš typ "
          "osoby nabízená). Zaplatit můžete:</p>"
          + option("QR platba", "naskenujte kód v bankovní appce; platba se spáruje automaticky podle "
                   "variabilního symbolu, obvykle do pár minut.")
          + option("GoPay", "okamžitá platba kartou nebo online, pokud je u vaší stěny zapnutá.")
          + tip("Nevidíte žádné balíčky?", "Znamená to, že vám zatím nebyl přiřazen typ osoby — "
                "napište administrátorovi.")
          + tip("Jen jeden vstup:", "Bez nákupu balíčku můžete na domovské stránce v sekci "
                "<em>Okamžitá platba za vstup</em> zadat částku a zaplatit rovnou na místě.")),
          screenshot(SCREENS / "clen-03-qr-platba.png", "Nákup vstupů — QR platba", width_mm=34))}
  </section>

  <section>
    <h2>Účet a doprovod</h2>

    {step(card(1, "Účet",
          "<p>Na záložce <em>Účet</em> najdete e-mail, telefon, přiřazený typ osoby, aktuální počet "
          "kreditů, možnost změnit heslo, doprovod a kompletní historii vstupů a plateb.</p>"),
          screenshot(SCREENS / "clen-05-muj-ucet.png", "Přehled účtu na záložce Účet", width_mm=34))}

    {step(card(2, "Přidejte doprovod",
          "<p>Ve stejné sekci <em>Doprovod</em> zadejte jméno a vyberte typ osoby (podle něj se určí "
          "cena). Doprovod nemá vlastní účet ani heslo — vše probíhá pod vaším přihlášením.</p>"),
          screenshot(SCREENS / "clen-04-doprovod.png", "Přidání doprovodu na záložce Účet", width_mm=35))}

    {card(3, "Dokupte mu vstupy a vstupte spolu",
          "<p>Na záložce <em>Koupit vstupy</em> přepněte nahoře v sekci <em>Pro koho</em> na jméno "
          "doprovodu a zaplaťte balíček stejně jako pro sebe (jen jednotlivé vstupy, časové "
          "permanentky pro doprovod nejsou). Na vstupním tlačítku pak doprovod zaškrtněte — appka "
          "odečte vstup vám i jemu najednou; výběr se přenese i do QR kódu pro obsluhu.</p>")}
  </section>

</div>
"""
    return intro + sections + FOOTER


if __name__ == "__main__":
    write_pdf(build_body(), OUT)
    print(f"wrote {OUT}")
