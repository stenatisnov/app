const STYLES = {
  info: "banner-ok",
  warning: "banner-warn",
  danger: "banner-danger",
} as const;

export function StatusBanner({
  tone = "info",
  dense = false,
  children,
}: {
  tone?: keyof typeof STYLES;
  /** Tighter padding/font-size on mobile — for persistent chrome (e.g. the test-operation banner), not for in-content warnings/errors. */
  dense?: boolean;
  children: React.ReactNode;
}) {
  return <div className={`banner ${STYLES[tone]}${dense ? " banner-dense" : ""}`}>{children}</div>;
}
