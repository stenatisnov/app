import { data } from "react-router";
import type { Route } from "./+types/verify-pass";
import { requireStaffOrAbove } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { PassVerificationCard } from "@/components/PassVerificationCard";
import {
  staffConfirmEntryAction,
  staffConfirmGuestEntryAction,
  staffLookupGuestForEntryAction,
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
      case "lookupGuest":
        return staffLookupGuestForEntryAction(String(formData.get("token") || ""));
      case "confirmMemberEntry":
        return staffConfirmEntryAction(request, String(formData.get("userId") || ""), formData.getAll("dependentIds").map(String));
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
