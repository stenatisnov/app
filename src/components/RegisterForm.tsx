"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { registerAction } from "@/app/actions";
import { PasswordInput } from "./PasswordInput";

/**
 * Registration takes a few seconds (password hashing, DB writes, admin
 * notification emails) — this makes that wait visible instead of leaving
 * the button looking like the click did nothing. `useFormStatus` only
 * works in a component rendered *inside* the `<form>`, hence the split
 * out of RegisterForm itself.
 */
function RegisterSubmitButton({ canSubmit, label, pendingLabel }: { canSubmit: boolean; label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!canSubmit || pending}
      className={`btn ${pending ? "btn-pending" : "btn-primary"} disabled:cursor-not-allowed disabled:opacity-90`}
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
    password: string;
    confirmPassword: string;
    showPassword: string;
    hidePassword: string;
    agreeRulesPrefix: string;
    agreeRulesLinkText: string;
    registerSubmit: string;
    registerSubmitPending: string;
  };
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedRules, setAgreedRules] = useState(false);

  const canSubmit =
    name.trim() !== "" &&
    email.trim() !== "" &&
    password.length >= 8 &&
    confirmPassword.length >= 8 &&
    password === confirmPassword &&
    agreedRules;

  return (
    <form action={registerAction} className="flex flex-col gap-3">
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
    </form>
  );
}
