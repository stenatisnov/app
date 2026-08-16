import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { importDataFromYaml, type ImportSummary } from "@/lib/data-transfer";

// ---------------------------------------------------------------------------
// Admin — data export/import
// ---------------------------------------------------------------------------

export type ImportDataResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: "empty" | "parse_error"; message: string };

export async function adminImportDataAction(formData: FormData): Promise<ImportDataResult> {
  const prisma = await getPrisma();

  const file = formData.get("file");
  const pasted = String(formData.get("yaml") || "");
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;

  if (!text.trim()) return { ok: false, error: "empty", message: "Nebyl zadán žádný obsah k importu." };

  let summary: ImportSummary;
  try {
    summary = await importDataFromYaml(prisma, text);
  } catch (err) {
    return { ok: false, error: "parse_error", message: err instanceof Error ? err.message : String(err) };
  }

  await audit({
    action: "admin.data.import",
    success: true,
    meta: {
      personTypes: summary.personTypes,
      packages: summary.packages,
      groups: summary.groups,
      users: summary.users,
      periodPasses: summary.periodPasses,
      dependents: summary.dependents,
      guestPasses: summary.guestPasses,
      errorCount: summary.errors.length,
    },
  });

  return { ok: true, summary };
}
