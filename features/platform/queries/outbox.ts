import { requirePlatformAdmin } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

const OUTBOX_MAX_ATTEMPTS = 3;

export async function getPlatformOutboxData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return null;
  const messages = await prisma.outboxMessage.findMany({ select: { id: true, event_type: true, aggregate_type: true, aggregate_id: true, business_id: true, processed: true, processed_at: true, attempts: true, last_error: true, created_at: true }, orderBy: { created_at: "desc" }, take: 250 });
  const businessIds = Array.from(new Set(messages.map((message) => message.business_id)));
  const businesses = businessIds.length ? await prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true, slug: true } }) : [];
  const businessById = Object.fromEntries(businesses.map((business) => [business.id, { name: business.name, slug: business.slug }]));
  const confirmationBookingIds = messages.flatMap((message) => message.event_type === "BOOKING_CONFIRMED" && Number.isInteger(Number(message.aggregate_id)) ? [Number(message.aggregate_id)] : []);
  const confirmationBookings = confirmationBookingIds.length ? await prisma.booking.findMany({ where: { id: { in: confirmationBookingIds } }, select: { id: true, confirmation_sms_attempted_at: true, confirmation_sms_sent_at: true, confirmation_sms_message_id: true, confirmation_sms_last_error: true } }) : [];
  const confirmationByBookingId = Object.fromEntries(confirmationBookings.map((booking) => [booking.id, booking]));
  const serializedMessages = messages.map((message) => {
    const confirmation = confirmationByBookingId[Number(message.aggregate_id)];
    return { ...message, processed_at: message.processed_at?.toISOString() ?? null, created_at: message.created_at.toISOString(), delivery_diagnostic: message.event_type === "BOOKING_CONFIRMED" && confirmation ? { attemptedAt: confirmation.confirmation_sms_attempted_at?.toISOString() ?? null, sentAt: confirmation.confirmation_sms_sent_at?.toISOString() ?? null, messageId: confirmation.confirmation_sms_message_id, error: confirmation.confirmation_sms_last_error } : null };
  });
  return { serializedMessages, businessById,
    pendingCount: messages.filter((message) => !message.processed && message.attempts === 0).length,
    retryingCount: messages.filter((message) => !message.processed && message.attempts > 0 && message.attempts < OUTBOX_MAX_ATTEMPTS).length,
    terminalCount: messages.filter((message) => !message.processed && message.attempts >= OUTBOX_MAX_ATTEMPTS).length,
    skippedCount: messages.filter((message) => message.processed && (message.last_error ?? "").startsWith("[SKIPPED")).length,
    processedCount: messages.filter((message) => message.processed && !message.last_error).length };
}
