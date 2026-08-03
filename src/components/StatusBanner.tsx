const STYLES = {
  info: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  warning: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
} as const;

export function StatusBanner({
  tone = "info",
  children,
}: {
  tone?: keyof typeof STYLES;
  children: React.ReactNode;
}) {
  return <div className={`rounded-lg px-4 py-3 text-sm ${STYLES[tone]}`}>{children}</div>;
}
