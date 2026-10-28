import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { ownerGrowthPreviewQuerySchema } from "@/features/growth/owner-preview-schemas";
import { getOwnerGrowthPreviewData } from "@/features/growth/queries/owner-preview";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const query = ownerGrowthPreviewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid growth range" }, { status: 400, headers });

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
    const data = await getOwnerGrowthPreviewData(context, query.data.range);
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load growth data" }, { status: 500, headers });
  }
}
