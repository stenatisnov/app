import { Outlet } from "react-router";
import type { Route } from "./+types/_layout";
import { requireAdmin } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";

/** Gates the whole `/admin` section — mirrors `[locale]/admin/layout.tsx`'s requireAdmin() on the Next.js branches. */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireAdmin(request, params.locale!);
    return null;
  });
}

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <Outlet />
    </div>
  );
}
