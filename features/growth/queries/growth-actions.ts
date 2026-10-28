import "server-only";
import { prisma } from "@/prisma/prisma";
import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { growthOwnerBusinessFilter } from "@/features/growth/growth-action-access";
import type { GrowthActor, GrowthOwnerActor } from "@/features/growth/growth-action-types";

export async function getGrowthBusinessCreatedAt(actor: GrowthOwnerActor) {
  return prisma.business.findFirst({ where: growthOwnerBusinessFilter(actor), select: { id: true, created_at: true } });
}
export async function getGrowthTodaySnapshot(actor: GrowthActor) {
  const now = getCurrentDateTimePH();
  return prisma.growthContextSnapshot.findFirst({ where: { business_id: actor.businessId, snapshot_date: { gte: getStartOfDayPH(now), lte: getEndOfDayPH(now) } }, orderBy: { created_at: "desc" } });
}
export async function getGrowthCampaignBusiness(actor: GrowthOwnerActor) {
  return prisma.business.findFirst({ where: growthOwnerBusinessFilter(actor), select: { id: true, slug: true, name: true,
    services: { select: { id: true, name: true, price: true, duration: true, category: true }, orderBy: { price: "asc" } },
    packages: { select: { id: true, name: true }, orderBy: { id: "asc" } },
    social_connections: { where: { status: "CONNECTED" }, select: { id: true } },
  } });
}
export async function getGrowthCampaignOpportunity(actor: GrowthOwnerActor, id: string) {
  return prisma.opportunity.findFirst({ where: { id, business_id: actor.businessId, snapshot: { business_id: actor.businessId } } });
}
export async function getGrowthReferenceCandidate(actor: GrowthOwnerActor, categories: string[]) {
  const delegate = (prisma as typeof prisma & { referenceCandidate?: typeof prisma.referenceCandidate }).referenceCandidate;
  return delegate ? delegate.findFirst({ where: { business_id: actor.businessId, status: "APPROVED", approved_asset_id: { not: null }, service_category: { in: categories.map(value => value.toUpperCase()) } }, orderBy: [{ quality_score: "desc" }, { updated_at: "desc" }] }) : null;
}
export async function getGrowthReferenceAsset(actor: GrowthOwnerActor, id: string) {
  return prisma.brandAsset.findFirst({ where: { id, business_id: actor.businessId, kind: "REFERENCE", AND: [{ OR: [{ service_id: null }, { service: { business_id: actor.businessId } }] }, { OR: [{ employee_id: null }, { employee: { business_id: actor.businessId } }] }] }, select: { id: true, url: true, storage_key: true, reference_subject: true, updated_at: true } });
}
