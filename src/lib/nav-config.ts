import * as yaml from "js-yaml";
import type { Role } from "@prisma/client";
import navYamlSource from "../../nav.yaml?raw";

type RoleListKey = "member" | "staff" | "admin";

interface AdminSectionEntry {
  key: string;
  root_only?: boolean;
}

interface NavConfigShape {
  member: string[];
  staff: string[];
  admin: string[];
  guest: string[];
  mobile_primary: Record<RoleListKey, string[]>;
  admin_sections: AdminSectionEntry[];
}

// Parsed once at module load — `?raw` inlines nav.yaml's text into the built
// JS bundle, so this has no runtime filesystem dependency and works the same
// way on Cloudflare Workers (no fs access) as it does under Node/Docker.
const config = yaml.load(navYamlSource) as NavConfigShape;

/** Fixed routes for every nav-item key — kept in code, not the YAML, so a typo here fails typecheck/build rather than silently 404ing. */
const NAV_HREFS: Record<string, string> = {
  dashboard: "/",
  buy: "/buy",
  account: "/account",
  logbook: "/logbook",
  verifyPass: "/verify-pass",
  paymentCheck: "/payment-check",
  cash: "/cash",
  setPersonType: "/set-person-type",
  admin: "/admin",
  guideStaff: "/navod-staff",
  login: "/login",
  register: "/register",
};

const ADMIN_SECTION_HREFS: Record<string, string> = {
  users: "/admin/users",
  groups: "/admin/groups",
  pricing: "/admin/pricing",
  payments: "/admin/payments",
  guests: "/admin/guests",
  eet: "/admin/eet",
  stats: "/admin/stats",
  loginQr: "/admin/login-qr",
  settings: "/admin/settings",
  logs: "/admin/logs",
  data: "/admin/data",
};

function roleListKey(role: Role | string | null | undefined): RoleListKey | null {
  if (role === "ADMIN" || role === "ROOT") return "admin";
  if (role === "STAFF") return "staff";
  if (role === "MEMBER") return "member";
  return null;
}

export function hrefFor(key: string): string {
  const href = NAV_HREFS[key];
  if (!href) throw new Error(`nav.yaml references unknown nav item "${key}" — add it to NAV_HREFS in nav-config.ts`);
  return href;
}

/** Ordered [key, href] pairs for a logged-in user's role — desktop sidebar order. `logbook` is dropped whenever the integration is disabled, regardless of its position in nav.yaml. */
export function navItemsForRole(role: Role | string | null | undefined, logbookEnabled: boolean): [key: string, href: string][] {
  const listKey = roleListKey(role);
  const keys = listKey ? config[listKey] : config.guest;
  return keys.filter((key) => key !== "logbook" || logbookEnabled).map((key) => [key, hrefFor(key)]);
}

export function guestNavItems(): [key: string, href: string][] {
  return config.guest.map((key) => [key, hrefFor(key)]);
}

/** Subset (and order) of navItemsForRole's keys that pin to the mobile bottom-tab row; everything else in that role's list goes into the "More" sheet. */
export function mobilePrimaryKeys(role: Role | string | null | undefined): string[] {
  const listKey = roleListKey(role);
  return listKey ? (config.mobile_primary[listKey] ?? []) : [];
}

/** Admin sub-section [key, href] pairs — ROOT sees all of them, plain ADMIN has the root_only ones filtered out. */
export function visibleAdminSections(isRoot: boolean): [key: string, href: string][] {
  return config.admin_sections
    .filter((section) => isRoot || !section.root_only)
    .map((section) => {
      const href = ADMIN_SECTION_HREFS[section.key];
      if (!href) throw new Error(`nav.yaml references unknown admin section "${section.key}" — add it to ADMIN_SECTION_HREFS in nav-config.ts`);
      return [section.key, href];
    });
}
