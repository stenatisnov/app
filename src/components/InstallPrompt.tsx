import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/translations";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Android/desktop Chrome & Edge fire `beforeinstallprompt`, which we capture
 * and trigger later from our own button (the browser's native mini-infobar
 * is suppressed via `preventDefault`). iOS Safari never fires that event —
 * there's no programmatic install API there, so it gets a "how to" banner
 * (Share -> Add to Home Screen) instead. Hidden entirely once installed
 * (standalone display mode) or dismissed.
 */
export function InstallPrompt() {
  const t = useTranslations("pwa");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === "1") return;

    if (isIos()) {
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="card mx-auto flex w-full max-w-sm flex-col gap-2 text-center">
      <p className="font-medium text-[var(--ink)]">{t("title")}</p>
      <p className="text-sm text-[var(--muted)]">{showIosHint ? t("iosDescription") : t("description")}</p>
      <div className="flex justify-center gap-2">
        {!showIosHint && (
          <button type="button" onClick={install} className="btn btn-primary">
            {t("installButton")}
          </button>
        )}
        <button type="button" onClick={dismiss} className="btn btn-secondary">
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
