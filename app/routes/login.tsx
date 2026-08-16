import { data } from "react-router";
import type { Route } from "./+types/login";
import { LoginCard } from "@/components/LoginCard";
import { QuickPaymentQr } from "@/components/QuickPaymentQr";
import { getQrPaymentSettings } from "@/lib/settings";
import { loginAction } from "@/lib/actions/auth";
import { getEnv } from "@/lib/env";
import { withLoadContext } from "@/lib/request-context.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const qrSettings = await getQrPaymentSettings();
    const env = getEnv();
    const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    const qrConfigured = qrSettings.quickPaymentEnabled && Boolean(qrSettings.accountNumber && qrSettings.bankCode);
    const error = new URL(request.url).searchParams.get("error") ?? undefined;
    return data({ googleEnabled, qrConfigured, error });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return loginAction(formData, request, params.locale!);
  });
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { googleEnabled, qrConfigured, error } = loaderData;

  return (
    <div className="flex flex-col gap-4">
      <LoginCard error={error} googleEnabled={googleEnabled} />
      {qrConfigured && <QuickPaymentQr />}
    </div>
  );
}
