import { connection } from "next/server";

import { prisma } from "@/prisma/prisma";
import {
  type PlatformSearchParams,
  getPlatformFlashMessage,
  PlatformFlashNotice,
} from "../_components/action-feedback";
import {
  PlatformMetricCard,
  PlatformPageHeader,
  platformPanelClass,
} from "../_components/platform-ui";
import { OutboxTableClient } from "./outbox-table-client";

type PlatformOutboxPageProps = {
  searchParams?: PlatformSearchParams;
};

const OUTBOX_MAX_ATTEMPTS = 3;

export default async function PlatformOutboxPage({
  searchParams,
}: PlatformOutboxPageProps) {
  await connection();
  const flash = await getPlatformFlashMessage(searchParams);

  const messages = await prisma.outboxMessage.findMany({
    select: {
      id: true,
      event_type: true,
      aggregate_type: true,
      aggregate_id: true,
      business_id: true,
      processed: true,
      processed_at: true,
      attempts: true,
      last_error: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 250,
  });
  const businessIds = Array.from(
    new Set(messages.map((message) => message.business_id)),
  );
  const businesses = businessIds.length
    ? await prisma.business.findMany({
        where: { id: { in: businessIds } },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      })
    : [];
  const businessById = Object.fromEntries(
    businesses.map((business) => [
      business.id,
      {
        name: business.name,
        slug: business.slug,
      },
    ]),
  );
  const confirmationBookingIds = messages.flatMap((message) => {
    if (message.event_type !== "BOOKING_CONFIRMED") return [];
    const bookingId = Number(message.aggregate_id);
    return Number.isInteger(bookingId) ? [bookingId] : [];
  });
  const confirmationBookings = confirmationBookingIds.length
    ? await prisma.booking.findMany({
        where: { id: { in: confirmationBookingIds } },
        select: {
          id: true,
          confirmation_sms_attempted_at: true,
          confirmation_sms_sent_at: true,
          confirmation_sms_message_id: true,
          confirmation_sms_last_error: true,
        },
      })
    : [];
  const confirmationByBookingId = Object.fromEntries(
    confirmationBookings.map((booking) => [booking.id, booking]),
  );
  const serializedMessages = messages.map((message) => ({
    ...message,
    processed_at: message.processed_at?.toISOString() ?? null,
    created_at: message.created_at.toISOString(),
    delivery_diagnostic:
      message.event_type === "BOOKING_CONFIRMED"
        ? confirmationByBookingId[Number(message.aggregate_id)]
          ? {
              attemptedAt:
                confirmationByBookingId[
                  Number(message.aggregate_id)
                ].confirmation_sms_attempted_at?.toISOString() ?? null,
              sentAt:
                confirmationByBookingId[
                  Number(message.aggregate_id)
                ].confirmation_sms_sent_at?.toISOString() ?? null,
              messageId:
                confirmationByBookingId[Number(message.aggregate_id)]
                  .confirmation_sms_message_id,
              error:
                confirmationByBookingId[Number(message.aggregate_id)]
                  .confirmation_sms_last_error,
            }
          : null
        : null,
  }));

  const pendingCount = messages.filter(
    (message) => !message.processed && message.attempts === 0,
  ).length;
  const retryingCount = messages.filter(
    (message) =>
      !message.processed &&
      message.attempts > 0 &&
      message.attempts < OUTBOX_MAX_ATTEMPTS,
  ).length;
  const terminalCount = messages.filter(
    (message) => !message.processed && message.attempts >= OUTBOX_MAX_ATTEMPTS,
  ).length;
  const skippedCount = messages.filter(
    (message) =>
      message.processed && (message.last_error ?? "").startsWith("[SKIPPED"),
  ).length;
  const processedCount = messages.filter(
    (message) => message.processed && !message.last_error,
  ).length;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Outbox Operations"
        description="Review pending/failed events, retry safe recoveries, and skip unsendable records with explicit operator intent."
      />
      {flash ? <PlatformFlashNotice flash={flash} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <PlatformMetricCard label="Pending" value={pendingCount} />
        <PlatformMetricCard label="Retrying" value={retryingCount} />
        <PlatformMetricCard label="Terminal" value={terminalCount} />
        <PlatformMetricCard label="Skipped" value={skippedCount} />
        <PlatformMetricCard
          label="Processed"
          value={processedCount}
          tone="accent"
        />
      </div>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <OutboxTableClient
          messages={serializedMessages}
          businessById={businessById}
        />
      </section>
    </div>
  );
}
