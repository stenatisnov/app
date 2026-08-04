import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { exportDataToYaml } from "@/lib/data-transfer";
import { isRootRole } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user || !isRootRole(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const yamlText = await exportDataToYaml(prisma);
  return new NextResponse(yamlText, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stena-letnak-data.yaml"',
    },
  });
}
