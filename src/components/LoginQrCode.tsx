import { useEffect, useState } from "react";
import { loginPath } from "@/lib/app-url";
import { qrDataUrl } from "@/lib/qr";

/**
 * Renders the login QR from the browser's actual origin, so the encoded URL
 * always matches the address the admin is on — regardless of server env
 * (APP_URL) or reverse-proxy host headers.
 */
export function LoginQrCode({ locale }: { locale: string }) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");

  useEffect(() => {
    const target = window.location.origin + loginPath(locale);
    setUrl(target);
    qrDataUrl(target).then(setQr).catch(() => {});
  }, [locale]);

  return (
    <>
      {qr ? (
        <img src={qr} alt="QR" width={260} height={260} />
      ) : (
        <div style={{ width: 260, height: 260 }} aria-hidden />
      )}
      <code className="text-xs text-[var(--muted)]">{url}</code>
    </>
  );
}
