import { randomBytes } from "crypto";
import * as yaml from "js-yaml";
import { z } from "zod";
import type { PackageKind, PeriodPreset, PrismaClient, Role, UserStatus } from "@prisma/client";
import { minutesToTimeLabel, timeLabelToMinutes } from "./time";

const packageSchema = z.object({
  kind: z.enum(["CREDITS", "PERIOD"]).default("CREDITS"),
  credits: z.number().int().min(0).default(0),
  priceCzk: z.number().int().min(0),
  periodPreset: z.enum(["WEEK", "MONTH", "YEAR", "CUSTOM"]).nullable().default(null),
  periodFrom: z.string().nullable().default(null),
  periodTo: z.string().nullable().default(null),
  active: z.boolean().default(true),
});

const personTypeSchema = z.object({
  name: z.string().min(1),
  default: z.boolean().default(false),
  visibleToUsers: z.boolean().default(true),
  packages: z.array(packageSchema).default([]),
});

const windowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});

const groupSchema = z.object({
  name: z.string().min(1),
  default: z.boolean().default(false),
  is24_7: z.boolean().default(false),
  windows: z.array(windowSchema).default([]),
});

const periodPassSchema = z.object({
  personType: z.string().nullable().default(null),
  kind: z.enum(["CREDITS", "PERIOD"]).default("PERIOD"),
  periodPreset: z.enum(["WEEK", "MONTH", "YEAR", "CUSTOM"]).nullable().default(null),
  priceCzk: z.number().int().min(0).nullable().default(null),
  validFrom: z.string(),
  validTo: z.string(),
  label: z.string().nullable().default(null),
});

const dependentSchema = z.object({
  name: z.string().min(1),
  personType: z.string().nullable().default(null),
  credits: z.number().int().min(0).default(0),
});

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  role: z.enum(["MEMBER", "STAFF", "ADMIN", "ROOT"]).default("MEMBER"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
  suspended: z.boolean().default(false),
  personType: z.string().nullable().default(null),
  groups: z.array(z.string()).default([]),
  credits: z.number().int().min(0).default(0),
  passwordHash: z.string().nullable().default(null),
  periodPasses: z.array(periodPassSchema).default([]),
  dependents: z.array(dependentSchema).default([]),
});

const guestPassSchema = z.object({
  token: z.string().min(1).nullable().default(null),
  label: z.string().nullable().default(null),
  maxUses: z.number().int().min(1).default(1),
  usedCount: z.number().int().min(0).default(0),
  validFrom: z.string(),
  validTo: z.string(),
});

const dataSchema = z.object({
  personTypes: z.array(personTypeSchema).default([]),
  groups: z.array(groupSchema).default([]),
  users: z.array(userSchema).default([]),
  guestPasses: z.array(guestPassSchema).default([]),
});

export type ImportSummary = {
  personTypes: { created: number; updated: number };
  packages: { created: number; updated: number };
  groups: { created: number; updated: number };
  users: { created: number; updated: number };
  periodPasses: { created: number; skipped: number };
  dependents: { created: number; updated: number };
  guestPasses: { created: number; updated: number };
  errors: string[];
};

/**
 * Snapshot of everything an admin would otherwise have to recreate by hand:
 * person type categories and their packages, groups and their weekly
 * windows, users (including which group(s) and period pass(es) they hold,
 * their remaining credits, and their dependents/companions), and guest
 * passes. Keyed by natural/business identifiers (name, email, token) rather
 * than database ids, so a file exported from one deployment can be
 * re-imported into another.
 */
export async function exportDataToYaml(prisma: PrismaClient): Promise<string> {
  const [personTypes, groups, users, guestPasses] = await Promise.all([
    prisma.personType.findMany({
      include: { packages: { orderBy: [{ kind: "asc" }, { credits: "asc" }, { priceCzk: "asc" }] } },
      orderBy: { name: "asc" },
    }),
    prisma.group.findMany({
      include: { windows: { orderBy: { dayOfWeek: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      include: {
        personType: true,
        groups: { include: { group: true } },
        accessPasses: {
          include: { package: { include: { personType: true } } },
          orderBy: { validFrom: "asc" },
        },
        dependents: { include: { personType: true }, orderBy: { name: "asc" } },
      },
      orderBy: { email: "asc" },
    }),
    prisma.guestPass.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const data = {
    personTypes: personTypes.map((pt) => ({
      name: pt.name,
      default: pt.isDefault,
      visibleToUsers: pt.visibleToUsers,
      packages: pt.packages.map((pkg) => ({
        kind: pkg.kind,
        credits: pkg.credits,
        priceCzk: pkg.priceCzk,
        periodPreset: pkg.periodPreset,
        periodFrom: pkg.periodFrom?.toISOString() ?? null,
        periodTo: pkg.periodTo?.toISOString() ?? null,
        active: pkg.active,
      })),
    })),
    groups: groups.map((g) => ({
      name: g.name,
      default: g.isDefault,
      is24_7: g.is24_7,
      windows: g.is24_7
        ? []
        : g.windows.map((w) => ({
            dayOfWeek: w.dayOfWeek,
            from: minutesToTimeLabel(w.fromMin),
            to: minutesToTimeLabel(w.toMin),
          })),
    })),
    users: users.map((u) => ({
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      status: u.status,
      suspended: u.suspended,
      personType: u.personType?.name ?? null,
      groups: u.groups.map((ug) => ug.group.name),
      credits: u.credits,
      passwordHash: u.passwordHash,
      periodPasses: u.accessPasses.map((ap) => ({
        personType: ap.package?.personType.name ?? null,
        kind: ap.package?.kind ?? "PERIOD",
        periodPreset: ap.package?.periodPreset ?? null,
        priceCzk: ap.package?.priceCzk ?? null,
        validFrom: ap.validFrom.toISOString(),
        validTo: ap.validTo.toISOString(),
        label: ap.label,
      })),
      dependents: u.dependents.map((dep) => ({
        name: dep.name,
        personType: dep.personType?.name ?? null,
        credits: dep.credits,
      })),
    })),
    guestPasses: guestPasses.map((gp) => ({
      token: gp.token,
      label: gp.label,
      maxUses: gp.maxUses,
      usedCount: gp.usedCount,
      validFrom: gp.validFrom.toISOString(),
      validTo: gp.validTo.toISOString(),
    })),
  };

  return yaml.dump(data, { noRefs: true, sortKeys: false, lineWidth: 100 });
}

/** Order-independent comparison, so re-importing an unchanged group doesn't churn its window rows. */
function sameWindows(
  existing: { dayOfWeek: number; fromMin: number; toMin: number }[],
  incoming: { dayOfWeek: number; from: string; to: string }[],
): boolean {
  if (existing.length !== incoming.length) return false;
  const a = [...existing].sort((x, y) => x.dayOfWeek - y.dayOfWeek);
  const b = incoming
    .map((w) => ({ dayOfWeek: w.dayOfWeek, fromMin: timeLabelToMinutes(w.from), toMin: timeLabelToMinutes(w.to) }))
    .sort((x, y) => x.dayOfWeek - y.dayOfWeek);
  return a.every((w, i) => w.dayOfWeek === b[i].dayOfWeek && w.fromMin === b[i].fromMin && w.toMin === b[i].toMin);
}

/**
 * Upserts by natural key (person type/group name, user email, guest pass
 * token) — existing rows are updated, missing ones are created, but nothing
 * absent from the file is ever deleted. The two exceptions are each group's
 * weekly windows and each user's group membership, which are replaced
 * wholesale per row (same "set" semantics the admin UI already uses for
 * both), since neither has a natural key of its own to upsert against.
 */
export async function importDataFromYaml(prisma: PrismaClient, yamlText: string): Promise<ImportSummary> {
  const parsed = yaml.load(yamlText);
  const data = dataSchema.parse(parsed ?? {});

  const summary: ImportSummary = {
    personTypes: { created: 0, updated: 0 },
    packages: { created: 0, updated: 0 },
    groups: { created: 0, updated: 0 },
    users: { created: 0, updated: 0 },
    periodPasses: { created: 0, skipped: 0 },
    dependents: { created: 0, updated: 0 },
    guestPasses: { created: 0, updated: 0 },
    errors: [],
  };

  const personTypeIdByName = new Map<string, string>();
  for (const pt of data.personTypes) {
    const existing = await prisma.personType.findUnique({ where: { name: pt.name } });
    let id: string;
    if (existing) {
      if (pt.default) {
        await prisma.personType.updateMany({ where: { NOT: { id: existing.id } }, data: { isDefault: false } });
      }
      if (existing.isDefault !== pt.default || existing.visibleToUsers !== pt.visibleToUsers) {
        await prisma.personType.update({
          where: { id: existing.id },
          data: pt.default ? { isDefault: true, visibleToUsers: pt.visibleToUsers } : { visibleToUsers: pt.visibleToUsers },
        });
        summary.personTypes.updated++;
      }
      id = existing.id;
    } else {
      if (pt.default) await prisma.personType.updateMany({ data: { isDefault: false } });
      const created = await prisma.personType.create({
        data: { name: pt.name, isDefault: pt.default, visibleToUsers: pt.visibleToUsers },
      });
      id = created.id;
      summary.personTypes.created++;
    }
    personTypeIdByName.set(pt.name, id);

    for (const pkg of pt.packages) {
      const where = {
        personTypeId: id,
        kind: pkg.kind as PackageKind,
        credits: pkg.credits,
        priceCzk: pkg.priceCzk,
        periodPreset: pkg.periodPreset as PeriodPreset | null,
        periodFrom: pkg.periodFrom ? new Date(pkg.periodFrom) : null,
        periodTo: pkg.periodTo ? new Date(pkg.periodTo) : null,
      };
      const existingPkg = await prisma.pricePackage.findFirst({ where });
      if (existingPkg) {
        if (existingPkg.active !== pkg.active) {
          await prisma.pricePackage.update({ where: { id: existingPkg.id }, data: { active: pkg.active } });
          summary.packages.updated++;
        }
      } else {
        await prisma.pricePackage.create({ data: { ...where, active: pkg.active } });
        summary.packages.created++;
      }
    }
  }

  const groupIdByName = new Map<string, string>();
  for (const g of data.groups) {
    const existing = await prisma.group.findFirst({ where: { name: g.name }, include: { windows: true } });
    let groupId: string;
    if (existing) {
      if (existing.isDefault !== g.default || existing.is24_7 !== g.is24_7) {
        await prisma.group.update({ where: { id: existing.id }, data: { isDefault: g.default, is24_7: g.is24_7 } });
        summary.groups.updated++;
      }
      groupId = existing.id;
    } else {
      const created = await prisma.group.create({ data: { name: g.name, isDefault: g.default, is24_7: g.is24_7 } });
      groupId = created.id;
      summary.groups.created++;
    }
    groupIdByName.set(g.name, groupId);

    const incomingWindows = g.is24_7 ? [] : g.windows;
    if (!existing || !sameWindows(existing.windows, incomingWindows)) {
      await prisma.groupWindow.deleteMany({ where: { groupId } });
      if (incomingWindows.length > 0) {
        await prisma.groupWindow.createMany({
          data: incomingWindows.map((w) => ({
            groupId,
            dayOfWeek: w.dayOfWeek,
            fromMin: timeLabelToMinutes(w.from),
            toMin: timeLabelToMinutes(w.to),
          })),
        });
      }
    }
  }

  for (const u of data.users) {
    let personTypeId: string | null = null;
    if (u.personType) {
      personTypeId =
        personTypeIdByName.get(u.personType) ??
        (await prisma.personType.findUnique({ where: { name: u.personType } }))?.id ??
        null;
      if (!personTypeId) summary.errors.push(`Uživatel ${u.email}: neznámý typ osoby „${u.personType}“`);
    }

    const existing = await prisma.user.findUnique({ where: { email: u.email }, include: { groups: true } });
    const shared = {
      name: u.name,
      phone: u.phone,
      role: u.role as Role,
      status: u.status as UserStatus,
      suspended: u.suspended,
      personTypeId,
      credits: u.credits,
      ...(u.passwordHash !== null ? { passwordHash: u.passwordHash } : {}),
    };

    let userId: string;
    if (existing) {
      const changed =
        existing.name !== shared.name ||
        existing.phone !== shared.phone ||
        existing.role !== shared.role ||
        existing.status !== shared.status ||
        existing.suspended !== shared.suspended ||
        existing.personTypeId !== shared.personTypeId ||
        existing.credits !== shared.credits ||
        (u.passwordHash !== null && existing.passwordHash !== u.passwordHash);
      if (changed) {
        await prisma.user.update({ where: { id: existing.id }, data: shared });
        summary.users.updated++;
      }
      userId = existing.id;
    } else {
      const created = await prisma.user.create({ data: { email: u.email, ...shared } });
      userId = created.id;
      summary.users.created++;
    }

    const groupIds: string[] = [];
    for (const groupName of u.groups) {
      const groupId =
        groupIdByName.get(groupName) ?? (await prisma.group.findFirst({ where: { name: groupName } }))?.id;
      if (!groupId) {
        summary.errors.push(`Uživatel ${u.email}: neznámá skupina „${groupName}“`);
        continue;
      }
      groupIds.push(groupId);
    }
    const currentGroupIds = new Set((existing?.groups ?? []).map((ug) => ug.groupId));
    const incomingGroupIds = new Set(groupIds);
    const sameGroups =
      currentGroupIds.size === incomingGroupIds.size && [...currentGroupIds].every((id) => incomingGroupIds.has(id));
    if (!sameGroups) {
      await prisma.userGroup.deleteMany({ where: { userId } });
      if (groupIds.length > 0) {
        await prisma.userGroup.createMany({ data: groupIds.map((groupId) => ({ userId, groupId })) });
      }
    }

    for (const pp of u.periodPasses) {
      const validFrom = new Date(pp.validFrom);
      const validTo = new Date(pp.validTo);
      const label = pp.label;
      const already = await prisma.userAccessPass.findFirst({ where: { userId, validFrom, validTo, label } });
      if (already) {
        summary.periodPasses.skipped++;
        continue;
      }

      let packageId: string | null = null;
      const ptName = pp.personType;
      if (ptName) {
        const ptId = personTypeIdByName.get(ptName) ?? (await prisma.personType.findUnique({ where: { name: ptName } }))?.id;
        if (ptId) {
          const pkg = await prisma.pricePackage.findFirst({
            where: {
              personTypeId: ptId,
              kind: pp.kind as PackageKind,
              periodPreset: pp.periodPreset as PeriodPreset | null,
              ...(pp.priceCzk != null ? { priceCzk: pp.priceCzk } : {}),
            },
          });
          packageId = pkg?.id ?? null;
        }
      }

      await prisma.userAccessPass.create({ data: { userId, packageId, validFrom, validTo, label } });
      summary.periodPasses.created++;
    }

    for (const dep of u.dependents) {
      let depPersonTypeId: string | null = null;
      if (dep.personType) {
        depPersonTypeId =
          personTypeIdByName.get(dep.personType) ??
          (await prisma.personType.findUnique({ where: { name: dep.personType } }))?.id ??
          null;
        if (!depPersonTypeId) {
          summary.errors.push(`Uživatel ${u.email}: doprovod „${dep.name}“ — neznámý typ osoby „${dep.personType}“`);
        }
      }

      const existingDep = await prisma.dependent.findFirst({ where: { parentUserId: userId, name: dep.name } });
      if (existingDep) {
        if (existingDep.personTypeId !== depPersonTypeId || existingDep.credits !== dep.credits) {
          await prisma.dependent.update({
            where: { id: existingDep.id },
            data: { personTypeId: depPersonTypeId, credits: dep.credits },
          });
          summary.dependents.updated++;
        }
      } else {
        await prisma.dependent.create({
          data: { parentUserId: userId, name: dep.name, personTypeId: depPersonTypeId, credits: dep.credits },
        });
        summary.dependents.created++;
      }
    }
  }

  for (const gp of data.guestPasses) {
    const validFrom = new Date(gp.validFrom);
    const validTo = new Date(gp.validTo);
    const existing = gp.token ? await prisma.guestPass.findUnique({ where: { token: gp.token } }) : null;

    if (existing) {
      const changed =
        existing.label !== gp.label ||
        existing.maxUses !== gp.maxUses ||
        existing.usedCount !== gp.usedCount ||
        existing.validFrom.getTime() !== validFrom.getTime() ||
        existing.validTo.getTime() !== validTo.getTime();
      if (changed) {
        await prisma.guestPass.update({
          where: { id: existing.id },
          data: { label: gp.label, maxUses: gp.maxUses, usedCount: gp.usedCount, validFrom, validTo },
        });
        summary.guestPasses.updated++;
      }
    } else {
      const token = gp.token ?? randomBytes(16).toString("hex");
      await prisma.guestPass.create({
        data: { token, label: gp.label, maxUses: gp.maxUses, usedCount: gp.usedCount, validFrom, validTo },
      });
      summary.guestPasses.created++;
    }
  }

  return summary;
}
