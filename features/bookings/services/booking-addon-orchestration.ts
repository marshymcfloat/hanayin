import "server-only";

import { resolveBookingAddOnInitiator, type BookingAddOnActor } from "@/features/bookings/booking-addon-access";
import type { ValidatedBookingAddOnInput, AddBookingServiceOrCreateFollowUpResult } from "@/features/bookings/booking-addon-schemas";
import { safeBookingAddOnError } from "@/features/bookings/booking-addon-errors";
import { appendServicesToUntouchedBooking, BookingAddOnStateRaceError, createFollowUpAddOnBooking, resolveAddOnMutationMode } from "@/features/bookings/services/booking-addons";

export async function addTenantBookingServices(actorContext: BookingAddOnActor, input: ValidatedBookingAddOnInput): Promise<AddBookingServiceOrCreateFollowUpResult> {
  try {
    const currentEmployeeId = resolveBookingAddOnInitiator(actorContext, input.initiatorEmployeeId);
    const params = { ...input, actorContext, currentEmployeeId };
    const resolution = await resolveAddOnMutationMode(input.bookingId, actorContext);
    if (resolution.mode === "APPEND") {
      try {
        const result = await appendServicesToUntouchedBooking(params);
        return { mode: "APPENDED", bookingId: result.bookingId };
      } catch (error) { if (!(error instanceof BookingAddOnStateRaceError)) throw error; }
    }
    const result = await createFollowUpAddOnBooking(params);
    return { mode: "FOLLOW_UP_CREATED", ...result };
  } catch (error) { throw safeBookingAddOnError(error); }
}
