import type { ReactNode } from "react";

/** Numbered step block shared by the member (/navod) and staff (/navod-staff) guides. */
export function GuideStep({
  number,
  title,
  body,
  children,
}: {
  number: number;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-[var(--brand)] bg-[var(--bg-accent)] text-sm font-bold text-[var(--brand-dark)]">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-[var(--ink)]">{title}</h3>
        {body && <p className="mt-1 text-sm text-[var(--ink)]">{body}</p>}
        {children}
      </div>
    </div>
  );
}

export function GuidePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-[var(--brand)] bg-[var(--bg-accent)] px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-[var(--brand-dark)]">
      {children}
    </span>
  );
}
