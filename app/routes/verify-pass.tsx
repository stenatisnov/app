import { data } from "react-router";
import type { Route } from "./+types/verify-pass";
import { requireStaffOrAbove } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { PassVerificationCard } from "@/components/PassVerificationCard";
import {
  staffConfirmChildGroupEntryAction,
  staffConfirmEntryAction,
  staffConfirmGuestEntryAction,
  staffLookupGuestOrGroupAction,
  staffLookupUserForEntryAction,
} from "@/lib/actions/staff";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    return null;
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "lookupMember":
        return staffLookupUserForEntryAction(String(formData.get("email") || ""));
      case "lookupGuestOrGroup":
        return staffLookupGuestOrGroupAction(String(formData.get("value") || ""));
      case "confirmChildGroupEntry":
        return staffConfirmChildGroupEntryAction(request, formData.getAll("userIds").map(String));
      case "confirmMemberEntry": {
        const dependentIds = formData.getAll("dependentIds").map(String);
        const quantity = Math.max(1, Math.trunc(Number(formData.get("quantity")) || 1));
        const dependentQuantities: Record<string, number> = {};
        for (const id of dependentIds) {
          dependentQuantities[id] = Math.max(1, Math.trunc(Number(formData.get(`depQty_${id}`)) || 1));
        }
        return staffConfirmEntryAction(request, String(formData.get("userId") || ""), dependentIds, quantity, dependentQuantities);
      }
      case "confirmGuestEntry":
        return staffConfirmGuestEntryAction(request, String(formData.get("token") || ""));
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function VerifyPassPage() {
  return <PassVerificationCard />;
}
