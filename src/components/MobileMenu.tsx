"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/** `<details>`-based dropdown that closes itself once a navigation completes. */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="group relative sm:hidden">
      <summary className="btn btn-secondary !px-2.5 !py-1.5 text-xs list-none [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 flex w-48 flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg">
        {children}
      </div>
    </details>
  );
}
