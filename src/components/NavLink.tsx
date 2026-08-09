"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** Mobile nav-menu link that highlights itself when it matches the current page, instead of a fixed item always looking selected. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`btn ${isActive ? "btn-primary" : "btn-secondary"} w-full !justify-start gap-2 !px-3 !py-2 text-sm`}
    >
      {children}
    </Link>
  );
}
