import { addMonths, addWeeks, addYears } from "date-fns";
import type { PeriodPreset, PricePackage } from "@prisma/client";
import { getPrisma } from "./db";

/** i18n message key under the `buy` namespace for a period preset label. */
export function periodLabelKey(
  preset: PeriodPreset | null | undefined,
): "periodWeek" | "periodMonth" | "periodYear" | "periodCustom" {
  switch (preset) {
    case "WEEK":
      return "periodWeek";
    case "MONTH":
      return "periodMonth";
    case "YEAR":
      return "periodYear";
    default:
      return "periodCustom";
  }
}

/**
 * Resolves the concrete validity window for a PERIOD package at purchase
 * (or confirmation) time. WEEK/MONTH/YEAR presets start "now"; CUSTOM
 * packages carry an admin-defined absolute window instead.
 */
export function resolvePeriodBounds(
  pkg: Pick<PricePackage, "periodPreset" | "periodFrom" | "periodTo">,
  from = new Date(),
): { validFrom: Date; validTo: Date; label: string } | null {
  const preset = pkg.periodPreset ?? "CUSTOM";

  if (preset === "CUSTOM") {
    if (!pkg.periodFrom || !pkg.periodTo || pkg.periodTo <= pkg.periodFrom) return null;
    return { validFrom: pkg.periodFrom, validTo: pkg.periodTo, label: "Time package" };
  }

  const validFrom = from;
  const validTo =
    preset === "WEEK" ? addWeeks(from, 1) : preset === "MONTH" ? addMonths(from, 1) : addYears(from, 1);

  return { validFrom, validTo, label: `Unlimited entries — ${preset.toLowerCase()}` };
}

export async function findActiveAccessPass(userId: string, at = new Date()) {
  const prisma = await getPrisma();
  return prisma.userAccessPass.findFirst({
    where: { userId, validFrom: { lte: at }, validTo: { gte: at } },
    orderBy: { validTo: "desc" },
  });
}
