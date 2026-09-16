import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/features/auth/auth-options";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const skipOutboxMessageSchema = z.object({
  messageId: z.string().min(1),
  reason: z.string().trim().min(3).max(200).optional(),
});

async function logOutboxAdminAction(input: {
  action: string;
  targetId: string;
  businessId: string | null;
  metadata: Record<string, unknown>;
}) {
  const session = await getServerSession(authOptions);
  await prisma.platformActionLog.create({
    data: {
      actor_user: session?.user?.id
        ? { connect: { id: session.user.id } }
        : undefined,
      actor_identifier: session?.user?.contactNumber ?? null,
      action: input.action,
      target_type: "OutboxMessage",
      target_id: input.targetId,
      business: input.businessId
        ? { connect: { id: input.businessId } }
        : undefined,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
  });
}

export async function retryOutboxMessage(messageId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const message = await prisma.outboxMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      processed: true,
      attempts: true,
      last_error: true,
      event_type: true,
      business_id: true,
    },
  });
  if (!message) {
    return { success: false as const, error: "Outbox message not found" };
  }
  if (message.processed && !message.last_error && message.attempts === 0) {
    return {
      success: false as const,
      error: "Processed message without failures cannot be retried.",
    };
  }
  const updated = await prisma.outboxMessage.update({
    where: { id: message.id },
    data: {
      processed: false,
      processed_at: null,
      attempts: 0,
      last_error: null,
    },
  });
  await logOutboxAdminAction({
    action: "OUTBOX_MESSAGE_RETRY_REQUESTED",
    targetId: updated.id,
    businessId: updated.business_id,
    metadata: {
      eventType: updated.event_type,
      previousAttempts: message.attempts,
      hadError: Boolean(message.last_error),
    },
  });
  revalidatePath("/platform/outbox");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}

export async function skipOutboxMessage(
  rawInput: z.infer<typeof skipOutboxMessageSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const input = skipOutboxMessageSchema.parse(rawInput);
  const message = await prisma.outboxMessage.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      processed: true,
      attempts: true,
      last_error: true,
      event_type: true,
      business_id: true,
    },
  });
  if (!message) {
    return { success: false as const, error: "Outbox message not found" };
  }
  if (message.processed && !message.last_error) {
    return {
      success: false as const,
      error: "Message is already processed successfully.",
    };
  }
  const reason = input.reason?.trim() || "Skipped by platform admin";
  const skipError = message.last_error
    ? `[SKIPPED_BY_ADMIN] ${reason} | previous_error=${message.last_error}`
    : `[SKIPPED_BY_ADMIN] ${reason}`;
  const updated = await prisma.outboxMessage.update({
    where: { id: message.id },
    data: {
      processed: true,
      processed_at: new Date(),
      attempts: { increment: 1 },
      last_error: skipError,
    },
  });
  await logOutboxAdminAction({
    action: "OUTBOX_MESSAGE_SKIPPED",
    targetId: updated.id,
    businessId: updated.business_id,
    metadata: {
      eventType: updated.event_type,
      reason,
      previousAttempts: message.attempts,
    },
  });
  revalidatePath("/platform/outbox");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}
