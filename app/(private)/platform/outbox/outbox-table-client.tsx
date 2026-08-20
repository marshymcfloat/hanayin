"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  retryOutboxMessageAction,
  skipOutboxMessageAction,
} from "@/lib/server actions/platform-admin";
import {
  PlatformStatusBadge,
  formatPlatformDateTime,
  platformDangerButtonClass,
  platformSecondaryButtonClass,
  platformTableCellClass,
  platformTableClass,
  platformTableContainerClass,
  platformTableHeadClass,
  platformTableWrapCellClass,
} from "../_components/platform-ui";

const OUTBOX_MAX_ATTEMPTS = 3;
const SKIP_REASON = "Skipped from platform outbox queue.";

type OutboxMessageRow = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  business_id: string;
  processed: boolean;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivery_diagnostic: {
    attemptedAt: string | null;
    sentAt: string | null;
    messageId: string | null;
    error: string | null;
  } | null;
};

type OutboxBusinessSummary = {
  name: string;
  slug: string;
};

type OutboxTableClientProps = {
  messages: OutboxMessageRow[];
  businessById: Record<string, OutboxBusinessSummary>;
};

type OptimisticUpdate =
  | {
      type: "retry";
      messageId: string;
    }
  | {
      type: "skip";
      messageId: string;
    };

function getQueueStatus(message: {
  processed: boolean;
  attempts: number;
  last_error: string | null;
}) {
  const error = message.last_error ?? "";
  if (message.processed && error.startsWith("[SKIPPED")) return "SKIPPED";
  if (message.processed) return "PROCESSED";
  if (message.attempts >= OUTBOX_MAX_ATTEMPTS) return "TERMINAL";
  if (message.attempts > 0) return "RETRYING";
  return "PENDING";
}

function normalizeErrorText(value: string | null) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function formatErrorPreview(value: string | null) {
  const compact = normalizeErrorText(value);
  if (!compact) return "-";
  if (compact.length <= 180) return compact;
  return `${compact.slice(0, 180)}...`;
}

function applyOptimisticUpdate(
  messages: OutboxMessageRow[],
  update: OptimisticUpdate,
) {
  return messages.map((message) => {
    if (message.id !== update.messageId) return message;

    if (update.type === "retry") {
      return {
        ...message,
        processed: false,
        processed_at: null,
        attempts: 0,
        last_error: null,
      };
    }

    const previousError = normalizeErrorText(message.last_error);
    const skipError = previousError
      ? `[SKIPPED_BY_ADMIN] ${SKIP_REASON} | previous_error=${previousError}`
      : `[SKIPPED_BY_ADMIN] ${SKIP_REASON}`;

    return {
      ...message,
      processed: true,
      processed_at: new Date().toISOString(),
      attempts: message.attempts + 1,
      last_error: skipError,
    };
  });
}

export function OutboxTableClient({
  messages,
  businessById,
}: OutboxTableClientProps) {
  const router = useRouter();
  const [optimisticMessages, queueOptimisticUpdate] = useOptimistic(
    messages,
    applyOptimisticUpdate,
  );
  const [pendingById, setPendingById] = useState<
    Record<string, "retry" | "skip">
  >({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setPendingAction = (
    messageId: string,
    action: "retry" | "skip" | null,
  ) => {
    setPendingById((previous) => {
      if (!action) {
        if (!previous[messageId]) return previous;
        const next = { ...previous };
        delete next[messageId];
        return next;
      }
      return { ...previous, [messageId]: action };
    });
  };

  const runRowAction = (messageId: string, action: "retry" | "skip") => {
    setActionError(null);
    setPendingAction(messageId, action);
    queueOptimisticUpdate({ type: action, messageId });

    startTransition(async () => {
      const result =
        action === "retry"
          ? await retryOutboxMessageAction(messageId)
          : await skipOutboxMessageAction({
              messageId,
              reason: SKIP_REASON,
            });

      if (!result.success) {
        setActionError(result.error || "Unable to update outbox message.");
      }

      setPendingAction(messageId, null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {actionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}
      <div className={platformTableContainerClass}>
        <table className={platformTableClass}>
          <thead>
            <tr className="border-b border-stone-200">
              <th className={platformTableHeadClass}>Event</th>
              <th className={platformTableHeadClass}>Business</th>
              <th className={platformTableHeadClass}>Queue Status</th>
              <th className={platformTableHeadClass}>Attempts</th>
              <th className={platformTableHeadClass}>SMS Delivery</th>
              <th className={platformTableHeadClass}>Last Error</th>
              <th className={platformTableHeadClass}>Created</th>
              <th className={platformTableHeadClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {optimisticMessages.map((message) => {
              const queueStatus = getQueueStatus(message);
              const canRetry =
                !message.processed || Boolean(message.last_error);
              const canSkip = !message.processed;
              const business = businessById[message.business_id];
              const pendingAction = pendingById[message.id];
              const isRowPending = Boolean(pendingAction);
              const fullError = normalizeErrorText(message.last_error);

              return (
                <tr
                  key={message.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors"
                >
                  <td
                    className={`${platformTableCellClass} min-w-[190px] ${platformTableWrapCellClass}`}
                  >
                    <p className="font-semibold text-stone-900">
                      {message.event_type}
                    </p>
                    <p className="text-xs text-stone-500">
                      {message.aggregate_type} #{message.aggregate_id}
                    </p>
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[180px] ${platformTableWrapCellClass}`}
                  >
                    <p className="text-stone-900">
                      {business?.name ?? "Unknown business"}
                    </p>
                    <p className="text-xs text-stone-500">
                      {business?.slug ?? message.business_id}
                    </p>
                  </td>
                  <td className={platformTableCellClass}>
                    <PlatformStatusBadge status={queueStatus} />
                  </td>
                  <td className={`${platformTableCellClass} text-stone-600`}>
                    {message.attempts}
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[170px] ${platformTableWrapCellClass}`}
                  >
                    {message.delivery_diagnostic ? (
                      <div
                        className="text-xs leading-5"
                        title={message.delivery_diagnostic.error || undefined}
                      >
                        <p className="font-medium text-stone-800">
                          {message.delivery_diagnostic.sentAt
                            ? "Sent"
                            : message.delivery_diagnostic.error
                              ? "Failed — manual review"
                              : message.delivery_diagnostic.attemptedAt
                                ? "Attempted"
                                : "Not attempted"}
                        </p>
                        {message.delivery_diagnostic.messageId ? (
                          <p className="text-stone-500">
                            ID: {message.delivery_diagnostic.messageId}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[280px] max-w-[440px] ${platformTableWrapCellClass}`}
                  >
                    <p
                      className="text-xs leading-5 text-stone-500"
                      title={fullError || undefined}
                    >
                      {formatErrorPreview(message.last_error)}
                    </p>
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[150px] ${platformTableWrapCellClass}`}
                  >
                    <p className="text-stone-900">
                      {formatPlatformDateTime(new Date(message.created_at))}
                    </p>
                    {message.processed_at ? (
                      <p className="text-xs text-stone-400">
                        Processed:{" "}
                        {formatPlatformDateTime(new Date(message.processed_at))}
                      </p>
                    ) : null}
                  </td>
                  <td className={`${platformTableCellClass} min-w-[220px]`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {canRetry ? (
                        <button
                          type="button"
                          disabled={isRowPending}
                          onClick={() => runRowAction(message.id, "retry")}
                          className={platformSecondaryButtonClass}
                        >
                          {pendingAction === "retry" ? "Retrying..." : "Retry"}
                        </button>
                      ) : null}
                      {canSkip ? (
                        <button
                          type="button"
                          disabled={isRowPending}
                          onClick={() => runRowAction(message.id, "skip")}
                          className={platformDangerButtonClass}
                        >
                          {pendingAction === "skip" ? "Skipping..." : "Skip"}
                        </button>
                      ) : null}
                      {isRowPending ? (
                        <span className="text-xs text-stone-400">
                          Saving...
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
