import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") redirect("/");
  return session;
}

/** Gate/purchase eligibility unrelated to credits or schedule — just account state. */
export function canUseApp(user: {
  status: string;
  suspended: boolean;
}): { ok: boolean; reason?: "pending" | "suspended" } {
  if (user.suspended) return { ok: false, reason: "suspended" };
  if (user.status !== "APPROVED") return { ok: false, reason: "pending" };
  return { ok: true };
}
