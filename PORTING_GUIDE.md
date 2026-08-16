# Porting `app` (Next.js) → `app-rr` (React Router v7) — conventions

This is the single source of truth for how every remaining file gets ported. Read it fully
before touching any file. The architecture (auth, session, i18n, routing) is already built and
working — follow it exactly, don't invent alternatives.

## Already built (read these before porting anything)

- `app/root.tsx` — document shell, locale detection, font/manifest links, `I18nProvider`.
- `app/routes.ts` — full route table (every path → file mapping already decided).
- `app/routes/_shell.tsx` — the `/:locale` layout route (session lookup, renders `AppShell`).
- `app/routes/root-redirect.tsx` — bare `/` → `/cs` or `/en`.
- `app/routes/login.tsx`, `app/routes/logout.tsx` — **the reference pattern** for a page with a
  loader + a form action, including the `withLoadContext` wrapper (see below).
- `src/lib/request-context.server.ts` — **read this first.** `context` (React Router's
  `AppLoadContext`, where the D1 binding will live on the deployable branch) is never threaded
  through function signatures. Instead, every route's `loader`/`action` wraps its entire body in
  `withLoadContext(context, async () => { ... })`, once, right where RR7 hands it `context`. Every
  lib function that needs the DB or env vars then just calls the zero-arg `getPrisma()`/`getEnv()`
  ambiently — **this is what lets `gate.ts`/`payments.ts`/`settings.ts`/etc. port with their
  existing signatures completely unchanged**, instead of adding a `context` parameter to dozens of
  functions and every call site. This mirrors how the real D1 branch's `getPrisma()` already works
  (backed by `getCloudflareContext()`'s own ambient lookup) — this file reproduces the same shape.
- `src/lib/session.server.ts` — `getSessionUser`, `requireSession`/`requireAdmin`/
  `requireStaffOrAbove`/`requireRoot`, `createUserSession`/`destroySession`, `canUseApp`. All take
  `request` (still an explicit param — it's already a mandatory loader/action arg in RR7) but never
  `context`.
- `src/lib/env.ts` — `getEnv()`, zero-arg, the per-branch env-var seam (mirrors `db.ts`).
- `src/lib/google-auth.server.ts` — arctic-based Google OAuth helper, zero-arg env access.
- `src/lib/actions/auth.ts` — **the reference pattern** for porting a group of server actions
  (login/register/password-reset/verify-email — all fully ported already, read this file). Note
  the signature: `(formData, request, locale)` — no `context`.
- `src/i18n/routing.ts`, `src/i18n/navigation.tsx` (Link/usePathname/useRouter/redirect),
  `src/i18n/i18n.server.ts` (`getFixedT`), `src/i18n/i18n.client.tsx` (`useTranslations`, `Trans`).
- `src/components/LoginCard.tsx`, `src/components/AppShell.tsx`, `src/components/AppTopBar.tsx`,
  `src/components/AppSidebar.tsx`, `src/components/BottomTabBar.tsx`, `src/components/LocaleSwitcher.tsx`
  — reference component ports (all already done, don't re-port these).
- `src/lib/db.ts` — stays the same stub (`export {}`) it already is on `app`. Every file that
  needs the DB imports `{ getPrisma }` from `@/lib/db` and calls `await getPrisma()` (zero-arg) —
  this branch has no live client, so those call sites are **expected** to fail typecheck here,
  same as `app` today (known baseline, not a bug — don't add a fake implementation to silence it).

## The `withLoadContext` rule — every route file, no exceptions

```tsx
export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    // ... everything that might touch getPrisma()/getEnv(), directly or transitively ...
    return data({ ... });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return someAction(formData, request, params.locale!);
  });
}
```

If you forget this wrapper, `getPrisma()`/`getEnv()` throw `"getLoadContext() called outside a
request"` at runtime (not at typecheck) — so double check every new route file has it, both
`loader` and `action` when both exist.

## The one big i18n simplification

next-intl had two APIs: `getTranslations()` (async, server components) and `useTranslations()`
(hook, client components) — ~76 call sites split across both. **In RR7 there is no server-component
render step** — every route component (whether it has a `loader` or not) renders inside the same
`I18nProvider` tree on both SSR and hydration. So:

- **Any call site that was rendering JSX** (i.e. almost everything) → `useTranslations(ns)` from
  `@/i18n/i18n.client` (named identically to the old hook — same call shape, just a different
  import path). This includes former "async server component" pages/components — drop the
  `async`/`await` around the translation call, keep the component itself as async **only** if it
  still does a genuine data-fetching `await` elsewhere (most page components don't need to be
  async at all anymore, since data comes from `loaderData`, not inline `await prisma...`).
- **Only** non-rendering contexts (a `<title>` string, a CSV/YAML export's header row, an email
  subject line built outside JSX) use `getFixedT(locale, ns)` from `@/i18n/i18n.server` — see
  `app/root.tsx`'s loader for the pattern.
- `t.rich(key, {tag: (chunks) => <a>...}</a>})` → react-i18next's `<Trans t={t} i18nKey={key}
  components={{tag: <a .../>}} />` — see `AppShell.tsx`. The `<tag>...</tag>` markup already in
  `messages/cs.json`/`en.json` doesn't need to change.
- `messages/cs.json` / `messages/en.json` are reused **byte-for-byte** — do not touch them unless
  a string is genuinely wrong. Top-level JSON keys (`app`, `common`, `dashboard`, ...) are i18next
  *namespaces* — `useTranslations("dashboard")` selects that namespace, then dotted paths inside
  it work exactly like before.

## Route file pattern (every `app/routes/*.tsx`)

```tsx
import { data } from "react-router";
import type { Route } from "./+types/<filename>"; // RR7 generates this from routes.ts — matches automatically
import { requireSession } from "@/lib/session.server"; // or requireStaffOrAbove / requireAdmin / requireRoot as needed
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const user = await requireSession(request, params.locale!);
    const prisma = await getPrisma();
    const thing = await prisma.someModel.findMany(/* ... */);
    return data({ thing });
  });
}

// Only if the page has exactly one form action. If it has several (see "Multi-action routes"
// below), dispatch on an `intent` field instead.
export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return someAction(formData, request, params.locale!);
  });
}

export default function SomePage({ loaderData }: Route.ComponentProps) {
  const { thing } = loaderData;
  // useTranslations(...) for any text, no getTranslations anywhere in here.
  return <div>...</div>;
}
```

Next's `params`/`searchParams` (`Promise<...>`) → RR7's `loader`'s own `params` (sync) and
`new URL(request.url).searchParams` (see `root-redirect.tsx`/`login.tsx`). GET-driven filter
forms (`admin/logs`, `admin/users`, `set-person-type`, `payment-check`) read filters the same way
inside the `loader`, no separate handling needed — RR7 re-runs the loader on every URL change.

## `src/lib/actions/*.ts` file mapping (source: `git show app:src/app/actions.ts`)

`auth.ts` is already done (reference it for the exact pattern). Every other function from the old
`actions.ts` goes into exactly one of these — same function names/bodies, just regrouped:

| File | Functions |
|---|---|
| `gate.ts` | `openGateAction`, `addDependentAction`, `removeDependentAction`, `openGuestGateAction`, `checkGateOnlineAction` |
| `staff.ts` | `staffLookupUserForEntryAction`, `staffConfirmEntryAction`, `staffSetPersonTypeAction`, `staffApproveUserAction`, `staffLookupGuestForEntryAction`, `staffConfirmGuestEntryAction` |
| `payments.ts` | `createPaymentOrderAction`, `generateQuickPaymentQrAction` |
| `admin-users.ts` | `adminApproveUserAction`, `adminToggleSuspendAction`, `adminSetRoleAction`, `adminCreateUserAction`, `adminSetPasswordAction`, `adminDeleteUserAction`, `adminSetUserGroupsAction`, `adminSetPersonTypeAction`, `adminAdjustEntriesAction`, `adminGrantPackageAction`, `adminRevokeAccessPassAction` |
| `admin-payments.ts` | `adminConfirmPaymentAction`, `adminCancelPaymentAction` |
| `admin-settings.ts` | every `adminSave*SettingsAction` (18), `adminCheckGateStatusAction`, every `adminRun*Action` manual-run action (7: config backup, transaction backup, database dump, Fio poll, log cleanup, pending-order cleanup, email-verification suspension) |
| `admin-guests.ts` | `adminCreateGuestPassAction`, `adminDeleteGuestPassAction`, `adminDeleteGuestPassesAction`, `adminSendGuestPassEmailAction` |
| `admin-pricing.ts` | `adminCreatePersonTypeAction`, `adminSetPersonTypeVisibilityAction`, `adminSetDefaultPersonTypeAction`, `adminDeletePersonTypeAction`, `adminCreatePackageAction`, `adminDeletePackageAction` |
| `admin-groups.ts` | `adminCreateGroupAction`, `adminDeleteGroupAction`, `adminUpdateGroupWindowsAction` |
| `admin-data.ts` | `adminImportDataAction` |

Signature rule per function: keep `formData: FormData` first (when the original took it), then add
`request: Request` **only if** the function needs it (calls `auth()`/session, or needs
`requestAppUrl`), then `locale: string` **only if** it redirects. Most `admin*` functions in the
original don't call `redirect()` or `auth()` at all (the page's own loader already gated access,
and these use `revalidatePath` which you're deleting anyway per the rule below) — those become
plain `(formData: FormData)` with no `request`/`locale`. Check each function individually rather
than copying one pattern everywhere.

## Multi-action routes (`intent` dispatch)

A route whose Next page had several independent `<form action={serverAction}>`s (e.g.
`admin/users` has 11) gets **one** `action` export that reads a hidden `intent` field and
dispatches:

```tsx
export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "approve": return adminApproveUserAction(formData);
      case "suspend": return adminToggleSuspendAction(formData);
      // ...
      default: throw data(null, { status: 400 });
    }
  });
}
```

Each `<form>` in the component adds `<input type="hidden" name="intent" value="approve" />` (or
sets it via the submit button's `name="intent" value="approve"` when there's already a submit
button per row — check the existing `ConfirmSubmitButton.tsx` pattern first, it may already carry
enough info to do this without an extra hidden input).

## Actions: return value vs. redirect

- Actions that currently call `redirect(...)` from `next/navigation` → `throw redirect(...)` from
  `"react-router"`, **always locale-prefixed** (`/${locale}/...`) since RR7 has no automatic
  locale awareness — see every function in `src/lib/actions/auth.ts`.
- Actions that currently return a typed result object (`{ok, ...}`) and are invoked client-side
  via `startTransition` (e.g. `openGateAction`, `createPaymentOrderAction`, the admin manual-run
  actions) — port the function body unchanged (same return type), but the **calling component**
  changes: instead of `startTransition(async () => { const res = await openGateAction(...) })`,
  use RR7's `useFetcher()`:
  ```tsx
  const fetcher = useFetcher<typeof action>();
  // fetcher.submit(formData, { method: "post" }); or fetcher.Form for a real <form>
  // fetcher.data holds the typed result once it resolves, fetcher.state tracks pending
  ```
  The route's `action` export for these still just calls the ported function and returns its
  result with `data(...)` — no redirect.
- `revalidatePath(...)` calls: **delete them**. RR7 automatically revalidates every loader on the
  current route tree after any action on that route. The few cases where a *different* route's
  data needs refreshing (e.g. confirming a payment from `/admin/payments` should update `/`)
  don't need special handling either — that other route will just refetch on its own next visit.
  Don't build a cross-route revalidation mechanism; it wasn't asked for and RR7's default is
  already correct for how this app navigates.

## `"use client"` / `"use server"` directives

Drop them. RR7 framework mode (without RSC) doesn't use either directive — every component is
just a component. Don't leave them in "for safety"; they're dead weight here.

## Component-level Next API swaps (mechanical, same everywhere)

| Next | React Router v7 |
|---|---|
| `import { Link, usePathname, useRouter } from "@/i18n/navigation"` | same import path, already ported — **no change needed** |
| `useFormStatus()` (react-dom) | unchanged — still works the same inside a `<Form>` from `react-router` |
| `<form action={someServerAction}>` | `<Form method="post">` (import `Form` from `"react-router"`) posting to the route's own `action` — the server action call moves into the route's `action` export |
| `notFound()` (`next/navigation`) | `throw data(null, { status: 404 })` (import `data` from `"react-router"`) |
| `redirect()` inside a component/action | `throw redirect(...)` (import from `"react-router"`, always locale-prefixed) |

## Files that need NO changes beyond the import-path fixes above

Pure business logic with no Next.js API usage at all — copy as-is, only fix imports that pointed
at things that moved (`@/lib/session` → `@/lib/session.server` for `canUseApp`, `@/auth` no
longer exists — anything importing `auth`/`signIn`/`signOut` from `@/auth` needs
`getSessionUser`/`createUserSession`/`destroySession` from `@/lib/session.server` instead):
`roles.ts`, `time.ts`, `schedule.ts`, `qr.ts`, `stats.ts`, `access-pass.ts`, `admin-nav.ts`,
`audit.ts`, `audit-actions.ts`, `audit-log-filters.ts`, `lock.ts`, `s3.ts`, `receipt-pdf.ts`,
`receipt-logo.ts`, `fonts/pt-sans-regular.ts`, `mail.ts`, `settings.ts`, `data-transfer.ts`,
`db-dump.ts`, `transaction-log.ts`, `backup.ts`, `backup-scheduler.ts`, `log-cleanup.ts`,
`pending-order-cleanup.ts`, `email-verification.ts`, `fio.ts`, `gate.ts`, `payments.ts`,
`app-url.ts` (already fine, uses `process.env` directly — leave it). `request-url.ts` is
**already ported** (`requestAppUrl(request, context)`, no more `next/headers`).

## Resource routes (`app/routes/api/*.ts`)

No JSX, just `loader`/`action` exporting a `Response`/`data(...)` — port the 4 existing API routes
(`gopay.webhook.ts`, `admin.data-yaml.ts`, `admin.logs-csv.ts`, `admin.stats-csv.ts`) near-verbatim,
same headers/content-type/status logic, swap `NextResponse`/`req.nextUrl.searchParams` for plain
`Response`/`new URL(request.url).searchParams`, and `auth()`-based gating for
`getSessionUser(request, context)`. These have no locale prefix (see `routes.ts`), so build
locale-free absolute paths for anything the response body includes.

## Verification while porting

Run `npx tsc --noEmit` frequently (not `npm run typecheck` — that also runs `react-router
typegen`, only needed after you add/rename a route in `routes.ts`). This branch has no live DB
(`db.ts` stub, no Prisma datasource), so **do not expect zero errors** — two categories are
expected baseline noise, not bugs, and not something to "fix" with type annotations:

1. `Module '"@/lib/db"' has no exported member 'getPrisma'` — everywhere `getPrisma()` is called.
2. `Parameter 'x' implicitly has an 'any' type` on Prisma query-result callbacks
   (`.map((row) => ...)` etc.) and `Module '"@prisma/client"' has no exported member 'Foo'` —
   because there's no generated Prisma client (no datasource on this branch) to have real types
   in the first place. These disappear on their own once `stena-rr7-d1sql` has a real datasource.

Only real signal: `Cannot find module 'next-intl'` / `'next/image'` / `'@/app/actions'` /
`'@/lib/session'` / `'@/auth'` (a file you haven't ported yet), or any error not matching the two
patterns above. Run `npm run lint` too — same idea, only fix lint errors in files you touched.
Do not commit — leave that to the final verification pass.
