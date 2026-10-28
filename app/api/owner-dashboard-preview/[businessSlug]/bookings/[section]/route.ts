import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/features/auth/auth-options";
import { bookingPreviewDateSchema, bookingPreviewFilterSchema } from "@/features/bookings/owner-bookings-preview-schemas";
import { getOwnerBookingsPreviewList, getOwnerBookingsPreviewSummary } from "@/features/bookings/queries/owner-bookings-preview";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const paramsSchema = z.object({ businessSlug: businessSlugSchema, section: z.enum(["summary", "list"]) });
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string; section: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  const url = new URL(request.url);
  const search = url.searchParams;
  const duplicateFilter = ["date", "status", "q", "page"].some((key) => search.getAll(key).length > 1);
  const filters = parsed.success && parsed.data.section === "list"
    ? bookingPreviewFilterSchema.safeParse({ date: search.get("date") ?? undefined, status: search.get("status") ?? undefined, q: search.get("q") ?? undefined, page: search.get("page") ?? undefined })
    : null;
  const date = parsed.success && parsed.data.section === "summary" ? bookingPreviewDateSchema.safeParse(search.get("date")) : null;
  if (!parsed.success || duplicateFilter || (filters && !filters.success) || (date && !date.success)) {
    return NextResponse.json({ error: "Invalid bookings request" }, { status: 400, headers: privateHeaders });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data.businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }
  try {
    const actor = await resolveTenantActorContext(parsed.data.businessSlug, session.user.id);
    if (!actor.success || actor.actorType !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
    const data = parsed.data.section === "list"
      ? await getOwnerBookingsPreviewList(actor, filters!.data)
      : await getOwnerBookingsPreviewSummary(actor, date!.data);
    if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
    return NextResponse.json(data, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Bookings data unavailable" }, { status: 503, headers: privateHeaders });
  }
}
