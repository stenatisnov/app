import { data } from "react-router";
import type { Route } from "./+types/child-groups";
import { getPrisma } from "@/lib/db.server";
import { requireStaffOrAbove } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { ChildGroupsStaffList } from "@/components/ChildGroupsStaffList";
import { staffConfirmChildGroupEntryAction, staffLookupChildGroupByIdForEntryAction } from "@/lib/actions/staff";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    const prisma = await getPrisma();
    const groups = await prisma.childGroup.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
    return data({ groups: groups.map((g) => ({ id: g.id, name: g.name, memberCount: g._count.members })) });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "lookupChildGroupById":
        return staffLookupChildGroupByIdForEntryAction(String(formData.get("groupId") || ""));
      case "confirmChildGroupEntry":
        return staffConfirmChildGroupEntryAction(request, formData.getAll("userIds").map(String));
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function ChildGroupsStaffPage({ loaderData }: Route.ComponentProps) {
  return <ChildGroupsStaffList groups={loaderData.groups} />;
}
