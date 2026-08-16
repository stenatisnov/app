import { data } from "react-router";
import type { Route } from "./+types/admin.data-yaml";
import { getPrisma } from "@/lib/db.server";
import { exportDataToYaml } from "@/lib/data-transfer";
import { isRootRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const user = await getSessionUser(request);
    if (!user || !isRootRole(user.role)) {
      return data({ error: "FORBIDDEN" }, { status: 403 });
    }

    const prisma = await getPrisma();
    const yamlText = await exportDataToYaml(prisma);
    return new Response(yamlText, {
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="stena-letnak-data.yaml"',
      },
    });
  });
}
