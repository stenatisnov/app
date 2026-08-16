import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { PasswordInput } from "./PasswordInput";
import { BirthDateInput, BIRTH_DATE_PATTERN } from "./BirthDateInput";

/**
 * Registration takes a few seconds (password hashing, DB writes, admin
 * notification emails) — this makes that wait visible instead of leaving
 * the button looking like the click did nothing. `useFormStatus` (react-dom)
 * only tracks React 19's native form-action submissions — it never reports
 * `pending` for React Router's own `<Form>`, which handles the submission
 * itself via fetch rather than a native form action. `useNavigation()` is
 * React Router's own equivalent and isn't scoped to being rendered inside
 * the `<form>`, but the split-out button component is kept anyway to match
 * the rest of the file's shape.
 */
function RegisterSubmitButton({ canSubmit, label, pendingLabel }: { canSubmit: boolean; label: string; pendingLabel: string }) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <button
      type="submit"
      disabled={!canSubmit || pending}
      className={`btn ${pending ? "btn-pending cursor-wait" : "btn-primary disabled:cursor-not-allowed disabled:opacity-50"}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Registration form — the submit button stays disabled until every required field is filled and the two password fields match. */
export function RegisterForm({
  labels,
}: {
  labels: {
    name: string;
    email: string;
    phone: string;
    birthDate: string;
    pickDate: string;
    password: string;
    confirmPassword: string;
    showPassword: string;
    hidePassword: string;
    passwordTooShort: string;
    passwordMismatch: string;
    agreeRulesPrefix: string;
    agreeRulesLinkText: string;
    registerSubmit: string;
    registerSubmitPending: string;
  };
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedRules, setAgreedRules] = useState(false);

  const canSubmit =
    name.trim() !== "" &&
    email.trim() !== "" &&
    BIRTH_DATE_PATTERN.test(birthDate) &&
    password.length >= 8 &&
    confirmPassword.length >= 8 &&
    password === confirmPassword &&
    agreedRules;

  return (
    <Form method="post" className="flex flex-col gap-3">
      <input
        type="text"
        name="name"
        placeholder={labels.name}
        required
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="email"
        name="email"
        placeholder={labels.email}
        required
        className="input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input type="tel" name="phone" placeholder={labels.phone} className="input" />
      <BirthDateInput
        label={labels.birthDate}
        required
        pickerLabel={labels.pickDate}
        value={birthDate}
        onChange={setBirthDate}
      />
      <PasswordInput
        name="password"
        placeholder={labels.password}
        required
        minLength={8}
        autoComplete="new-password"
        showLabel={labels.showPassword}
        hideLabel={labels.hidePassword}
        value={password}
        onChange={setPassword}
      />
      {password.length > 0 && password.length < 8 && (
        <p className="-mt-2 text-xs text-[var(--danger)]">{labels.passwordTooShort}</p>
      )}
      <PasswordInput
        name="confirmPassword"
        placeholder={labels.confirmPassword}
        required
        minLength={8}
        autoComplete="new-password"
        showLabel={labels.showPassword}
        hideLabel={labels.hidePassword}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {confirmPassword.length > 0 && password !== confirmPassword && (
        <p className="-mt-2 text-xs text-[var(--danger)]">{labels.passwordMismatch}</p>
      )}

      <label className="flex items-start gap-2.5 rounded-lg border border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2.5 text-sm font-medium text-[var(--ink)]">
        <input
          type="checkbox"
          name="agreedRules"
          required
          className="mt-0.5 h-4 w-4 flex-none accent-[var(--brand)]"
          checked={agreedRules}
          onChange={(e) => setAgreedRules(e.target.checked)}
        />
        <span>
          {labels.agreeRulesPrefix}{" "}
          <a
            href="https://stenatisnov.cz/wp-content/uploads/2026/04/Provozni_rad_FINAL.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--brand)] underline decoration-2 underline-offset-2"
          >
            {labels.agreeRulesLinkText}
          </a>
          .
        </span>
      </label>

      <RegisterSubmitButton canSubmit={canSubmit} label={labels.registerSubmit} pendingLabel={labels.registerSubmitPending} />
    </Form>
  );
}
