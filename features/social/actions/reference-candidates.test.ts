import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn(), owner: vi.fn(), txOwner: vi.fn(), upsert: vi.fn(), list: vi.fn(), first: vi.fn(), txFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), asset: vi.fn(), assetFind: vi.fn(), transaction: vi.fn(), fetch: vi.fn(), put: vi.fn(), del: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireOwnerTenantWriteAccess: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, user: { findUnique: mocks.user }, owner: { findFirst: mocks.owner }, referenceCandidate: { upsert: mocks.upsert, findMany: mocks.list, findFirst: mocks.first, updateMany: mocks.updateMany }, brandAsset: { findFirst: mocks.assetFind }, $transaction: mocks.transaction } }));
import { addLinkOnlyReferenceCandidateAction, approveReferenceCandidateAction, rejectReferenceCandidateAction, suggestBeautyfeelReferencesAction } from "@/features/social/actions/reference-candidates";
import { trustedReferenceImageUrlSchema } from "@/features/social/reference-candidate-schemas";

const candidate = { id: "candidate-a", business_id: "biz-a", provider: "PEXELS", preview_url: "https://images.pexels.com/photos/1/image.jpg", service_category: "NAILS", mood_tags: ["editorial"], link_only: false, status: "PENDING", updated_at: new Date("2030-01-15T09:00:00Z") };
const input = { businessSlug: "beautyfeel", serviceCategory: "nails", moodTags: [" editorial ", "", "clean", "soft", "warm", "bright", "ignored"] };
const approval = { businessSlug: "beautyfeel", candidateId: "candidate-a", rightsConfirmed: true };
const blob = { url: "https://fixture.public.blob.vercel-storage.com/brand-assets/beautyfeel/references/candidate-a-random.jpg", pathname: "brand-assets/beautyfeel/references/candidate-a-random.jpg" };
const run = () => approveReferenceCandidateAction(approval);
const image = (type = "image/jpeg", bytes = new Uint8Array([1, 2, 3])) => new Response(bytes, { headers: { "content-type": type } });
const providerPayload = () => ({ photos: [{ id: 1, url: "https://www.pexels.com/photo/1/", photographer: "Fixture Creator", src: { large2x: candidate.preview_url }, width: 4000, height: 3000 }] });
const entryPoints = [
  () => suggestBeautyfeelReferencesAction(input),
  () => addLinkOnlyReferenceCandidateAction({ ...input, sourceUrl: "https://pin.it/example" }),
  run,
  () => rejectReferenceCandidateAction({ businessSlug: "beautyfeel", candidateId: "candidate-a" }),
];
describe("reference candidate pilot characterization", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); vi.stubEnv("PEXELS_API_KEY", "fixture-provider-key");
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "beautyfeel", session: { user: { id: "user-a", role: "OWNER" } } });
    mocks.business.mockResolvedValue({ id: "biz-a", slug: "beautyfeel", structure: "OWNER_LED", allow_employee_self_booking: false, manager_can_serve: false });
    mocks.user.mockResolvedValue({ id: "user-a", role: "OWNER", owner: { id: 7, business_id: "biz-a" }, employee: null });
    mocks.owner.mockResolvedValue({ id: 7 }); mocks.txOwner.mockResolvedValue({ id: 7 }); mocks.assetFind.mockResolvedValue(null);
    mocks.list.mockResolvedValue([candidate]); mocks.upsert.mockResolvedValue(candidate);
    mocks.first.mockImplementation(async args => args.where.content_hash ? null : candidate);
    mocks.txFirst.mockImplementation(async args => args.where.content_hash ? null : candidate);
    mocks.updateMany.mockResolvedValue({ count: 1 }); mocks.asset.mockResolvedValue({ id: "asset-a" });
    mocks.transaction.mockImplementation(async work => work({ owner: { findFirst: mocks.txOwner }, brandAsset: { create: mocks.asset }, referenceCandidate: { upsert: mocks.upsert, findMany: mocks.list, findFirst: mocks.txFirst, updateMany: mocks.updateMany, update: mocks.update } }));
    mocks.put.mockResolvedValue(blob); mocks.fetch.mockResolvedValue(image()); mocks.del.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("preserves Pexels discovery query, five moods, licensed review metadata and tenant upsert", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ photos: [{ id: 1, url: "https://www.pexels.com/photo/1/", photographer: "Fixture Creator", src: { large2x: candidate.preview_url }, width: 4000, height: 3000 }] }), { headers: { "content-type": "application/json" } }));
    expect(await suggestBeautyfeelReferencesAction(input)).toEqual({ success: true, data: [candidate] });
    expect(mocks.auth).toHaveBeenCalledWith("beautyfeel");
    expect(mocks.fetch.mock.calls[0][0]).toContain("query=premium%20nails%20beauty%20spa%20editorial%20editorial%20clean%20soft%20warm%20bright");
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ where: { business_id_provider_source_url: { business_id: "biz-a", provider: "PEXELS", source_url: "https://www.pexels.com/photo/1/" } }, create: { provider_id: "1", creator_name: "Fixture Creator", license_status: "PEXELS_LICENSE_REVIEW_REQUIRED", link_only: false, mood_tags: ["editorial", "clean", "soft", "warm", "bright"], quality_score: 4.25 } });
  });
  it("preserves Pinterest link-only metadata without category expansion or provider fetch", async () => {
    expect(await addLinkOnlyReferenceCandidateAction({ ...input, serviceCategory: "hair", sourceUrl: "https://pin.it/example" })).toEqual({ success: true, data: candidate });
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ provider: "PINTEREST", source_url: "https://pin.it/example", license_status: "UNVERIFIED_LINK_ONLY", service_category: "HAIR", mood_tags: input.moodTags.slice(0, 5), link_only: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves explicit rights confirmation", async () => {
    expect(await approveReferenceCandidateAction({ businessSlug: "beautyfeel", candidateId: "candidate-a", rightsConfirmed: false })).toEqual({ success: false, error: "Confirm usage rights before approval." });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("preserves the link-only import prohibition", async () => {
    mocks.first.mockResolvedValue({ ...candidate, link_only: true });
    expect(await approveReferenceCandidateAction({ businessSlug: "beautyfeel", candidateId: "candidate-a", rightsConfirmed: true })).toEqual({ success: false, error: "Link-only candidates cannot be imported until an owned or licensed file is supplied." });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("preserves STYLE reference asset, rights metadata and social posts invalidation", async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    expect(await approveReferenceCandidateAction({ businessSlug: "beautyfeel", candidateId: "candidate-a", rightsConfirmed: true })).toEqual({ success: true, data: { id: "asset-a" } });
    expect(mocks.asset.mock.calls[0][0].data).toMatchObject({ business_id: "biz-a", kind: "REFERENCE", reference_subject: "STYLE", alt: "NAILS editorial reference", uploaded_by_user_id: "user-a" });
    expect(mocks.updateMany.mock.calls[0][0].data).toMatchObject({ status: "APPROVED", approved_asset_id: "asset-a", license_status: "RIGHTS_CONFIRMED_BY_DEVELOPER" });
    expect(mocks.cache).toHaveBeenCalledWith("/app/beautyfeel/social-posts");
  });
  it("preserves tenant-scoped PENDING rejection and missing-candidate success", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await rejectReferenceCandidateAction({ businessSlug: "beautyfeel", candidateId: "missing" })).toEqual({ success: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "missing", business_id: "biz-a", status: "PENDING" }, data: { status: "REJECTED" } });
  });
  it("preserves the Beautyfeel-only pilot", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "another-tenant", session: { user: { id: "user-a", role: "OWNER" } } });
    expect(await suggestBeautyfeelReferencesAction({ ...input, businessSlug: "another-tenant" })).toEqual({ success: false, error: "Reference discovery is currently a Beautyfeel pilot." });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])("preserves write/auth denial for entry point %s", async index => {
    mocks.auth.mockResolvedValue({ success: false, error: "Subscription expired" });
    expect(await entryPoints[index]()).toEqual({ success: false, error: "Subscription expired" });
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["missing-user", "removed-owner", "foreign-owner", "employee", "platform-role"])("rejects current %s before provider or writes", async state => {
    const user = { id: "user-a", role: "OWNER", owner: { id: 7, business_id: "biz-a" }, employee: null };
    if (state === "missing-user") mocks.user.mockResolvedValue(null);
    if (state === "removed-owner") mocks.user.mockResolvedValue({ ...user, owner: null });
    if (state === "foreign-owner") mocks.user.mockResolvedValue({ ...user, owner: { id: 7, business_id: "foreign" } });
    if (state === "employee") mocks.user.mockResolvedValue({ ...user, role: "EMPLOYEE", owner: null });
    if (state === "platform-role") mocks.user.mockResolvedValue({ ...user, role: "PLATFORM_ADMIN" });
    expect((await run()).success).toBe(false); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("derives tenant from auth and rejects mismatched transport slug", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "foreign", session: { user: { id: "user-a", role: "OWNER" } } });
    expect(await run()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves missing business failure", async () => {
    mocks.business.mockResolvedValue(null);
    expect(await run()).toEqual({ success: false, error: "Business not found." }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rechecks actual owner before provider use", async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await run()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.owner).toHaveBeenCalledWith({ where: { id: 7, user_id: "user-a", business_id: "biz-a", business: { id: "biz-a", slug: "beautyfeel" }, user: { role: "OWNER" } }, select: { id: true } });
  });
  it.each([null, {}, { businessSlug: "../bad", candidateId: "candidate-a", rightsConfirmed: true }, { ...approval, candidateId: "../foreign" }, { ...approval, rightsConfirmed: "true" }])("validates approval %s before auth", async value => {
    expect(await approveReferenceCandidateAction(value as typeof approval)).toEqual({ success: false, error: "Invalid input" }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...input, moodTags: "bad" }, { ...input, serviceCategory: 1 }, { ...input, moodTags: ["x".repeat(201)] }])("validates discovery %s before auth", async value => {
    expect(await suggestBeautyfeelReferencesAction(value as typeof input)).toEqual({ success: false, error: "Invalid input" }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each(["bad", "not-url", "", "javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,AA", "https://user:password@example.test/image", "ftp://example.test/image"])("rejects unsafe stored-link scheme or credentials %s", async sourceUrl => {
    expect(await addLinkOnlyReferenceCandidateAction({ ...input, sourceUrl })).toEqual({ success: false, error: "Invalid input" }); expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("stores a WEB_LINK without fetching or widening discovery categories", async () => {
    expect((await addLinkOnlyReferenceCandidateAction({ ...input, serviceCategory: "hair", sourceUrl: "http://example.test/a" })).success).toBe(true);
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ provider: "WEB_LINK", source_url: "http://example.test/a", service_category: "HAIR", link_only: true }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects unsupported discovery categories before provider fetch", async () => {
    expect(await suggestBeautyfeelReferencesAction({ ...input, serviceCategory: "HAIR" })).toEqual({ success: false, error: "Unsupported Beautyfeel service category." }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves missing API key and unavailable provider errors", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    expect(await suggestBeautyfeelReferencesAction(input)).toEqual({ success: false, error: "PEXELS_API_KEY is required for licensed reference discovery." }); expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("PEXELS_API_KEY", "fixture-provider-key"); mocks.fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    expect(await suggestBeautyfeelReferencesAction(input)).toEqual({ success: false, error: "Licensed reference provider is unavailable." }); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([{}, { photos: "wrong" }, { photos: [{ ...providerPayload().photos[0], width: -1 }] }, { photos: [{ ...providerPayload().photos[0], src: { large2x: "http://127.0.0.1/private" } }] }, { photos: [{ ...providerPayload().photos[0], url: "not-url" }] }, { photos: [{ ...providerPayload().photos[0], src: { large2x: "bad" } }] }])("validates provider payload %s", async payload => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } }));
    const result = await suggestBeautyfeelReferencesAction(input);
    if (Object.keys(payload).length === 0) expect(result).toEqual({ success: true, data: [candidate] });
    else expect(result).toEqual({ success: false, error: "Licensed reference provider is unavailable." });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rolls back discovery when membership disappears before persistence", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(providerPayload()))); mocks.txOwner.mockResolvedValue(null);
    expect(await suggestBeautyfeelReferencesAction(input)).toEqual({ success: false, error: "Forbidden" }); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["not-url", "", "http://images.pexels.com/image.jpg", "https://foreign.test/image.jpg", "https://images.pexels.com:8443/image.jpg"])("direct trusted-image URL schema safely rejects %s", value => {
    expect(trustedReferenceImageUrlSchema.safeParse(value).success).toBe(false);
  });
  it("direct trusted-image URL schema canonicalizes a valid default HTTPS port", () => {
    expect(trustedReferenceImageUrlSchema.safeParse("https://images.pexels.com:443/photos/1/image.jpg")).toMatchObject({ success: true, data: candidate.preview_url });
  });
  it.each(["large", "medium"] as const)("preserves provider %s-only source fallback", async variant => {
    const photo = { ...providerPayload().photos[0], src: { [variant]: candidate.preview_url }, width: 12000, height: 8000 };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ photos: [photo] })));
    expect((await suggestBeautyfeelReferencesAction(input)).success).toBe(true);
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ preview_url: candidate.preview_url, quality_score: 5 });
  });
  it("rejects provider records with all usable sources absent before persistence", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ photos: [{ ...providerPayload().photos[0], src: {} }] })));
    expect(await suggestBeautyfeelReferencesAction(input)).toEqual({ success: false, error: "Licensed reference provider is unavailable." }); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["oversized", "malformed-json", "empty", "redirect"])("bounds provider discovery %s response safely", async state => {
    const response = new Response(state === "oversized" ? "x".repeat(1024 * 1024 + 1) : state === "empty" ? "" : "{bad");
    if (state === "redirect") Object.defineProperty(response, "redirected", { value: true });
    mocks.fetch.mockResolvedValue(response);
    expect(await suggestBeautyfeelReferencesAction(input)).toEqual({ success: false, error: "Licensed reference provider is unavailable." }); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["http://images.pexels.com/image.jpg", "https://127.0.0.1/private", "https://localhost/private", "https://169.254.169.254/latest/meta-data", "https://images.pexels.com.evil.test/image.jpg", "https://evil.test@images.pexels.com/image.jpg", "https://images.pexels.com:8443/image.jpg", "file:///etc/passwd", "https://[::1]/private", "https://example.test/image.jpg"])("denies untrusted image URL %s before fetching", async preview_url => {
    mocks.first.mockResolvedValue({ ...candidate, preview_url });
    expect(await run()).toEqual({ success: false, error: "Candidate image URL is not trusted." }); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("denies a non-Pexels provider without trusting its preview", async () => {
    mocks.first.mockResolvedValue({ ...candidate, provider: "WEB_LINK" });
    expect(await run()).toEqual({ success: false, error: "Candidate image URL is not trusted." }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves missing pending candidate and missing preview denials", async () => {
    mocks.first.mockResolvedValue(null); expect(await run()).toEqual({ success: false, error: "Pending candidate not found." });
    mocks.first.mockResolvedValue({ ...candidate, preview_url: null }); expect(await run()).toEqual({ success: false, error: "Link-only candidates cannot be imported until an owned or licensed file is supplied." }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("uses HTTPS approved CDN with credentials omitted and redirects disabled", async () => {
    expect((await run()).success).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(candidate.preview_url, expect.objectContaining({ credentials: "omit", redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it.each(["redirected", "foreign-response-url", "http-error"])("rejects %s response without uploading", async state => {
    const response = image();
    if (state === "redirected") Object.defineProperty(response, "redirected", { value: true });
    if (state === "foreign-response-url") Object.defineProperty(response, "url", { value: "http://169.254.169.254/private" });
    mocks.fetch.mockResolvedValue(state === "http-error" ? new Response("bad", { status: 500 }) : response);
    expect(await run()).toEqual({ success: false, error: "Candidate image could not be downloaded." }); expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["text/html", "image/svg+xml", "application/octet-stream", ""])("rejects unsupported MIME %s", async type => {
    mocks.fetch.mockResolvedValue(image(type)); expect(await run()).toEqual({ success: false, error: "Candidate image type is not supported." }); expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", "IMAGE/PNG; charset=binary"])("accepts shared allowed MIME %s", async type => {
    mocks.fetch.mockResolvedValue(image(type)); expect((await run()).success).toBe(true);
    expect(mocks.put.mock.calls[0][2].contentType).toBe(type.split(";")[0].toLowerCase());
  });
  it("rejects declared size over 10MB before reading", async () => {
    const response = image(); response.headers.set("content-length", String(10 * 1024 * 1024 + 1));
    mocks.fetch.mockResolvedValue(response); expect(await run()).toEqual({ success: false, error: "Candidate exceeds the 10 MB limit." }); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("bounds streamed bytes when content-length is absent or dishonest", async () => {
    mocks.fetch.mockResolvedValue(image("image/jpeg", new Uint8Array(10 * 1024 * 1024 + 1)));
    expect(await run()).toEqual({ success: false, error: "Candidate exceeds the 10 MB limit." }); expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["empty", "absent"])("rejects %s image bodies", async state => {
    mocks.fetch.mockResolvedValue(state === "empty" ? image("image/jpeg", new Uint8Array()) : new Response(null, { headers: { "content-type": "image/jpeg" } }));
    expect(await run()).toEqual({ success: false, error: "Candidate image could not be downloaded." }); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("aborts approval downloads after 10 seconds", async () => {
    vi.useFakeTimers();
    let ready!: () => void; const started = new Promise<void>(resolve => { ready = resolve; });
    mocks.fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("timeout secret")), { once: true }); ready(); }));
    const pending = run(); await started; await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual({ success: false, error: "Candidate image could not be downloaded." }); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("deduplicates before external upload", async () => {
    mocks.first.mockImplementation(async args => args.where.content_hash ? { ...candidate, status: "APPROVED" } : candidate);
    expect(await run()).toEqual({ success: false, error: "A visually identical file has already been approved." }); expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["duplicate", "pending-race", "conditional-race", "membership", "create-error", "update-error", "serialization"])("compensates confirmed own blob on transaction %s", async state => {
    if (state === "duplicate") mocks.txFirst.mockImplementation(async args => args.where.content_hash ? { ...candidate, status: "APPROVED" } : candidate);
    if (state === "pending-race") mocks.txFirst.mockResolvedValue(null);
    if (state === "conditional-race") mocks.updateMany.mockResolvedValue({ count: 0 });
    if (state === "membership") mocks.txOwner.mockResolvedValue(null);
    if (state === "create-error") mocks.asset.mockRejectedValue(new Error("SQL secret"));
    if (state === "update-error") mocks.updateMany.mockRejectedValue(new Error("SQL secret"));
    if (state === "serialization") mocks.transaction.mockRejectedValue({ code: "P2034", message: "secret serialization detail" });
    expect((await run()).success).toBe(false); expect(mocks.del).toHaveBeenCalledWith(blob.url); expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.assetFind).toHaveBeenCalledWith({ where: { business_id: "biz-a", url: blob.url, storage_key: blob.pathname }, select: { id: true } });
  });
  it("repeats tenant, pending state and downloaded snapshot on conditional transition", async () => {
    expect((await run()).success).toBe(true);
    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ id: "candidate-a", business_id: "biz-a", status: "PENDING", updated_at: candidate.updated_at, preview_url: candidate.preview_url, provider: "PEXELS", link_only: false });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not compensate if persistence may already have committed", async () => {
    mocks.transaction.mockRejectedValue(new Error("ambiguous commit")); mocks.assetFind.mockResolvedValue({ id: "committed" });
    expect((await run()).success).toBe(false); expect(mocks.del).not.toHaveBeenCalled();
  });
  it("does not delete a blob when persistence lookup fails", async () => {
    mocks.transaction.mockRejectedValue(new Error("transaction")); mocks.assetFind.mockRejectedValue(new Error("SQL secret"));
    expect((await run()).success).toBe(false); expect(mocks.del).not.toHaveBeenCalled();
  });
  it("keeps compensation errors safe", async () => {
    mocks.transaction.mockRejectedValue(new Error("transaction")); mocks.del.mockRejectedValue(new Error("blob secret"));
    expect(await run()).toEqual({ success: false, error: "Unable to update reference candidates." });
  });
  it("does not report committed approval as failed when cache invalidation throws", async () => {
    mocks.cache.mockImplementation(() => { throw new Error("cache unavailable"); });
    expect((await run()).success).toBe(true); expect(mocks.del).not.toHaveBeenCalled();
  });
  it("does not compensate an unconfirmed failed upload", async () => {
    mocks.put.mockRejectedValue(new Error("provider secret"));
    expect((await run()).success).toBe(false); expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([{ url: "https://foreign.test/asset.jpg", pathname: blob.pathname }, { url: blob.url, pathname: "brand-assets/foreign/existing.jpg" }, { url: "bad", pathname: blob.pathname }])("never compensates foreign/invalid Blob response %s", async value => {
    mocks.put.mockResolvedValue(value); expect(await run()).toEqual({ success: false, error: "Reference asset upload failed." }); expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])("returns safe auth infrastructure failure for entry point %s", async index => {
    mocks.auth.mockRejectedValue(new Error("secret detail"));
    expect(await entryPoints[index]()).toEqual({ success: false, error: "Unable to update reference candidates." }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
