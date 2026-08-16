import { data } from "react-router";
import type { Route } from "./+types/guest.$token";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { formatAppDate } from "@/lib/time";
import { useTranslations } from "@/i18n/i18n.client";
import { GuestOpenButton } from "@/components/GuestOpenButton";
import { checkGateOnlineAction, openGuestGateAction } from "@/lib/actions/gate";

export async function loader({ params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const pass = await prisma.guestPass.findUnique({ where: { token: params.token } });
    if (!pass) throw data(null, { status: 404 });

    return data({
      label: pass.label,
      validTo: pass.validTo,
      remaining: Math.max(pass.maxUses - pass.usedCount, 0),
    });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "openGuestGate":
        return openGuestGateAction(String(formData.get("token") || ""), formData.get("openGate") === "true");
      case "checkGateOnline":
        return checkGateOnlineAction();
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function GuestPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("guest");
  const { label, validTo, remaining } = loaderData;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{label || t("title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("validUntil", { date: formatAppDate(validTo) })}</p>
      <GuestOpenButton token={params.token} initialRemaining={remaining} />
    </div>
  );
}
