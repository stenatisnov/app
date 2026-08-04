/** Admin sub-sections — shared between AdminNav (mobile pill bar) and AppSidebar (desktop). */
export const ADMIN_SECTIONS = [
  ["users", "/admin/users"],
  ["groups", "/admin/groups"],
  ["pricing", "/admin/pricing"],
  ["payments", "/admin/payments"],
  ["guests", "/admin/guests"],
  ["settings", "/admin/settings"],
  ["logs", "/admin/logs"],
  ["stats", "/admin/stats"],
  ["loginQr", "/admin/login-qr"],
  ["data", "/admin/data"],
] as const;

/** Sections reserved for ROOT — hidden from plain ADMIN users. */
const ROOT_ONLY_SECTIONS = new Set<string>(["settings", "logs", "data"]);

export function visibleAdminSections(isRoot: boolean) {
  return isRoot ? ADMIN_SECTIONS : ADMIN_SECTIONS.filter(([key]) => !ROOT_ONLY_SECTIONS.has(key));
}
