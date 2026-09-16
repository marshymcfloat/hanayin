import { connection } from "next/server";

import { getPlatformOutboxData } from "@/features/platform/queries/outbox";
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

export default async function PlatformOutboxPage({
  searchParams,
}: PlatformOutboxPageProps) {
  await connection();
  const flash = await getPlatformFlashMessage(searchParams);

  const data = await getPlatformOutboxData();
  if (!data) return null;
  const { serializedMessages, businessById, pendingCount, retryingCount, terminalCount, skippedCount, processedCount } = data;

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
