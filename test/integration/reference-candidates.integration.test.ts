import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { addReferenceLink, approveReferenceCandidate, rejectReferenceCandidate } from "@/features/social/services/reference-candidates";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const external = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn(), fetch: vi.fn(), afterUpload: null as null | (() => Promise<void>), failAfterAsset: false, assetReached: false, loseTransition: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn(), requireOwnerTenantWriteAccess: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: external.put, del: external.del }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            if (member === "brandAsset") return new Proxy(transaction.brandAsset, {
              get(model, operation) {
                if (operation === "create") return async (args: Prisma.BrandAssetCreateArgs) => {
                  const result = await model.create(args);
                  if (external.failAfterAsset) { external.assetReached = true; throw new Error("Fixture post-asset failure"); }
                  return result;
                };
                const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            if (member === "referenceCandidate") return new Proxy(transaction.referenceCandidate, {
              get(model, operation) {
                if (operation === "updateMany") return (args: Prisma.ReferenceCandidateUpdateManyArgs) => external.loseTransition ? Promise.resolve({ count: 0 }) : model.updateMany(args);
                const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            return Reflect.get(transaction, member);
          },
        })), options);
      const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: "integration-reference-candidates", now: new Date("2030-01-15T09:00:00Z") });
const business = factory.business({ slug: "beautyfeel" });
const foreign = factory.business({ id: `${business.id}-foreign`, slug: "integration-reference-candidates-foreign" });
const tenants = [business.id, foreign.id];
const user = factory.user({ contactNumber: "fixture-reference-owner" });
const candidateId = "integration-reference-candidate";
const foreignCandidateId = "integration-reference-candidate-foreign";
const bytes = new Uint8Array([1, 2, 3]);
const hash = createHash("sha256").update(bytes).digest("hex");
const approval = { businessSlug: business.slug, candidateId, rightsConfirmed: true };
let ownerId: number; let actor: Parameters<typeof approveReferenceCandidate>[0];
const run = () => approveReferenceCandidate(actor, approval);
const candidate = () => prisma.referenceCandidate.findUniqueOrThrow({ where: { id: candidateId } });
const assetCount = () => prisma.brandAsset.count({ where: { business_id: { in: tenants } } });
async function cleanup() {
  try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
  finally { await prisma.user.deleteMany({ where: { id: user.id } }); }
}
async function denied() {
  const before = await candidate(); expect((await run()).success).toBe(false);
  expect(await candidate()).toEqual(before); expect(await assetCount()).toBe(0);
}

describe("reference candidate pilot in isolated PostgreSQL with mocked providers", () => {
  beforeAll(async () => {
    try {
      await cleanup();
      if (await prisma.business.findUnique({ where: { slug: "beautyfeel" } })) throw new Error("Pilot SQL fixture requires an empty Beautyfeel slug; refusing to reuse an existing tenant.");
      for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials } });
      await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: "OWNER" } });
      ownerId = (await prisma.owner.create({ data: { business_id: business.id, user_id: user.id } })).id;
      const context = await resolveTenantActorContext(business.slug, user.id);
      if (!context.success || context.actorType !== "OWNER") throw new Error("Fixture owner missing"); actor = context;
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    vi.resetAllMocks(); vi.stubGlobal("fetch", external.fetch);
    external.afterUpload = null; external.failAfterAsset = false; external.assetReached = false; external.loseTransition = false;
    await prisma.user.update({ where: { id: user.id }, data: { role: "OWNER" } });
    await prisma.owner.update({ where: { id: ownerId }, data: { business_id: business.id } });
    await prisma.referenceCandidate.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.brandAsset.deleteMany({ where: { business_id: { in: tenants } } });
    for (const [id, business_id] of [[candidateId, business.id], [foreignCandidateId, foreign.id]]) await prisma.referenceCandidate.create({ data: { id, business_id, provider: "PEXELS", provider_id: id, source_url: `https://www.pexels.com/photo/${id}/`, preview_url: "https://images.pexels.com/photos/1/image.jpg", license_status: "PEXELS_LICENSE_REVIEW_REQUIRED", service_category: "NAILS", mood_tags: ["editorial"], link_only: false } });
    external.fetch.mockImplementation(async () => new Response(bytes, { headers: { "content-type": "image/jpeg" } }));
    external.put.mockImplementation(async path => {
      if (external.afterUpload) await external.afterUpload();
      const pathname = `${path.slice(0, -4)}-fixture.jpg`;
      return { pathname, url: `https://fixture.public.blob.vercel-storage.com/${pathname}` };
    });
    external.del.mockResolvedValue(undefined);
  });
  afterAll(async () => { external.afterUpload = null; try { await cleanup(); } finally { vi.unstubAllGlobals(); await prisma.$disconnect(); } });

  it("atomically links a STYLE reference asset with tenant hash and rights metadata", async () => {
    const foreignBefore = await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: foreignCandidateId } });
    const result = await run(); if (!result.success) throw new Error(result.error);
    expect(result.data).toMatchObject({ business_id: business.id, kind: "REFERENCE", reference_subject: "STYLE", uploaded_by_user_id: user.id, alt: "NAILS editorial reference" });
    expect(await candidate()).toMatchObject({ status: "APPROVED", approved_asset_id: result.data.id, content_hash: hash, license_status: "RIGHTS_CONFIRMED_BY_DEVELOPER" });
    expect(await assetCount()).toBe(1); expect(external.del).not.toHaveBeenCalled();
    expect(await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: foreignCandidateId } })).toEqual(foreignBefore);
  });
  it("requires actual rights confirmation before downloading", async () => {
    expect((await approveReferenceCandidate(actor, { ...approval, rightsConfirmed: false })).success).toBe(false);
    expect(external.fetch).not.toHaveBeenCalled(); expect(await assetCount()).toBe(0);
  });
  it("never imports a link-only record", async () => {
    await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { link_only: true } });
    await denied(); expect(external.fetch).not.toHaveBeenCalled();
  });
  it("does not touch a foreign candidate or provider", async () => {
    const before = await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: foreignCandidateId } });
    expect((await approveReferenceCandidate(actor, { ...approval, candidateId: foreignCandidateId })).success).toBe(false);
    expect(await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: foreignCandidateId } })).toEqual(before);
    expect(external.fetch).not.toHaveBeenCalled(); expect(await assetCount()).toBe(0);
  });
  it.each(["role", "membership"])("denies revoked %s before providers", async revoked => {
    if (revoked === "role") await prisma.user.update({ where: { id: user.id }, data: { role: "EMPLOYEE" } });
    else await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } });
    await denied(); expect(external.fetch).not.toHaveBeenCalled();
  });
  it.each(["REJECTED", "APPROVED"] as const)("denies %s candidate with no asset or download", async status => {
    await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { status } });
    await denied(); expect(external.fetch).not.toHaveBeenCalled();
  });
  it("deduplicates approved content before upload", async () => {
    await prisma.referenceCandidate.create({ data: { business_id: business.id, provider: "PEXELS", source_url: "https://www.pexels.com/photo/duplicate/", service_category: "NAILS", license_status: "RIGHTS_CONFIRMED_BY_DEVELOPER", status: "APPROVED", content_hash: hash } });
    await denied(); expect(external.put).not.toHaveBeenCalled();
  });
  it.each(["membership", "status", "snapshot", "duplicate"])("rechecks %s after external upload and compensates only own blob", async race => {
    external.afterUpload = async () => {
      if (race === "membership") await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } });
      if (race === "status") await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { status: "REJECTED" } });
      if (race === "snapshot") await prisma.referenceCandidate.update({ where: { id: candidateId }, data: { preview_url: "https://images.pexels.com/photos/2/image.jpg" } });
      if (race === "duplicate") await prisma.referenceCandidate.create({ data: { business_id: business.id, provider: "PEXELS", source_url: "https://www.pexels.com/photo/late-duplicate/", service_category: "NAILS", license_status: "RIGHTS_CONFIRMED_BY_DEVELOPER", status: "APPROVED", content_hash: hash } });
    };
    expect((await run()).success).toBe(false); expect(await assetCount()).toBe(0);
    expect((await candidate()).approved_asset_id).toBeNull(); expect((await candidate()).content_hash).toBeNull();
    expect(external.del).toHaveBeenCalledWith(`https://fixture.public.blob.vercel-storage.com/brand-assets/beautyfeel/references/${candidateId}-fixture.jpg`);
  });
  it.each(["post-create", "conditional-transition"])("rolls back asset and candidate on %s failure", async mode => {
    const before = await candidate();
    external.failAfterAsset = mode === "post-create"; external.loseTransition = mode === "conditional-transition";
    expect((await run()).success).toBe(false); expect(await candidate()).toEqual(before); expect(await assetCount()).toBe(0);
    if (mode === "post-create") expect(external.assetReached).toBe(true); expect(external.del).toHaveBeenCalledOnce();
  });
  it("keeps rejection tenant scoped, pending-only and idempotent for missing records", async () => {
    const foreignBefore = await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: foreignCandidateId } });
    expect(await rejectReferenceCandidate(actor, foreignCandidateId)).toEqual({ success: true });
    expect(await prisma.referenceCandidate.findUniqueOrThrow({ where: { id: foreignCandidateId } })).toEqual(foreignBefore);
    expect(await rejectReferenceCandidate(actor, candidateId)).toEqual({ success: true }); expect((await candidate()).status).toBe("REJECTED");
    expect(await rejectReferenceCandidate(actor, "missing")).toEqual({ success: true });
  });
  it("deduplicates link-only input within tenant without fetching or restricting its category", async () => {
    const input = { businessSlug: business.slug, sourceUrl: "https://pin.it/fixture", serviceCategory: "HAIR", moodTags: [" raw mood "] };
    const first = await addReferenceLink(actor, input); const second = await addReferenceLink(actor, input);
    expect(first.success).toBe(true); expect(second.success).toBe(true);
    if (!first.success || !second.success) throw new Error("Fixture link creation failed");
    expect(first.data.id).toBe(second.data.id); expect(first.data).toMatchObject({ business_id: business.id, link_only: true, provider: "PINTEREST", license_status: "UNVERIFIED_LINK_ONLY", service_category: "HAIR", mood_tags: [" raw mood "] });
    expect(external.fetch).not.toHaveBeenCalled(); expect(await assetCount()).toBe(0);
  });
});
