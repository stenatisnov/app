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
      <button type="button" onClick={() => ref.current?.showModal()} className="flex flex-1 flex-col items-center justify-center py-0.5">
        <span
          className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition-colors ${
            active ? "bg-white text-[var(--brand-dark)] shadow-[0_2px_6px_rgba(12,40,28,0.25)]" : "text-white/80"
          }`}
        >
          <HamburgerIcon className="h-6 w-6" />
          <span className={`text-[0.7rem] tracking-wide ${active ? "font-bold" : "font-semibold"}`}>{label}</span>
        </span>
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
