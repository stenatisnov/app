import { type RouteConfig, route, index, layout, prefix } from "@react-router/dev/routes";

export default [
  route("/", "routes/root-redirect.tsx"),

  ...prefix(":locale", [
    layout("routes/_shell.tsx", [
      index("routes/dashboard.tsx"),
      route("account", "routes/account.tsx"),
      route("buy", "routes/buy.tsx"),
      route("cash", "routes/cash.tsx"),
      route("complete-profile", "routes/complete-profile.tsx"),
      route("forgot-password", "routes/forgot-password.tsx"),
      route("guest/:token", "routes/guest.$token.tsx"),
      route("logbook", "routes/logbook.tsx"),
      route("login", "routes/login.tsx"),
      route("logout", "routes/logout.tsx"),
      route("navod", "routes/navod.tsx"),
      route("navod-staff", "routes/navod-staff.tsx"),
      route("payment-check", "routes/payment-check.tsx"),
      route("register", "routes/register.tsx"),
      route("reset-password", "routes/reset-password.tsx"),
      route("set-person-type", "routes/set-person-type.tsx"),
      route("stop-impersonation", "routes/stop-impersonation.tsx"),
      route("verify-email", "routes/verify-email.tsx"),
      route("verify-pass", "routes/verify-pass.tsx"),

      layout("routes/admin/_layout.tsx", [
        route("admin", "routes/admin/index.tsx"),
        route("admin/data", "routes/admin/data.tsx"),
        route("admin/eet", "routes/admin/eet.tsx"),
        route("admin/groups", "routes/admin/groups.tsx"),
        route("admin/guests", "routes/admin/guests.tsx"),
        route("admin/login-qr", "routes/admin/login-qr.tsx"),
        route("admin/logs", "routes/admin/logs.tsx"),
        route("admin/payments", "routes/admin/payments.tsx"),
        route("admin/pricing", "routes/admin/pricing.tsx"),
        route("admin/settings", "routes/admin/settings.tsx"),
        route("admin/stats", "routes/admin/stats.tsx"),
        route("admin/users", "routes/admin/users.tsx"),
      ]),
    ]),
  ]),

  // Resource routes — no UI, no locale prefix (mirrors src/app/api/* today).
  route("api/auth/google", "routes/api/auth.google.ts"),
  route("api/auth/google/callback", "routes/api/auth.google.callback.ts"),
  route("api/gopay/webhook", "routes/api/gopay.webhook.ts"),
  route("api/logbook/exchange", "routes/api/logbook.exchange.ts"),
  route("api/logbook/verify", "routes/api/logbook.verify.ts"),
  route("api/admin/data.yaml", "routes/api/admin.data-yaml.ts"),
  route("api/admin/logs.csv", "routes/api/admin.logs-csv.ts"),
  route("api/admin/stats.csv", "routes/api/admin.stats-csv.ts"),
] satisfies RouteConfig;
