import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/features/auth/auth-options";
import { getOwnerPayrollPreviewData } from "@/features/payroll/queries/owner-payroll-preview";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const parsed = businessSlugSchema.safeParse((await params).businessSlug);
  if (!parsed.success) return NextResponse.json({ error: "Invalid business" }, { status: 400, headers });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const actor = await resolveTenantActorContext(parsed.data, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }

  try {
    const data = await getOwnerPayrollPreviewData(actor);
    if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load payroll" }, { status: 500, headers });
  }
}
