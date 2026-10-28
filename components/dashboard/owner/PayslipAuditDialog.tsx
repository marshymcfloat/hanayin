"use client";

import * as React from "react";
import { AlertTriangle, Loader2, History } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getEmployeePayslipAuditAction } from "@/features/payroll/actions/payslip";

type AuditEntry = {
  id: string;
  payslipId: string;
  action: string;
  actorId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
};

export function PayslipAuditDialog({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: {
  employeeId: number;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "ready"; entries: AuditEntry[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    getEmployeePayslipAuditAction(employeeId)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          const message = result.error || "Failed to load audit history";
          toast.error(message);
          setState({ kind: "error", message });
          return;
        }
        setState({
          kind: "ready",
          entries: "data" in result ? (result.data as AuditEntry[]) : [],
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load history";
        toast.error(message);
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Payslip Audit History
          </DialogTitle>
          <DialogDescription>
            All payslip mutations for <strong>{employeeName}</strong>.
            Ordered newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {state.kind === "loading" ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : state.kind === "error" ? (
            <div className="flex items-center gap-2 py-6 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {state.message}
            </div>
          ) : state.entries.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground text-center">
              No payslip history yet.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {state.entries.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {actionVerb(entry.action)}
          </span>
          <span className="text-xs text-muted-foreground">
            Payslip #{entry.payslipId}
          </span>
        </div>
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
}

function actionVerb(action: string): string {
  const map: Record<string, string> = {
    CREATED: "Released",
    UPDATED: "Updated",
    STATUS_CHANGED: "Status changed",
    CANCELLED: "Voided",
  };
  return map[action] ?? action;
}

function DiffSummary({
  changes,
}: {
  changes: Record<string, unknown> | null;
}) {
  if (!changes) return null;
  const after = isRecord(changes.after) ? changes.after : null;
  if (!after) return null;

  // Highlight the most useful payslip fields for forensic readers.
  // The full record stays in the JSON column for deeper digs.
  const summaryKeys = [
    "net_salary",
    "gross_salary",
    "deduction",
    "basic_salary",
    "commission_total",
    "days_present",
  ];
  const visible = summaryKeys.filter((k) => k in after);
  if (visible.length === 0) return null;

  return (
    <ul
      className={cn(
        "mt-1 grid gap-x-3 gap-y-0.5 text-xs text-muted-foreground",
        "grid-cols-[max-content_1fr] sm:grid-cols-[max-content_1fr_max-content_1fr]",
      )}
    >
      {visible.map((key) => (
        <React.Fragment key={key}>
          <span className="text-muted-foreground/80">{prettyKey(key)}</span>
          <span className="font-medium text-foreground/90">
            {formatValue(after[key])}
          </span>
        </React.Fragment>
      ))}
    </ul>
  );
}

function prettyKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
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
