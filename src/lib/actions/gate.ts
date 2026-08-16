import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { openGateForGuest, openGateForUser } from "@/lib/gate";
import { getGateStatus } from "@/lib/lock";
import { canUseApp, getSessionUser } from "@/lib/session.server";

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export async function openGateAction(request: Request, openGate: boolean = true, dependentIds: string[] = []) {
  const user = await getSessionUser(request);
  if (!user) {
    return { ok: false as const, code: "UNAUTHORIZED", message: "Nejste přihlášeni" };
  }
  const access = canUseApp(user);
  if (!access.ok) {
    return {
      ok: false as const,
      code: access.reason === "suspended" ? "SUSPENDED" : "PENDING",
      message: access.reason === "suspended" ? "Účet je pozastaven" : "Účet čeká na schválení",
    };
  }
  return openGateForUser(user.id, { openGate, dependentIds });
}

// ---------------------------------------------------------------------------
// Dependents (companions, typically children, entered under a parent's login)
// ---------------------------------------------------------------------------

export async function addDependentAction(formData: FormData, request: Request) {
  const user = await getSessionUser(request);
  if (!user) return { ok: false as const, error: "auth" as const };

  const prisma = await getPrisma();
  const schema = z.object({
    name: z.string().min(1).max(120),
    personTypeId: z.string().min(1),
  });
  const parsed = schema.safeParse({
    name: String(formData.get("name") || "").trim(),
    personTypeId: String(formData.get("personTypeId") || ""),
  });
  if (!parsed.success) return { ok: false as const, error: "validation" as const };

  const personType = await prisma.personType.findUnique({ where: { id: parsed.data.personTypeId } });
  if (!personType || !personType.visibleToUsers) return { ok: false as const, error: "person_type" as const };

  await prisma.dependent.create({
    data: { parentUserId: user.id, name: parsed.data.name, personTypeId: personType.id },
  });
  return { ok: true as const };
}

export async function removeDependentAction(formData: FormData, request: Request) {
  const user = await getSessionUser(request);
  if (!user) return { ok: false as const };

  const prisma = await getPrisma();
  const dependentId = String(formData.get("dependentId") || "");
  await prisma.dependent.deleteMany({ where: { id: dependentId, parentUserId: user.id } });
  return { ok: true as const };
}

export async function openGuestGateAction(token: string, openGate: boolean = true) {
  return openGateForGuest(token, { openGate });
}

/** Live gate-reachability check for the entry dialog — public (no auth), same as the guest pass flow itself. */
export async function checkGateOnlineAction(): Promise<{ online: boolean }> {
  const status = await getGateStatus();
  return { online: status.online };
}
