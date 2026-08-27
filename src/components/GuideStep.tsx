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

/** Screenshot inline in a guide step — sized like a small phone mockup, not full-bleed, so it illustrates without dominating the step text. */
export function GuideImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="mt-2 w-full max-w-[200px] rounded-xl border border-[var(--line)] shadow-sm"
    />
  );
}

/** Row of GuideImages, for placing two or more screenshots side by side within a step. */
export function GuideImageRow({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-3">{children}</div>;
}
