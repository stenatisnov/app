"use client";

import { useState } from "react";
import { CalendarIcon } from "./NavIcons";

export const BIRTH_DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;

/** Inserts the "/" separators as digits are typed, capping at DD/MM/YYYY. */
function formatBirthDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
}

/** DD/MM/YYYY -> YYYY-MM-DD for the native date-picker input, or "" while incomplete. */
function toIsoForPicker(display: string): string {
  if (!BIRTH_DATE_PATTERN.test(display)) return "";
  const [dd, mm, yyyy] = display.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** The native date input's YYYY-MM-DD value -> DD/MM/YYYY for display. */
function fromIsoPicker(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * DD/MM/YYYY birth-date field — auto-inserts slashes while typing, plus a
 * calendar button overlaying a native `<input type="date">` so it opens the
 * device's own date picker. Typing digits alone doesn't work well on mobile
 * (no auto-slash affordance without JS, which a plain server-rendered form
 * doesn't have), hence the picker as the more reliable path on phones.
 */
export function BirthDateInput({
  name = "birthDate",
  label,
  required,
  pickerLabel,
  value,
  onChange,
  inputClassName = "input",
}: {
  name?: string;
  label?: string;
  required?: boolean;
  /** Accessible label for the calendar-picker button. */
  pickerLabel: string;
  /** Omit for an uncontrolled input (the common case — value only needed via FormData on submit). */
  value?: string;
  onChange?: (value: string) => void;
  /** Base class for the visible text input — the calendar button's own spacing/positioning is added on top. */
  inputClassName?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const display = value ?? internalValue;
  const setDisplay = onChange ?? setInternalValue;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <label className="flex flex-col gap-1 text-sm text-[var(--muted)]">
      {label}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          name={name}
          placeholder="DD/MM/RRRR"
          pattern="\d{2}/\d{2}/\d{4}"
          autoComplete="bday"
          required={required}
          maxLength={10}
          className={`${inputClassName} pr-10`}
          value={display}
          onChange={(e) => setDisplay(formatBirthDateInput(e.target.value))}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted)]">
          <CalendarIcon className="h-4.5 w-4.5" />
        </div>
        <input
          type="date"
          tabIndex={-1}
          aria-label={pickerLabel}
          max={today}
          value={toIsoForPicker(display)}
          onChange={(e) => setDisplay(fromIsoPicker(e.target.value))}
          className="absolute inset-y-0 right-0 w-10 cursor-pointer opacity-0"
        />
      </div>
    </label>
  );
}
