import { Link } from "@/i18n/navigation";

export function BrandLink({ brand }: { brand: string }) {
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
      <span className="min-w-0 truncate">{brand}</span>
    </Link>
  );
}
