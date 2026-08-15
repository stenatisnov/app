"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { HamburgerIcon } from "./NavIcons";

/**
 * Bottom-sheet dialog for secondary/role-specific nav items that don't fit
 * as primary tabs. Uses the same `<dialog>` pattern as EntryOptionsDialog
 * (native Escape/backdrop handling) rather than MobileMenu's old `<details>`
 * trick, and self-highlights its own trigger tab when the current route is
 * one of its own links, so users don't lose orientation.
 */
export function MoreSheet({
  label,
  heading,
  hrefs,
  children,
}: {
  label: string;
  heading: string;
  /** Every href reachable from inside this sheet — used only to decide whether the trigger tab should look "active". */
  hrefs: string[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const active = hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`));

  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.65rem] font-medium ${
          active ? "text-[var(--brand-dark)]" : "text-[var(--muted)]"
        }`}
      >
        <HamburgerIcon className="h-5 w-5" />
        <span>{label}</span>
      </button>
      <dialog
        ref={ref}
        className="sheet-dialog"
        onCancel={(e) => {
          e.preventDefault();
          ref.current?.close();
        }}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <h2 className="text-sm font-semibold text-[var(--muted)]">{heading}</h2>
        <div className="mt-2 flex flex-col gap-1">{children}</div>
      </dialog>
    </>
  );
}
