import { useState } from "react";
import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/complete-profile";
import { withLoadContext } from "@/lib/request-context.server";
import { requireSession } from "@/lib/session.server";
import { getPrisma } from "@/lib/db.server";
import { completeGoogleProfileAction } from "@/lib/actions/auth";
import { useTranslations } from "@/i18n/translations";
import { StatusBanner } from "@/components/StatusBanner";
import { BirthDateInput, BIRTH_DATE_PATTERN } from "@/components/BirthDateInput";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const session = await requireSession(request, params.locale!);
    const prisma = await getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    // Anyone who already has a password or a birth date has nothing left to
    // complete here (either registered normally, or already finished this
    // step before) — nothing to gain by showing the form again.
    if (user.role !== "MEMBER" || user.passwordHash !== null || user.birthDate !== null) {
      throw redirect(`/${params.locale}`);
    }
    const error = new URL(request.url).searchParams.get("error") ?? undefined;
    return data({ error });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return completeGoogleProfileAction(formData, request, params.locale!);
  });
}

export default function CompleteProfilePage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("auth");
  const { error } = loaderData;
  const [birthDate, setBirthDate] = useState("");

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("completeProfileTitle")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("completeProfileHint")}</p>

      {error === "validation" && <StatusBanner tone="danger">{t("registerErrorValidation")}</StatusBanner>}

      <Form method="post" className="flex flex-col gap-3">
        <BirthDateInput
          label={t("birthDate")}
          pickerLabel={t("pickDate")}
          required
          value={birthDate}
          onChange={setBirthDate}
        />
        <button type="submit" disabled={!BIRTH_DATE_PATTERN.test(birthDate)} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
          {t("completeProfileSubmit")}
        </button>
      </Form>
    </div>
  );
}
