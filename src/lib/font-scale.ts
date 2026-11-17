/**
 * Per-device text-size preference set from Můj účet → Velikost písma.
 *
 * The whole UI sizes itself in `rem` (Tailwind's text/spacing utilities all
 * derive from the root font size), so scaling `html` is enough to resize
 * everything proportionally. The choice is stored in a cookie rather than
 * the database: it's a local display preference, it must apply instantly
 * without a server round-trip, and reading it in the root loader means the
 * first server-rendered paint already has the right size (no flash), even
 * for an anonymous page. A cookie is per-device, which matches that.
 */

export const FONT_SCALE_COOKIE = "stena_font_scale";

/** Steps offered by the account-page control; 1 (100 %) is the default. */
export const FONT_SCALE_LEVELS = [0.9, 1, 1.1, 1.2, 1.3] as const;

export type FontScale = (typeof FONT_SCALE_LEVELS)[number];

export const DEFAULT_FONT_SCALE: FontScale = 1;

/** The browser default root size the levels are relative to. */
const BASE_FONT_PX = 16;

/** Snaps any stored/tampered value to the nearest offered level. */
export function normalizeFontScale(value: number): FontScale {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  return FONT_SCALE_LEVELS.reduce<FontScale>(
    (best, level) => (Math.abs(level - value) < Math.abs(best - value) ? level : best),
    DEFAULT_FONT_SCALE,
  );
}

/** Reads the preference from a request's `Cookie` header (root/account loaders). */
export function parseFontScaleCookie(cookieHeader: string | null): FontScale {
  if (!cookieHeader) return DEFAULT_FONT_SCALE;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== FONT_SCALE_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return DEFAULT_FONT_SCALE;
    const value = Number(raw);
    return Number.isFinite(value) ? normalizeFontScale(value) : DEFAULT_FONT_SCALE;
  }
  return DEFAULT_FONT_SCALE;
}

/** CSS `font-size` for `<html>` corresponding to a scale. */
export function fontScaleCss(scale: number): string {
  return `${Math.round(BASE_FONT_PX * normalizeFontScale(scale) * 100) / 100}px`;
}

/** Applies a scale to the current document immediately — no reload needed. */
export function applyFontScale(scale: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = fontScaleCss(scale);
}

/** Persists the choice for subsequent page loads (the immediate visual change is `applyFontScale`). */
export function storeFontScaleCookie(scale: number): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${FONT_SCALE_COOKIE}=${normalizeFontScale(scale)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
