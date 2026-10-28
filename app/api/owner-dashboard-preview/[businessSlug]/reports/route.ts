import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { ownerPreviewReportQuerySchema } from "@/features/reports/schemas";
import { getOwnerCoreReport } from "@/features/reports/services/core-report";
import { toOwnerPreviewReportDto } from "@/features/reports/types/owner-preview";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const query = ownerPreviewReportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid report filters" }, { status: 400, headers });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const { businessSlug } = await params;
  if (session.user.role !== "OWNER" || session.user.businessSlug !== businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const context = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!context.success || context.actorType !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }

  try {
    const result = await getOwnerCoreReport(context, query.data.tab, {
      preset: query.data.preset,
      groupBy: query.data.groupBy,
    });
    return NextResponse.json(toOwnerPreviewReportDto(result), { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load report" }, { status: 500, headers });
  }
}
