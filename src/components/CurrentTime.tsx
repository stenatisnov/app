"use client";

import { useEffect, useState } from "react";
import { APP_TZ } from "@/lib/time";

/** Live Europe/Prague clock — gives members a reference point for group opening windows. */
export function CurrentTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <time className="text-xs text-neutral-400" dateTime={now.toISOString()}>
      {new Intl.DateTimeFormat("cs-CZ", { timeZone: APP_TZ, timeStyle: "medium" }).format(now)}
    </time>
  );
}
