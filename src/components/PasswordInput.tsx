import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./NavIcons";

/** Password `<input>` with a show/hide toggle — same name/required/placeholder props as a plain input. */
export function PasswordInput({
  name,
  placeholder,
  required,
  minLength,
  autoComplete,
  hideLabel,
  showLabel,
  value,
  onChange,
}: {
  name: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  /** Accessible label for the toggle button when the password is visible (button then hides it). */
  hideLabel: string;
  /** Accessible label for the toggle button when the password is hidden (button then shows it). */
  showLabel: string;
  /** Omit for an uncontrolled input (the common case — value only needed via FormData on submit). */
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="input pr-10"
        {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) } : {})}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted)]"
      >
        {visible ? <EyeOffIcon className="h-4.5 w-4.5" /> : <EyeIcon className="h-4.5 w-4.5" />}
      </button>
    </div>
  );
}
