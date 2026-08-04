"use client";

import { useEffect } from "react";

/** Registers the no-op service worker required for PWA installability (beforeinstallprompt). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
