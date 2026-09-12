import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/stats";

/**
 * Lighter tone for the estimated series — a bar of it must never read as a
 * measured count, so it rides on top of the primary series in a washed-out
 * shade of the same colour rather than its own competing hue.
 */
const ESTIMATED_FILL = "color-mix(in srgb, var(--brand) 30%, var(--surface))";

function LegendSwatch({ label, fill }: { label: string; fill: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: fill }} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Bar chart with an optional second series stacked on top of the first, for
 * the statistics page: the primary series is what the app actually measured
 * (`GateEntry` rows), the secondary one is *estimated* from bank transfers
 * that never went through the app (see `src/lib/payment-entry-estimate.ts`).
 * The two share a bar so the total is visible, but never share a colour — an
 * estimate has to stay tellable apart from a count at a glance.
 */
export function StatsChart({
  title,
  data,
  secondary,
  primaryLabel,
  secondaryLabel,
  height = 340,
}: {
  title: string;
  data: ChartPoint[];
  /** Optional estimated series, bucketed with the same helper and therefore carrying the same labels. */
  secondary?: ChartPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  height?: number;
}) {
  const estimatedByLabel = new Map(secondary?.map((point) => [point.label, point.count]));
  const rows = data.map((point) => ({ ...point, estimated: estimatedByLabel.get(point.label) ?? 0 }));

  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">{title}</h3>
      {secondary && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          <LegendSwatch label={primaryLabel ?? ""} fill="var(--brand)" />
          <LegendSwatch label={secondaryLabel ?? ""} fill={ESTIMATED_FILL} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} fontSize={11} width={28} />
          <Tooltip />
          <Bar
            dataKey="count"
            name={primaryLabel}
            stackId="entries"
            fill="var(--brand)"
            radius={secondary ? [0, 0, 0, 0] : [3, 3, 0, 0]}
          />
          {secondary && (
            <Bar dataKey="estimated" name={secondaryLabel} stackId="entries" fill={ESTIMATED_FILL} radius={[3, 3, 0, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
