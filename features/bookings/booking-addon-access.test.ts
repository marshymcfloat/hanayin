import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingAddOnActor } from "./booking-addon-access";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), business: vi.fn(), employee: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", async (original) => ({ ...await original<typeof import("@/lib/auth/staff-access")>(), resolveTenantActorContext: mocks.resolve }));
import { requireBookingAddOnAccess, resolveBookingAddOnInitiator, recheckBookingAddOnAccess } from "./booking-addon-access";

const employee: BookingAddOnActor = {
  success: true, businessId: "biz", businessSlug: "demo", userId: "user", actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 11, ownerId: null,
  profile: "STAFF", permissions: ["BOOKING_CREATE"], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true },
};
const owner: BookingAddOnActor = { ...employee, actorType: "OWNER", role: "OWNER", employeeId: null, ownerId: 5, profile: null };
const db = { business: { findFirst: mocks.business }, employee: { findFirst: mocks.employee }, owner: { findFirst: mocks.owner } } as unknown as Parameters<typeof recheckBookingAddOnAccess>[0];
describe("add-on access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: { id: "user" } } });
    mocks.resolve.mockResolvedValue(employee);
    mocks.business.mockResolvedValue({ id: "biz", structure: "OWNER_EMPLOYEE_SELF_SERVICE", allow_employee_self_booking: true, manager_can_serve: true });
    mocks.employee.mockResolvedValue({ id: 11, profile: "STAFF", permissions: ["BOOKING_CREATE"] });
    mocks.owner.mockResolvedValue({ id: 5 });
  });
  it("authenticates write access and derives identity from session", async () => {
    await expect(requireBookingAddOnAccess()).resolves.toBe(employee);
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.resolve).toHaveBeenCalledWith("demo", "user");
  });
  it.each(["Unauthorized", "Forbidden"])("denies failed auth safely: %s", async (error) => {
    mocks.auth.mockResolvedValue({ success: false, error });
    await expect(requireBookingAddOnAccess()).rejects.toThrow(error);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("rejects missing session identity before context resolution", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "demo", session: { user: {} } });
    await expect(requireBookingAddOnAccess()).rejects.toThrow("Unauthorized");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("hides unexpected auth details", async () => {
    mocks.auth.mockRejectedValue(new Error("raw auth secret"));
    await expect(requireBookingAddOnAccess()).rejects.toThrow("Unable to add booking services");
  });
  it("denies failed context resolution", async () => {
    mocks.resolve.mockResolvedValue({ success: false, error: "Forbidden" });
    await expect(requireBookingAddOnAccess()).rejects.toThrow("Forbidden");
  });
  it.each([{ permissions: [] }, { permissions: ["PAYMENT_COLLECT"] }])("denies staff without either gate", async ({ permissions }) => {
    mocks.resolve.mockResolvedValue({ ...employee, permissions });
    await expect(requireBookingAddOnAccess()).rejects.toThrow("Forbidden");
  });
  it("accepts modify-only permission", async () => {
    mocks.resolve.mockResolvedValue({ ...employee, permissions: ["BOOKING_MODIFY"] });
    await expect(requireBookingAddOnAccess()).resolves.toMatchObject({ permissions: ["BOOKING_MODIFY"] });
  });
  it("preserves owner bypass", async () => {
    mocks.resolve.mockResolvedValue(owner);
    await expect(requireBookingAddOnAccess()).resolves.toBe(owner);
  });
  it("derives staff initiator from employee identity and rejects spoofing", () => {
    expect(resolveBookingAddOnInitiator(employee)).toBe(11);
    expect(resolveBookingAddOnInitiator(employee, 11)).toBe(11);
    expect(() => resolveBookingAddOnInitiator(employee, 12)).toThrow("Forbidden");
  });
  it("preserves owner optional requested employee until transaction check", () => {
    expect(resolveBookingAddOnInitiator(owner)).toBeUndefined();
    expect(resolveBookingAddOnInitiator(owner, 12)).toBe(12);
  });
  it("rechecks exact employee, user role and tenant and uses current permissions", async () => {
    mocks.employee.mockResolvedValue({ id: 11, profile: "MANAGER", permissions: ["BOOKING_MODIFY"] });
    await expect(recheckBookingAddOnAccess(db, employee, 11)).resolves.toMatchObject({ profile: "MANAGER", permissions: ["BOOKING_MODIFY"] });
    expect(mocks.employee).toHaveBeenCalledWith({ where: { id: 11, business_id: "biz", user_id: "user", user: { role: "EMPLOYEE" } }, select: { id: true, profile: true, permissions: true } });
    expect(mocks.business).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "biz", slug: "demo" } }));
  });
  it.each(["business", "employee", "owner"] as const)("denies revoked %s membership", async (delegate) => {
    mocks[delegate].mockResolvedValue(null);
    await expect(recheckBookingAddOnAccess(db, delegate === "owner" ? owner : employee)).rejects.toThrow("Forbidden");
  });
  it("denies currently revoked permissions even if actor snapshot permits", async () => {
    mocks.employee.mockResolvedValue({ id: 11, profile: "STAFF", permissions: ["PAYMENT_COLLECT"] });
    await expect(recheckBookingAddOnAccess(db, employee, 11)).rejects.toThrow("Forbidden");
  });
  it("reapplies default profile permissions for legacy empty arrays", async () => {
    mocks.employee.mockResolvedValue({ id: 11, profile: null, permissions: [] });
    await expect(recheckBookingAddOnAccess(db, employee)).resolves.toMatchObject({ profile: "STAFF", permissions: expect.arrayContaining(["BOOKING_MODIFY"]) });
  });
  it("reapplies current self-booking policy to create-only staff", async () => {
    mocks.business.mockResolvedValue({ id: "biz", structure: "OWNER_EMPLOYEE_SELF_SERVICE", allow_employee_self_booking: false, manager_can_serve: true });
    await expect(recheckBookingAddOnAccess(db, employee)).rejects.toThrow("Forbidden");
    mocks.employee.mockResolvedValue({ id: 11, profile: "STAFF", permissions: ["BOOKING_MODIFY"] });
    await expect(recheckBookingAddOnAccess(db, employee)).resolves.toMatchObject({ businessPolicy: { allowEmployeeSelfBooking: false } });
  });
  it("rejects spoofed transaction initiator for staff", async () => {
    await expect(recheckBookingAddOnAccess(db, employee, 12)).rejects.toThrow("Forbidden");
  });
  it("checks owner optional initiator within verified tenant", async () => {
    await recheckBookingAddOnAccess(db, owner, 12);
    expect(mocks.owner).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5, business_id: "biz", user_id: "user", user: { role: "OWNER" } } }));
    expect(mocks.employee).toHaveBeenCalledWith({ where: { id: 12, business_id: "biz", user: { role: "EMPLOYEE" } }, select: { id: true } });
    mocks.employee.mockResolvedValue(null);
    await expect(recheckBookingAddOnAccess(db, owner, 12)).rejects.toThrow("Employee not found.");
  });
  it("refreshes owner policy and denies selected initiator whose user no longer has employee role", async () => {
    mocks.business.mockResolvedValue({ id: "biz", structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false });
    await expect(recheckBookingAddOnAccess(db, owner)).resolves.toMatchObject({ businessPolicy: { structure: "MANAGER_LED", allowEmployeeSelfBooking: false, managerCanServe: false } });
    mocks.employee.mockImplementation(({ where }) => where.user.role === "EMPLOYEE" ? null : { id: 12 });
    await expect(recheckBookingAddOnAccess(db, owner, 12)).rejects.toThrow("Employee not found.");
  });
  it("fails closed on mismatched or unsupported role snapshots", async () => {
    for (const actor of [{ ...employee, role: "OWNER" }, { ...owner, role: "EMPLOYEE" }, { ...owner, actorType: "ADMIN" }]) {
      await expect(recheckBookingAddOnAccess(db, actor as BookingAddOnActor)).rejects.toThrow("Forbidden");
    }
    expect(mocks.business).not.toHaveBeenCalled();
  });
});
