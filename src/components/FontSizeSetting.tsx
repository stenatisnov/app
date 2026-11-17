import { useState } from "react";
import { useTranslations } from "@/i18n/translations";
import {
  FONT_SCALE_LEVELS,
  applyFontScale,
  normalizeFontScale,
  storeFontScaleCookie,
  type FontScale,
} from "@/lib/font-scale";

/**
 * − / A+ control on the account page. Every click applies the new size to
 * `<html>` immediately (so the page itself is the preview) and stores the
 * choice in a cookie for the next request; the initial value comes from the
 * server, which already rendered the page at that size.
 */
export function FontSizeSetting({ initialScale }: { initialScale: number }) {
  const t = useTranslations("account");
  const [scale, setScale] = useState<FontScale>(normalizeFontScale(initialScale));
  const index = FONT_SCALE_LEVELS.indexOf(scale);

  function change(nextIndex: number) {
    const clamped = Math.max(0, Math.min(nextIndex, FONT_SCALE_LEVELS.length - 1));
    const next = FONT_SCALE_LEVELS[clamped];
    setScale(next);
    applyFontScale(next);
    storeFontScaleCookie(next);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-secondary !px-3 !py-1.5 text-sm"
        onClick={() => change(index - 1)}
        disabled={index <= 0}
        aria-label={t("fontSizeDecrease")}
      >
        A−
      </button>
      <output aria-live="polite" className="min-w-14 text-center text-sm font-medium tabular-nums text-[var(--ink)]">
        {t("fontSizeValue", { percent: Math.round(scale * 100) })}
      </output>
      <button
        type="button"
        className="btn btn-secondary !px-3 !py-1.5 text-sm"
        onClick={() => change(index + 1)}
        disabled={index >= FONT_SCALE_LEVELS.length - 1}
        aria-label={t("fontSizeIncrease")}
      >
        A+
      </button>
    </div>
  );
}
