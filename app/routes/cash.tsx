import { data } from "react-router";
import type { Route } from "./+types/cash";
import { requireStaffOrAbove } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { recordCashPaymentAction } from "@/lib/actions/cash";
import { CashForm } from "@/components/CashForm";

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
      case "recordCash":
        return recordCashPaymentAction(formData, request);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function CashPage() {
  return <CashForm />;
}
