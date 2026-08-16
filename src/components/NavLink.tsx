import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** Mobile nav-menu link that highlights itself when it matches the current page, instead of a fixed item always looking selected. */
export function NavLink({
  href,
  children,
  layout = "list",
}: {
  href: string;
  children: ReactNode;
  /** "list" = full-width row (hamburger dropdown); "row" = wrapping pill button (flat button-bar menu, admin-nav style). */
  layout?: "list" | "row";
}) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const layoutClass = layout === "list" ? "w-full !justify-start !px-3 !py-2 text-sm" : "!px-3 !py-1.5 text-sm";

  return (
    <Link href={href} className={`btn ${isActive ? "btn-primary" : "btn-secondary"} ${layoutClass}`}>
      {children}
    </Link>
  );
}
