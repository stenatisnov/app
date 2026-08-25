import { redirect } from "react-router";
import type { Route } from "./+types/stop-impersonation";
import { stopImpersonationAction } from "@/lib/actions/auth";
import { withLoadContext } from "@/lib/request-context.server";

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, () => stopImpersonationAction(request, params.locale!));
}

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/${params.locale}`);
}
