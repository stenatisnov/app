import { LoginCard } from "@/components/LoginCard";
import { QuickPaymentQr } from "@/components/QuickPaymentQr";
import { getQrPaymentSettings } from "@/lib/settings";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, qrSettings] = await Promise.all([searchParams, getQrPaymentSettings()]);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const qrConfigured = qrSettings.quickPaymentEnabled && Boolean(qrSettings.accountNumber && qrSettings.bankCode);

  return (
    <div className="flex flex-col gap-4">
      <LoginCard error={error} googleEnabled={googleEnabled} />
      {qrConfigured && <QuickPaymentQr />}
    </div>
  );
}
