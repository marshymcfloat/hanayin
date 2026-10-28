import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/features/auth/auth-options";
import {
  getOwnerDashboardFinancialRange,
  getOwnerDashboardGrowth,
  getOwnerDashboardPerformance,
  getOwnerDashboardQueue,
  getOwnerDashboardToday,
} from "@/features/dashboard/queries/owner-dashboard-preview-sections";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { getOwnerRedesignAnalytics } from "@/features/dashboard/queries/owner-redesign-analytics";

const paramsSchema = z.object({
  businessSlug: businessSlugSchema,
  section: z.enum(["performance", "today", "queue", "growth", "financials", "redesign"]),
});
const rangeSchema = z.enum(["7d", "month", "6m", "1y"]);
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessSlug: string; section: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard request" }, { status: 400, headers: privateHeaders });
  }
  const range = parsed.data.section === "financials"
    ? rangeSchema.safeParse(new URL(request.url).searchParams.get("range"))
    : null;
  if (range && !range.success) {
    return NextResponse.json({ error: "Invalid financial range" }, { status: 400, headers: privateHeaders });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  }
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data.businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }
  if (parsed.data.section === "redesign" && session.user.mustChangePassword) {
    return NextResponse.json({ error: "Password change required" }, { status: 403, headers: privateHeaders });
  }
  try {
    const context = await resolveTenantActorContext(parsed.data.businessSlug, session.user.id);
    if (!context.success || context.actorType !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
    }
    const data = parsed.data.section === "redesign"
      ? await getOwnerRedesignAnalytics(context)
      : parsed.data.section === "performance"
      ? await getOwnerDashboardPerformance(context)
      : parsed.data.section === "today"
        ? await getOwnerDashboardToday(context)
        : parsed.data.section === "queue"
          ? await getOwnerDashboardQueue(context)
          : parsed.data.section === "growth"
            ? await getOwnerDashboardGrowth(context)
            : await getOwnerDashboardFinancialRange(context, range!.data);
    if (!data) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
    }
    return NextResponse.json(data, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Dashboard data unavailable" }, { status: 503, headers: privateHeaders });
  }
}
