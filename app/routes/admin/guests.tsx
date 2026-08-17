import { data } from "react-router";
import type { Route } from "./+types/guests";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { useTranslations } from "@/i18n/translations";
import { GuestCreateForm } from "@/components/GuestCreateForm";
import { GuestPassList } from "@/components/GuestPassList";
import {
  adminCreateGuestPassAction,
  adminDeleteGuestPassAction,
  adminDeleteGuestPassesAction,
  adminSendGuestPassEmailAction,
} from "@/lib/actions/admin-guests";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const passes = await prisma.guestPass.findMany({ orderBy: { createdAt: "desc" } });
    return data({
      passes: passes.map((p) => ({
        id: p.id,
        token: p.token,
        label: p.label,
        maxUses: p.maxUses,
        usedCount: p.usedCount,
        validFrom: p.validFrom.toISOString(),
        validTo: p.validTo.toISOString(),
      })),
    });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "createGuestPass":
        return adminCreateGuestPassAction(formData, request);
      case "deleteGuestPass":
        return adminDeleteGuestPassAction(String(formData.get("passId") || ""));
      case "deleteGuestPasses":
        return adminDeleteGuestPassesAction(formData.getAll("passIds").map(String));
      case "sendGuestPassEmail":
        return adminSendGuestPassEmailAction(formData, request);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminGuestsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("guests.title")}</h1>

      <details open className="card">
        <summary className="cursor-pointer font-medium">{t("guests.createTitle")}</summary>
        <div className="mt-3">
          <GuestCreateForm />
        </div>
      </details>

      <GuestPassList passes={loaderData.passes} />
    </div>
  );
}
