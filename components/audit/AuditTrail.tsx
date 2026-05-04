"use client";

/**
 * Generic audit-trail viewer used by both the booking detail panel and
 * the social-post-request inbox. Reads from
 * {@link getEntityAuditHistoryAction}, which enforces tenant scoping
 * and OWNER-or-MANAGER permission server-side.
 *
 * Implementation note: the inner loader uses a `key={...}` on the
 * mount-once-per-deps pattern so we never call setState synchronously
 * inside an effect (which the eslint react-hooks/set-state-in-effect
 * rule flags). Each (entityType, entityId, limit) tuple gets its own
 * fresh loader instance with state initialized to "loading".
 */

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";

import {
  getEntityAuditHistoryAction,
  type AuditEntry,
} from "./audit-actions";

export type AuditTrailProps = {
  entityType: string;
  entityId: string;
  /** Default 25; clamped 1..200 server-side. */
  limit?: number;
  className?: string;
  /** Render-prop override for action verb rendering (e.g. domain-specific phrasing). */
  formatAction?: (entry: AuditEntry) => string;
};

export function AuditTrail(props: AuditTrailProps) {
  // Remount the loader whenever the request key changes. Initial state
  // is "loading" by virtue of useState's initializer, so the effect
  // never has to call setState synchronously.
  const requestKey = `${props.entityType}:${props.entityId}:${props.limit ?? 25}`;
  return <AuditTrailLoader key={requestKey} {...props} />;
}

function AuditTrailLoader({
  entityType,
  entityId,
  limit = 25,
  className,
  formatAction,
}: AuditTrailProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; entries: AuditEntry[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getEntityAuditHistoryAction(entityType, entityId, limit)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          showActionErrorToast(result.error, { action: "view audit history" });
          setState({ kind: "error", message: result.error });
          return;
        }
        setState({ kind: "ready", entries: result.entries });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        showActionErrorToast(message, { action: "view audit history" });
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, limit]);

  if (state.kind === "loading") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading history…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-destructive",
          className,
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Couldn&apos;t load history.
      </div>
    );
  }

  if (state.entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No history yet.
      </p>
    );
  }

  return (
    <ol
      className={cn("divide-y divide-zinc-100 rounded-lg border border-zinc-100 bg-white", className)}
    >
      {state.entries.map((entry) => {
        const verb = formatAction ? formatAction(entry) : defaultVerb(entry);
        return (
          <li
            key={entry.id}
            className="flex items-start justify-between gap-4 px-3 py-2 text-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-900">{verb}</p>
              <DiffSummary changes={entry.changes} />
            </div>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={entry.createdAt}
              title={entry.createdAt}
            >
              {formatRelative(entry.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

function defaultVerb(entry: AuditEntry): string {
  // Action enum values: CREATED | UPDATED | STATUS_CHANGED | PRICE_MODIFIED |
  //                    CANCELLED | APPROVED | REJECTED
  const map: Record<string, string> = {
    CREATED: "Created",
    UPDATED: "Updated",
    STATUS_CHANGED: "Status changed",
    PRICE_MODIFIED: "Price modified",
    CANCELLED: "Cancelled",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  };
  return map[entry.action] ?? entry.action;
}

function DiffSummary({ changes }: { changes: AuditEntry["changes"] }) {
  if (!changes) return null;
  const before = isRecord(changes.before) ? changes.before : null;
  const after = isRecord(changes.after) ? changes.after : null;
  if (!before && !after) return null;

  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  if (keys.size === 0) return null;

  return (
    <ul className="mt-0.5 list-disc pl-4 text-xs text-muted-foreground">
      {Array.from(keys).map((key) => {
        const b = before?.[key];
        const a = after?.[key];
        return (
          <li key={key}>
            <span className="font-medium text-zinc-700">{key}</span>
            :{" "}
            <span className="break-all">{formatValue(b)}</span>
            {" → "}
            <span className="break-all">{formatValue(a)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return `${h} hr${h === 1 ? "" : "s"} ago`;
  }
  if (diff < 30 * day) {
    const d = Math.floor(diff / day);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString();
}
