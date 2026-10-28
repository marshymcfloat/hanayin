import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { growthPersistenceFixture } from "@/features/growth/growth-action-fixtures.test-support";
import { persistGrowthCampaign } from "@/features/growth/services/growth-campaign-persistence";
import { recordGrowthCampaignEvent } from "@/features/growth/services/growth-snapshot";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { GrowthOwnerActor } from "@/features/growth/growth-action-types";
const controls = vi.hoisted(() => ({ failure: "", reached: false, afterRead: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn(), requireOwnerTenantWriteAccess: vi.fn(), requireTenantAccess: vi.fn() }));
vi.mock("@/features/billing/plan-entitlements", () => ({ getBusinessEntitlementsBySlug: vi.fn() }));
vi.mock("@/lib/services/growth/context-snapshot", () => ({ ensureBusinessGrowthSettings: vi.fn(), refreshGrowthContextSnapshot: vi.fn() }));
vi.mock("@/lib/services/growth/opportunity-detector", () => ({ refreshOpportunitiesForSnapshot: vi.fn() }));
vi.mock("@/lib/services/growth/opportunities", () => ({ getTodayOpportunityViews: vi.fn() }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, { get(client, key) {
    if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) => client.$transaction(tx => work(new Proxy(tx, { get(transaction, member) {
      if (["saleEvent", "socialPost", "socialPostTarget", "campaign", "opportunity", "campaignEvent"].includes(String(member))) {
        const model = Reflect.get(transaction, member) as Record<string, unknown>;
        return new Proxy(model, { get(delegate, operation) {
          const value = Reflect.get(delegate, operation);
          if (typeof value !== "function") return value;
          return async (args: unknown) => {
            const result = await value.call(delegate, args);
            if (member === "opportunity" && operation === "findFirst" && controls.afterRead) await controls.afterRead();
            if (controls.failure === String(member) && ["create", "createMany", "updateMany"].includes(String(operation))) { controls.reached = true; throw new Error("Fixture post-write rollback"); }
            return result;
          };
        } });
      }
      return Reflect.get(transaction, member);
    } })), options);
    const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
  } }) };
});
requireTestDatabase();
const now = new Date("2030-01-15T09:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-growth-campaign", now });
const tenant = factory.business(); const foreign = factory.business({ id: `${tenant.id}-foreign`, slug: `${tenant.slug}-foreign` });
const user = factory.user({ contactNumber: "fixture-growth-campaign-owner" }); const tenantIds = [tenant.id, foreign.id];
const snapshotId = `${tenant.id}-snapshot`; const foreignSnapshotId = `${foreign.id}-snapshot`; const opportunityId = `${tenant.id}-opportunity`;
const connectionId = `${tenant.id}-connection`; const foreignConnectionId = `${foreign.id}-connection`;
const assetId = `${tenant.id}-asset`; const candidateId = `${tenant.id}-candidate`;
const storageKey = `${tenant.slug}/brand/reference/fixture.jpg`; const assetUrl = `https://fixture.public.blob.vercel-storage.com/${storageKey}`;
let actor: GrowthOwnerActor; let ownerId: number; let serviceId: number; let foreignServiceId: number; let packageId: number; let foreignPackageId: number;
async function cleanup() { await prisma.campaign.deleteMany({ where: { business_id: { in: tenantIds } } }); await prisma.business.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.user.deleteMany({ where: { id: user.id } }); }
async function input() { const fixture = growthPersistenceFixture(); const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } }); return { ...fixture, actor, opportunity, serviceIds: [serviceId], packageIds: [packageId], connectionIds: [connectionId] }; }
async function referenceInput() { const data = await input(); const candidate = await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: candidateId } }); const asset = await prisma.brandAsset.findUniqueOrThrow({ where: { id: assetId } }); return { ...data, reference: { candidateId, candidateUpdatedAt: candidate.updated_at, assetId, assetUpdatedAt: asset.updated_at, assetUrl, storageKey } }; }
async function graph() { return { campaigns: await prisma.campaign.count({ where: { business_id: { in: tenantIds } } }), posts: await prisma.socialPost.count({ where: { business_id: { in: tenantIds } } }), sales: await prisma.saleEvent.count({ where: { business_id: { in: tenantIds } } }), targets: await prisma.socialPostTarget.count({ where: { social_post: { business_id: { in: tenantIds } } } }) }; }
async function deny(data: Awaited<ReturnType<typeof input>>) { await expect(persistGrowthCampaign(data)).rejects.toThrow(); expect(await graph()).toEqual({ campaigns: 0, posts: 0, sales: 0, targets: 0 }); }
describe("growth persistence on guarded disposable PostgreSQL", () => {
  beforeAll(async () => {
    try {
      await cleanup();
      for (const business of [tenant, foreign]) {
        await prisma.business.create({ data: { id: business.id, slug: business.slug, name: business.name, initials: business.initials } });
        await prisma.growthContextSnapshot.create({ data: { id: business.id === tenant.id ? snapshotId : foreignSnapshotId, business_id: business.id, snapshot_date: now, window_start: now, window_end: now, context_json: { businessSlug: business.slug }, capacity_summary_json: {} } });
        await prisma.socialConnection.create({ data: { id: business.id === tenant.id ? connectionId : foreignConnectionId, business_id: business.id, platform: "FACEBOOK_PAGE", external_account_id: business.id, display_name: "Fixture page", access_token_encrypted: "fixture-not-a-real-token" } });
      }
      await prisma.user.create({ data: { id: user.id, name: user.name, contact_number: user.contactNumber, hashed_password: user.hashedPassword, role: "OWNER" } }); ownerId = (await prisma.owner.create({ data: { user_id: user.id, business_id: tenant.id } })).id;
      serviceId = (await prisma.service.create({ data: { business_id: tenant.id, name: "Local service", price: 100, category: "HAIR" } })).id; foreignServiceId = (await prisma.service.create({ data: { business_id: foreign.id, name: "Foreign service", price: 100, category: "HAIR" } })).id;
      packageId = (await prisma.servicePackage.create({ data: { business_id: tenant.id, name: "Local package", price: 100, category: "HAIR" } })).id; foreignPackageId = (await prisma.servicePackage.create({ data: { business_id: foreign.id, name: "Foreign package", price: 100, category: "HAIR" } })).id;
      await prisma.opportunity.create({ data: { id: opportunityId, business_id: tenant.id, snapshot_id: snapshotId, type: "SLOW_HOURS", reason: "Fixture slow hours", time_window_start: now, time_window_end: now, urgency_score: 80, impact_score: 80, confidence_score: 80, feasibility_score: 80, total_score: 80 } });
      await prisma.brandAsset.create({ data: { id: assetId, business_id: tenant.id, kind: "REFERENCE", url: assetUrl, storage_key: storageKey } }); await prisma.referenceCandidate.create({ data: { id: candidateId, business_id: tenant.id, provider: "fixture", source_url: "https://example.test/fixture", license_status: "fixture", service_category: "HAIR", status: "APPROVED", approved_asset_id: assetId } });
      const resolved = await resolveTenantActorContext(tenant.slug, user.id); if (!resolved.success || resolved.actorType !== "OWNER") throw new Error("Fixture OWNER missing"); actor = resolved;
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    controls.failure = ""; controls.reached = false; controls.afterRead = null;
    await prisma.campaign.deleteMany({ where: { business_id: { in: tenantIds } } }); await prisma.socialPost.deleteMany({ where: { business_id: { in: tenantIds } } }); await prisma.saleEvent.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: "OWNER" } }); await prisma.owner.update({ where: { id: ownerId }, data: { business_id: tenant.id } });
    await prisma.opportunity.update({ where: { id: opportunityId }, data: { status: "OPEN", business_id: tenant.id, snapshot_id: snapshotId } });
    await prisma.socialConnection.update({ where: { id: connectionId }, data: { status: "CONNECTED" } });
    await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { business_id: tenant.id, status: "APPROVED", approved_asset_id: assetId } }); await prisma.brandAsset.update({ where: { id: assetId }, data: { business_id: tenant.id, kind: "REFERENCE", url: assetUrl, storage_key: storageKey, service_id: null } });
  });
  afterAll(async () => { controls.failure = ""; controls.afterRead = null; try { await cleanup(); } finally { await prisma.$disconnect(); } });
  it("commits atomic same-tenant draft graph and primary creative assets", async () => { const result = await persistGrowthCampaign(await input()); expect(await graph()).toEqual({ campaigns: 1, posts: 1, sales: 1, targets: 1 }); expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } })).status).toBe("CONVERTED"); const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.createdCampaign.id }, include: { assets: true, sale_event: { include: { applicable_services: true, applicable_packages: true } }, social_post: true } }); expect(campaign.assets).toHaveLength(4); expect(campaign.sale_event?.applicable_services.map(item => item.id)).toEqual([serviceId]); expect(campaign.sale_event?.applicable_packages.map(item => item.id)).toEqual([packageId]); expect(campaign.social_post?.created_by_user_id).toBe(user.id); });
  it("keeps non-discount MANUAL draft without sale", async () => { const data = await input(); data.offer = { ...data.offer, offerType: "CONTENT_POST", actionCategory: "AWARENESS" }; expect((await persistGrowthCampaign(data)).saleEventId).toBeNull(); expect(await graph()).toEqual({ campaigns: 1, posts: 1, sales: 0, targets: 1 }); });
  it.each(["DISMISSED", "EXPIRED", "CONVERTED"] as const)("preserves legacy %s status acceptance with exact snapshot CAS", async status => { await prisma.opportunity.update({ where: { id: opportunityId }, data: { status } }); await persistGrowthCampaign(await input()); expect(await prisma.campaign.count({ where: { business_id: tenant.id } })).toBe(1); });
  it.each(["role", "membership"])("denies revoked %s before writes", async kind => { if (kind === "role") await prisma.user.update({ where: { id: user.id }, data: { role: "EMPLOYEE" } }); else await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } }); await deny(await input()); });
  it.each(["parent", "snapshot", "service", "package", "connection"])("denies foreign %s reference", async kind => { const data = await input(); if (kind === "parent") await prisma.opportunity.update({ where: { id: opportunityId }, data: { business_id: foreign.id } }); if (kind === "snapshot") await prisma.opportunity.update({ where: { id: opportunityId }, data: { snapshot_id: foreignSnapshotId } }); if (kind === "service") data.serviceIds = [foreignServiceId]; if (kind === "package") data.packageIds = [foreignPackageId]; if (kind === "connection") data.connectionIds = [foreignConnectionId]; await deny(data); });
  it("denies disconnected connection snapshot", async () => { await prisma.socialConnection.update({ where: { id: connectionId }, data: { status: "REVOKED" } }); await deny(await input()); });
  it.each(["status", "updatedAt"])("denies externally changed opportunity %s snapshot", async kind => { const data = await input(); await prisma.opportunity.update({ where: { id: opportunityId }, data: kind === "status" ? { status: "DISMISSED" } : { updated_at: new Date(data.opportunity.updated_at.getTime() + 1000) } }); await deny(data); });
  it("commits approved owned reference without downloading", async () => { await persistGrowthCampaign(await referenceInput()); expect((await graph()).campaigns).toBe(1); });
  it.each(["candidateTenant", "candidateStatus", "assetTenant", "assetKind", "assetService", "assetUrl"])("denies changed reference %s", async kind => { const data = await referenceInput(); if (kind === "candidateTenant") await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { business_id: foreign.id } }); if (kind === "candidateStatus") await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { status: "REJECTED" } }); if (kind === "assetTenant") await prisma.brandAsset.update({ where: { id: assetId }, data: { business_id: foreign.id } }); if (kind === "assetKind") await prisma.brandAsset.update({ where: { id: assetId }, data: { kind: "LOGO" } }); if (kind === "assetService") await prisma.brandAsset.update({ where: { id: assetId }, data: { service_id: foreignServiceId } }); if (kind === "assetUrl") data.reference.assetUrl = "https://127.0.0.1/internal"; await deny(data); });
  it.each(["saleEvent", "socialPost", "socialPostTarget", "campaign", "opportunity"])("rolls back actual post-%s write failure", async failure => { const data = await input(); controls.failure = failure; await deny(data); expect(controls.reached).toBe(true); expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } })).status).toBe("OPEN"); });
  it("allows only one forced concurrent original snapshot winner", async () => { const data = await input(); let arrivals = 0; let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; }); controls.afterRead = async () => { if (++arrivals === 2) release(); await barrier; }; try { const results = await Promise.allSettled([persistGrowthCampaign(data), persistGrowthCampaign(data)]); expect(arrivals).toBe(2); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(await graph()).toEqual({ campaigns: 1, posts: 1, sales: 1, targets: 1 }); } finally { controls.afterRead = null; release(); } });
  it("records exact legacy nullable event and JSON metadata", async () => { const campaign = await persistGrowthCampaign(await input()); expect(await recordGrowthCampaignEvent(actor, { businessSlug: actor.businessSlug, campaignId: campaign.createdCampaign.id, eventType: "MANUAL_FEEDBACK", value: -5, metadata: { fixture: { keep: true } } })).toEqual({ success: true }); expect(await prisma.campaignEvent.findMany({ where: { campaign_id: campaign.createdCampaign.id } })).toMatchObject([{ event_type: "MANUAL_FEEDBACK", value: -5, metadata: { fixture: { keep: true } } }]); });
  it("denies revoked event membership without event", async () => { const campaign = await persistGrowthCampaign(await input()); await prisma.user.update({ where: { id: user.id }, data: { role: "EMPLOYEE" } }); await expect(recordGrowthCampaignEvent(actor, { businessSlug: actor.businessSlug, campaignId: campaign.createdCampaign.id, eventType: "CLICK_RECORDED" })).rejects.toThrow(); expect(await prisma.campaignEvent.count({ where: { campaign_id: campaign.createdCampaign.id } })).toBe(0); });
  it("denies missing/foreign event campaign", async () => { expect(await recordGrowthCampaignEvent(actor, { businessSlug: actor.businessSlug, campaignId: "foreign-missing", eventType: "CLICK_RECORDED" })).toEqual({ success: false, error: "Campaign not found." }); });
  it("rolls back actual event insert failure", async () => { const campaign = await persistGrowthCampaign(await input()); controls.failure = "campaignEvent"; await expect(recordGrowthCampaignEvent(actor, { businessSlug: actor.businessSlug, campaignId: campaign.createdCampaign.id, eventType: "CLICK_RECORDED" })).rejects.toThrow(); expect(controls.reached).toBe(true); expect(await prisma.campaignEvent.count({ where: { campaign_id: campaign.createdCampaign.id } })).toBe(0); });
});
