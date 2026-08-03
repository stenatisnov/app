const STYLES = {
  info: "banner-ok",
  warning: "banner-warn",
  danger: "banner-danger",
} as const;

export function StatusBanner({
  tone = "info",
  children,
}: {
  tone?: keyof typeof STYLES;
  children: React.ReactNode;
}) {
  return <div className={`banner ${STYLES[tone]}`}>{children}</div>;
}
