import { useState } from "react";
import { useTranslations } from "@/i18n/translations";
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  applyFontScale,
  normalizeFontScale,
  storeFontScaleCookie,
  type FontScale,
} from "@/lib/font-scale";

/**
 * Slider on the account page (70–150 % in 5 % steps). Every move applies the
 * new size to `<html>` immediately — the page itself is the preview — and
 * stores the choice in a cookie for the next request; the initial value comes
 * from the server, which already rendered the page at that size.
 */
export function FontSizeSetting({ initialScale }: { initialScale: number }) {
  const t = useTranslations("account");
  const [scale, setScale] = useState<FontScale>(normalizeFontScale(initialScale));

  function change(next: number) {
    const normalized = normalizeFontScale(next);
    setScale(normalized);
    applyFontScale(normalized);
    storeFontScaleCookie(normalized);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <input
        type="range"
        min={Math.round(FONT_SCALE_MIN * 100)}
        max={Math.round(FONT_SCALE_MAX * 100)}
        step={Math.round(FONT_SCALE_STEP * 100)}
        value={Math.round(scale * 100)}
        onChange={(e) => change(Number(e.currentTarget.value) / 100)}
        aria-label={t("fontSizeTitle")}
        className="h-6 w-48 max-w-full cursor-pointer accent-[var(--brand)]"
      />
      <output aria-live="polite" className="min-w-14 text-sm font-medium tabular-nums text-[var(--ink)]">
        {t("fontSizeValue", { percent: Math.round(scale * 100) })}
      </output>
    </div>
  );
}
