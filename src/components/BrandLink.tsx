import { Link } from "@/i18n/navigation";

/** `wrap`: let the name break onto a second line instead of truncating — used in the sidebar, which has room to spare vertically but is too narrow for the full name on one line. */
export function BrandLink({ brand, wrap = false }: { brand: string; wrap?: boolean }) {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2 font-[family-name:var(--font-brand)] text-lg font-semibold tracking-tight text-[var(--brand-dark)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={40}
        height={40}
        className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-[var(--line)]"
      />
      <span className={`min-w-0 ${wrap ? "leading-tight" : "truncate"}`}>{brand}</span>
    </Link>
  );
}
