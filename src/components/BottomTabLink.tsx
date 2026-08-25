import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** One tab in the mobile bottom nav — icon over a short label, highlights itself when it matches the current page. */
export function BottomTabLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className="flex min-w-0 flex-1 flex-col items-center justify-center py-0.5">
      <span
        className={`flex w-full min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1.5 py-1.5 transition-colors ${
          isActive ? "bg-white text-[var(--brand-dark)] shadow-[0_2px_6px_rgba(12,40,28,0.25)]" : "text-white/80"
        }`}
      >
        {icon}
        <span className={`w-full truncate text-center text-[0.7rem] tracking-wide ${isActive ? "font-bold" : "font-semibold"}`}>
          {label}
        </span>
      </span>
    </Link>
  );
}
