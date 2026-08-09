/** Round initial badge used in place of a generic icon on the "account" nav item. */
export function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--warn)] text-[0.65rem] font-semibold text-white ${className ?? ""}`}
    >
      {initial}
    </span>
  );
}
