import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ initiator: vi.fn(), mode: vi.fn(), append: vi.fn(), follow: vi.fn() }));
vi.mock("@/features/bookings/booking-addon-access", () => ({ resolveBookingAddOnInitiator: mocks.initiator }));
vi.mock("@/features/bookings/services/booking-addons", async (original) => ({
  ...await original<typeof import("@/features/bookings/services/booking-addons")>(),
  resolveAddOnMutationMode: mocks.mode, appendServicesToUntouchedBooking: mocks.append, createFollowUpAddOnBooking: mocks.follow,
}));
import { addTenantBookingServices } from "./booking-addon-orchestration";
import { BookingAddOnStateRaceError } from "./booking-addons";
import { BookingAddOnError } from "@/features/bookings/booking-addon-errors";
import type { BookingAddOnActor } from "@/features/bookings/booking-addon-access";
const actor: BookingAddOnActor = { success: true, businessId: "biz", businessSlug: "demo", userId: "user", actorType: "OWNER", role: "OWNER", ownerId: 5, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
const input = { bookingId: 1, services: [{ id: 2, quantity: 2, packageId: 3, claimedByCurrentEmployee: true }], initiatorEmployeeId: 11, staffSelectionMode: "REQUIRE_SELECTED" as const };
describe("tenant booking add-on orchestration", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.initiator.mockReturnValue(11); mocks.mode.mockResolvedValue({ mode: "APPEND" }); mocks.append.mockResolvedValue({ bookingId: 1 }); mocks.follow.mockResolvedValue({ bookingId: 4, parentBookingId: 1 }); });
  it("passes verified actor, bounded selections and resolved initiator unchanged to append", async () => {
    await expect(addTenantBookingServices(actor, input)).resolves.toEqual({ mode: "APPENDED", bookingId: 1 });
    expect(mocks.initiator).toHaveBeenCalledWith(actor, 11);
    expect(mocks.mode).toHaveBeenCalledWith(1, actor);
    expect(mocks.append).toHaveBeenCalledWith({ ...input, actorContext: actor, currentEmployeeId: 11 });
    expect(mocks.follow).not.toHaveBeenCalled();
  });
  it("uses same selections and verified initiator in state-race fallback", async () => {
    mocks.append.mockRejectedValue(new BookingAddOnStateRaceError());
    await expect(addTenantBookingServices(actor, input)).resolves.toEqual({ mode: "FOLLOW_UP_CREATED", bookingId: 4, parentBookingId: 1 });
    expect(mocks.follow).toHaveBeenCalledWith({ ...input, actorContext: actor, currentEmployeeId: 11 });
    expect(mocks.follow).toHaveBeenCalledTimes(1);
  });
  it("does not append when resolver selects follow-up", async () => {
    mocks.mode.mockResolvedValue({ mode: "FOLLOW_UP" });
    await expect(addTenantBookingServices(actor, input)).resolves.toEqual({ mode: "FOLLOW_UP_CREATED", bookingId: 4, parentBookingId: 1 });
    expect(mocks.append).not.toHaveBeenCalled();
  });
  it.each([new Error("BOOKING_STATE_CHANGED"), { name: "BookingAddOnStateRaceError" }, new Error("raw SQL"), { code: "P2034" }])("never treats generic failures as state-race fallback", async (error) => {
    mocks.append.mockRejectedValue(error);
    await expect(addTenantBookingServices(actor, input)).rejects.toThrow();
    expect(mocks.follow).not.toHaveBeenCalled();
  });
  it.each(["initiator", "mode", "follow"] as const)("sanitizes %s failures", async (stage) => {
    if (stage === "initiator") mocks.initiator.mockImplementation(() => { throw new Error("raw secret"); });
    else mocks[stage].mockRejectedValue(new Error("raw secret"));
    if (stage === "follow") mocks.mode.mockResolvedValue({ mode: "FOLLOW_UP" });
    await expect(addTenantBookingServices(actor, input)).rejects.toThrow("Unable to add booking services");
  });
  it("preserves intentionally safe feature errors", async () => {
    const error = new BookingAddOnError("Booking not found"); mocks.mode.mockRejectedValue(error);
    await expect(addTenantBookingServices(actor, input)).rejects.toBe(error);
  });
});
