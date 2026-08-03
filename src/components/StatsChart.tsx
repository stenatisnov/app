"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/stats";

export function StatsChart({ title, data }: { title: string; data: ChartPoint[] }) {
  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} fontSize={11} width={28} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--brand)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
