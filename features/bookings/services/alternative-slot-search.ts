import "server-only";

export const MAX_ALTERNATIVE_SEARCH_DAYS = 90;

export async function searchAlternativeSlots<T extends { startTime: Date }>({
  scheduledAt,
  startDiff,
  bookingHorizonDays,
  limit,
  computeDay,
}: {
  scheduledAt: Date;
  startDiff: number;
  bookingHorizonDays: number;
  limit: number;
  computeDay: (dayOffset: number) => Promise<T[]>;
}): Promise<T[]> {
  const collected: T[] = [];
  for (
    let scannedDays = 0;
    scannedDays < MAX_ALTERNATIVE_SEARCH_DAYS && startDiff + scannedDays < bookingHorizonDays;
    scannedDays++
  ) {
    const daySlots = await computeDay(startDiff + scannedDays);
    const filtered = scannedDays === 0
      ? daySlots.filter(slot => slot.startTime > scheduledAt)
      : daySlots;
    collected.push(...filtered);
    if (collected.length >= limit) return collected.slice(0, limit);
  }
  return collected.slice(0, limit);
}
