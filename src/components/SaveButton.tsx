import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const SAVED_VISIBLE_MS = 3000;

/**
 * Submit button for a `<form action={serverAction}>` that shows a brief
 * "Saved" confirmation underneath itself once the action completes.
 * `useFormStatus` reads pending state from the nearest enclosing <form>,
 * so this works with the plain form-action pattern used throughout the
 * admin settings page without changing any of the actions themselves.
 */
export function SaveButton({
  label,
  savedLabel,
  buttonClassName,
  wrapperClassName,
}: {
  label: string;
  savedLabel: string;
  buttonClassName: string;
  wrapperClassName?: string;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), SAVED_VISIBLE_MS);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <div className={`flex flex-col items-start gap-1 ${wrapperClassName ?? ""}`}>
      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? "…" : label}
      </button>
      {showSaved && <p className="text-xs text-[var(--ok)]">{savedLabel}</p>}
    </div>
  );
}
