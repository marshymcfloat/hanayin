import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBusinessHours, getServiceCategories, updateBusinessHours } from "./business-hours";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), owner: vi.fn(), read: vi.fn(), current: vi.fn(), remove: vi.fn(), upsert: vi.fn(), update: vi.fn(), transaction: vi.fn(), audit: vi.fn(), conflicts: vi.fn(), warn: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireTenantWriteAccess: mocks.auth, requireOwnerTenantWriteAccess: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: mocks.conflicts }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.read }, businessHours: { upsert: mocks.upsert }, owner: { findFirst: mocks.owner }, $transaction: mocks.transaction } }));

const hour = { day_of_week: 1, category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: false };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "fixture-slug", session: { user: { id: "fixture-user" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", role: "OWNER", businessId: "fixture-business", businessSlug: "fixture-slug", userId: "fixture-user", ownerId: 5 });
  mocks.owner.mockResolvedValue({ id: 5 });
  mocks.read.mockResolvedValue({ id: "fixture-business", business_hours: [hour], services: [{ category: "GENERAL" }, { category: "Spa" }] });
  mocks.current.mockResolvedValue({business_hours:[hour]});
  mocks.transaction.mockImplementation(async callback => callback({ business: { update: mocks.update, findFirst:mocks.current }, businessHours:{deleteMany:mocks.remove}, auditLog: { create: mocks.audit } }));
});

describe("business-hours compatibility", () => {
  it("removes only confirmed tenant categories in the same serializable write",async()=>{
    expect(await updateBusinessHours("fixture-slug",[hour],{expectedHours:[hour],resetCategories:["Spa"]})).toEqual({success:true});
    expect(mocks.current.mock.calls[0][0].where).toMatchObject({id:"fixture-business",slug:"fixture-slug",owners:{some:{id:5}}});
    expect(mocks.remove).toHaveBeenCalledWith({where:{business_id:"fixture-business",category:{in:["Spa"]}}});
    expect(mocks.transaction.mock.calls[0][1]).toMatchObject({isolationLevel:"Serializable"});
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.audit).toHaveBeenCalled();
  });
  it("rejects stale snapshots before removing or writing any hours",async()=>{
    const result=await updateBusinessHours("fixture-slug",[hour],{expectedHours:[],resetCategories:["Spa"]});
    expect(result).toMatchObject({success:false,error:expect.stringContaining("Hours changed")});
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it("rechecks permission inside the transaction before deleting overrides",async()=>{
    mocks.current.mockResolvedValue(null);
    expect(await updateBusinessHours("fixture-slug",[],{expectedHours:[hour],resetCategories:["Spa"]})).toEqual({success:false,error:"Forbidden"});
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([{expectedHours:[hour],resetCategories:["GENERAL"]},{resetCategories:["Spa"]},{expectedHours:[],resetCategories:"Spa"}])("rejects invalid reset options before auth",async options=>{
    expect(await updateBusinessHours("fixture-slug",[],options)).toEqual({success:false,error:"Invalid input"});
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("returns a safe review message for concurrent transaction conflicts",async()=>{
    mocks.transaction.mockRejectedValue({code:"P2034"});
    expect(await updateBusinessHours("fixture-slug",[hour],{expectedHours:[hour],resetCategories:[]})).toMatchObject({success:false,error:expect.stringContaining("Hours changed")});
    expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it("retains public hours and category shapes", async () => {
    expect(await getBusinessHours("fixture-slug")).toEqual([hour]);
    expect(await getServiceCategories("fixture-slug")).toEqual(["GENERAL", "Spa"]);
  });

  it("keeps the latest duplicate and scans conflicts after persistence", async () => {
    expect(await updateBusinessHours("fixture-slug", [hour, { ...hour, close_time: "19:00" }])).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const upserts = mocks.update.mock.calls[0][0].data.business_hours.upsert;
    expect(upserts).toHaveLength(1);
    expect(upserts[0].update.close_time).toBe("19:00");
    expect(mocks.conflicts).toHaveBeenCalledWith({ businessId: "fixture-business", trigger: "BUSINESS_HOURS_UPDATED" });
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.conflicts.mock.invocationCallOrder[0]);
  });

  it("uses narrow public selections and explicitly omits tenant/internal fields", async () => {
    mocks.read.mockResolvedValueOnce({ business_hours: [{ ...hour, id: 9, business_id: "private" }], privateField: "private" });
    expect(await getBusinessHours("fixture-slug")).toEqual([hour]);
    expect(mocks.read.mock.calls[0][0]).toEqual({ where: { slug: "fixture-slug" }, select: { business_hours: { orderBy: { day_of_week: "asc" }, select: { day_of_week: true, open_time: true, close_time: true, is_closed: true, category: true } } } });
    await getServiceCategories("fixture-slug");
    expect(mocks.read.mock.calls[1][0]).toEqual({ where: { slug: "fixture-slug" }, select: { services: { select: { category: true }, distinct: ["category"] } } });
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, "hours", [{ ...hour, day_of_week: -1 }], [{ ...hour, day_of_week: 7 }], [{ ...hour, day_of_week: 1.5 }], [{ ...hour, day_of_week: "1" }], [{ ...hour, open_time: "24:00" }], [{ ...hour, close_time: "18:60" }], [{ ...hour, open_time: "9:00" }], [{ ...hour, is_closed: "true" }], [{ ...hour, category: "" }], [{ ...hour, category: "x".repeat(201) }], Array.from({ length: 501 }, () => hour)])("rejects malformed/oversized hour payloads %j", async input => {
    expect(await updateBusinessHours("fixture-slug", input)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["", "../foreign", "a/b", "x".repeat(201)])("rejects invalid public and write slugs %s", async slug => {
    await expect(getBusinessHours(slug)).rejects.toThrow("Invalid input");
    await expect(getServiceCategories(slug)).rejects.toThrow("Invalid input");
    expect(await updateBusinessHours(slug, [hour])).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each(["Unauthorized", "Forbidden", "Subscription is read only"])("retains %s denials with no writes or scanning", async error => {
    mocks.auth.mockResolvedValue({ success: false, error });
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: false, error });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.conflicts).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("requires current owner membership and settings permission", async () => {
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: false, error: "Forbidden" });
    mocks.owner.mockResolvedValueOnce(null);
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("commits more than 25 distinct hours and audit in one bounded transaction, retaining unspecified entries", async () => {
    const entries = Array.from({ length: 35 }, (_, i) => ({ ...hour, day_of_week: i % 7, category: `Fixture-${Math.floor(i / 7)}`, business_id: "foreign" }));
    expect(await updateBusinessHours("fixture-slug", entries)).toEqual({ success: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const write = mocks.update.mock.calls[0][0];
    expect(write.where).toEqual({ id: "fixture-business", slug: "fixture-slug", owners: { some: { id: 5, business_id: "fixture-business", user_id: "fixture-user", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } } } });
    expect(write.data.business_hours.upsert).toHaveLength(35);
    expect(write.data.business_hours).not.toHaveProperty("deleteMany");
    expect(write.data.business_hours.upsert[0]).toEqual({ where: { business_id_day_of_week_category: { business_id: "fixture-business", day_of_week: 0, category: "Fixture-0" } }, update: { open_time: "09:00", close_time: "18:00", is_closed: false }, create: { ...hour, day_of_week: 0, category: "Fixture-0" } });
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({ actor_id: "fixture-user", business_id: "fixture-business", changes: { after: { mode: "BUSINESS_HOURS_CHANGED" } } });
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.conflicts.mock.invocationCallOrder[0]);
    expect(mocks.cache.mock.calls).toEqual([["/app/fixture-slug/business-hours"], ["/fixture-slug/booking"]]);
  });

  it("accepts closed/equal and overnight hours without changing legacy scheduling semantics", async () => {
    expect(await updateBusinessHours("fixture-slug", [{ ...hour, open_time: "20:00", close_time: "03:00" }, { ...hour, day_of_week: 2, open_time: "00:00", close_time: "00:00", is_closed: true }])).toEqual({ success: true });
  });

  it("retains empty-list success without deleting hours", async () => {
    expect(await updateBusinessHours("fixture-slug", [])).toEqual({ success: true });
    expect(mocks.update.mock.calls[0][0].data.business_hours.upsert).toEqual([]);
  });

  it("denies a removed capability at persistence without audit/scanning/cache", async () => {
    mocks.update.mockRejectedValue({ code: "P2025", message: "private" });
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.conflicts).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["auth", "actor", "owner", "transaction", "update", "audit"] as const)("sanitizes %s failures without post-commit followups", async target => {
    mocks[target].mockRejectedValue(new Error("private database fixture"));
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: false, error: "Unable to update business hours." });
    expect(mocks.conflicts).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("keeps saved-hours success when conflict scanning fails and logs no internal error", async () => {
    mocks.conflicts.mockRejectedValue(new Error("private database fixture"));
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: true });
    expect(mocks.warn).toHaveBeenCalledWith("[BookingConflicts] Failed after business-hours update", { businessId: "fixture-business", businessSlug: "fixture-slug" });
    expect(mocks.cache).toHaveBeenCalledTimes(2);
  });

  it("reports persisted success even when post-commit route revalidation fails", async () => {
    mocks.cache.mockImplementationOnce(() => { throw new Error("cache unavailable"); });
    expect(await updateBusinessHours("fixture-slug", [hour])).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.cache).toHaveBeenCalledTimes(2);
  });

  it.each([getBusinessHours, getServiceCategories])("sanitizes missing-business and public query failures", async read => {
    mocks.read.mockResolvedValueOnce(null);
    await expect(read("fixture-slug")).rejects.toThrow(/Unable to load/);
    mocks.read.mockRejectedValueOnce(new Error("private database fixture"));
    await expect(read("fixture-slug")).rejects.toThrow(/Unable to load/);
  });
});
