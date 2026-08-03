import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { GuestCreateForm } from "@/components/GuestCreateForm";
import { GuestPassList } from "@/components/GuestPassList";

export default async function AdminGuestsPage() {
  const t = await getTranslations("admin.guests");

  const passes = await prisma.guestPass.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <details open className="card">
        <summary className="cursor-pointer font-medium">{t("createTitle")}</summary>
        <div className="mt-3">
          <GuestCreateForm />
        </div>
      </details>

      <GuestPassList
        passes={passes.map((p) => ({
          id: p.id,
          token: p.token,
          label: p.label,
          maxUses: p.maxUses,
          usedCount: p.usedCount,
          validFrom: p.validFrom.toISOString(),
          validTo: p.validTo.toISOString(),
        }))}
      />
    </div>
  );
}
