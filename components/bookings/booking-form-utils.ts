import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";

export function getMaxBookingDate({
  bookingV2Enabled,
  bookingHorizonDays,
  now = new Date(),
}: {
  bookingV2Enabled: boolean;
  bookingHorizonDays: number;
  now?: Date;
}) {
  const horizon = bookingV2Enabled ? Math.max(1, bookingHorizonDays) : 1;
  const startOfTodayPH = getStartOfDayPH(now);
  const targetDayPH = new Date(
    startOfTodayPH.getTime() + (horizon - 1) * 24 * 60 * 60 * 1000,
  );
  return getEndOfDayPH(targetDayPH);
}

export function getSlotEmptyState({
  isSelectedDateInFuture,
  bookingV2Enabled,
  isSelectedDateToday,
  hasTentativeAlternativeSlots,
}: {
  isSelectedDateInFuture: boolean;
  bookingV2Enabled: boolean;
  isSelectedDateToday: boolean;
  hasTentativeAlternativeSlots: boolean;
}) {
  if (isSelectedDateInFuture && !bookingV2Enabled) {
    return {
      title: "Future slots are currently disabled",
      description: "Ask the business to enable Booking V2 for future-date scheduling.",
    };
  }

  if (isSelectedDateToday && hasTentativeAlternativeSlots) {
    return {
      title: "No guaranteed slots right now",
      description:
        "Estimated slots later today are available. Pick one below or try another time.",
    };
  }

  return {
    title: "No available slots for the selected services",
    description: "Try another date or a different service combination.",
  };
}
