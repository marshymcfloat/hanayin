import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/features/auth/auth-options";
import { getOwnerAttendancePreviewData } from "@/features/workforce/queries/owner-attendance-preview";
import { attendancePreviewDateSchema, currentAttendanceDatePH } from "@/features/workforce/owner-attendance-preview-date";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const parsed = businessSlugSchema.safeParse((await params).businessSlug);
  if (!parsed.success) return NextResponse.json({ error: "Invalid business" }, { status: 400, headers });

  const url = new URL(request.url);
  const values = url.searchParams.getAll("date");
  const date = attendancePreviewDateSchema.safeParse(values.length ? values[0] : currentAttendanceDatePH());
  if (values.length > 1 || !date.success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400, headers });
  }

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
    const data = await getOwnerAttendancePreviewData(actor, date.data);
    if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load attendance" }, { status: 500, headers });
  }
}
