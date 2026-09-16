import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { getMonthlyPlannerEvents } from "@/lib/services/growth/monthly-planner";
import { prisma } from "@/prisma/prisma";

export async function getGrowthPlannerData(businessSlug: string, query: Record<string, string | string[] | undefined>) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return { success: false as const, error: "Forbidden" };
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.growth) return { success: false as const, error: "Upgrade required" };
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug }, select: { id: true, name: true, slug: true, created_at: true },
  });
  if (!business) return { success: false as const, error: "Not found" };
  const now = new Date();
  const parsedYear = typeof query.year === "string" ? Number.parseInt(query.year, 10) : NaN;
  const parsedMonth = typeof query.month === "string" ? Number.parseInt(query.month, 10) : NaN;
  const year = Number.isFinite(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030 ? parsedYear : now.getFullYear();
  const month = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : now.getMonth() + 1;
  const events = await getMonthlyPlannerEvents({ businessId: business.id, businessSlug: business.slug, businessCreatedAt: business.created_at, year, month });
  return { success: true as const, businessName: business.name, events: events.map((event) => ({ ...event, date: event.date.toISOString() })), year, month };
}
