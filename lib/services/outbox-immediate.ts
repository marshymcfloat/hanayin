import { prisma } from "@/prisma/prisma";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { isOutboxEventType, parseOutboxPayload } from "@/lib/services/outbox";
import {
  deliverOutboxEvent,
  isNonRetryableOutboxError,
} from "@/lib/services/outbox-delivery";

const MAX_ATTEMPTS = 3;

/**
 * Best-effort immediate delivery after an outbox transaction commits.
 * The attempts compare-and-swap prevents racing with the scheduled worker.
 * Failures stay queued so the normal cron can retry them safely.
 */
export async function deliverOutboxMessageNow(messageId: string) {
  const message = await prisma.outboxMessage.findUnique({
    where: { id: messageId },
  });

  if (!message || message.processed || message.attempts >= MAX_ATTEMPTS) {
    return { delivered: false as const, skipped: true as const };
  }

  const claimed = await prisma.outboxMessage.updateMany({
    where: {
      id: message.id,
      processed: false,
      attempts: message.attempts,
    },
    data: { attempts: { increment: 1 } },
  });

  if (claimed.count !== 1) {
    return { delivered: false as const, skipped: true as const };
  }

  try {
    if (!isOutboxEventType(message.event_type)) {
      throw new Error(
        `[Outbox] Unsupported event type "${message.event_type}"`,
      );
    }

    const payload = parseOutboxPayload(message.event_type, message.payload);
    await deliverOutboxEvent({
      eventType: message.event_type,
      payload,
      businessId: message.business_id,
      outboxMessageId: message.id,
    });

    await prisma.outboxMessage.update({
      where: { id: message.id },
      data: {
        processed: true,
        processed_at: getCurrentDateTimePH(),
        last_error: null,
      },
    });

    return { delivered: true as const, skipped: false as const };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const nonRetryable = isNonRetryableOutboxError(error);

    await prisma.outboxMessage.update({
      where: { id: message.id },
      data: {
        processed: nonRetryable,
        processed_at: nonRetryable ? getCurrentDateTimePH() : null,
        last_error: nonRetryable
          ? `[SKIPPED_NON_RETRYABLE] ${errorMessage}`
          : errorMessage,
      },
    });

    logger.warn("[Outbox] Immediate delivery failed; event remains queued", {
      outboxMessageId: message.id,
      eventType: message.event_type,
      error: errorMessage,
    });

    return {
      delivered: false as const,
      skipped: nonRetryable,
      error: errorMessage,
    };
  }
}
