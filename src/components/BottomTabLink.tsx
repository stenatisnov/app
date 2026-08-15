"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** One tab in the mobile bottom nav — icon over a short label, highlights itself when it matches the current page. */
export function BottomTabLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.65rem] font-medium ${
        isActive ? "text-[var(--brand-dark)]" : "text-[var(--muted)]"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
