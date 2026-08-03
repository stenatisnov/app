"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/stats";

export function StatsChart({ title, data }: { title: string; data: ChartPoint[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="mb-2 text-sm font-medium text-neutral-500">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-800" />
          <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} fontSize={11} width={28} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--color-brand)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
