"use client";

/**
 * Reviewer-facing inbox for SocialPostRequests. Renders pending /
 * approved / rejected tabs. Approve creates a SocialPost draft and
 * navigates to it; reject collects a reason inline.
 *
 * Visibility is gated at the call site (the social-posts page renders
 * this only when the viewer has SOCIAL_POST_REVIEW). Server actions
 * still enforce permission server-side.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Loader2,
  X,
  ChevronRight,
  Inbox,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import {
  approveSocialPostRequestAction,
  listSocialPostRequestsAction,
  rejectSocialPostRequestAction,
  type SocialPostRequestSummary,
} from "@/features/social/actions/social-post-requests";
import { cn } from "@/lib/utils";

type Tab = "PENDING" | "APPROVED" | "REJECTED";

const TAB_LABELS: Record<Tab, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const TAB_ICONS: Record<Tab, React.ComponentType<{ className?: string }>> = {
  PENDING: Inbox,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
};

export type RequestsInboxProps = {
  businessSlug: string;
};

export function RequestsInbox({ businessSlug }: RequestsInboxProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; requests: SocialPostRequestSummary[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  // Wave G5: react-hooks/set-state-in-effect rejects synchronous
  // setState inside a useEffect. Split the "reset to loading on
  // (businessSlug|tab|refreshKey) change" responsibility into a
  // prev-value comparison during render — the React-docs canonical
  // pattern — and keep only the async fetch resolution in the
  // effect. The bumpable refreshKey lets the explicit Refresh button
  // trigger a re-fetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerKey = `${businessSlug}|${tab}|${refreshKey}`;
  const [lastTriggerKey, setLastTriggerKey] = useState<string | null>(null);
  if (lastTriggerKey !== triggerKey) {
    setLastTriggerKey(triggerKey);
    setState({ kind: "loading" });
  }

  // Fetch on mount and on tab/refresh change.
  useEffect(() => {
    let cancelled = false;
    listSocialPostRequestsAction({
      businessSlug,
      scope: "ALL",
      status: tab,
      limit: 50,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setState({ kind: "error", message: res.error });
          return;
        }
        setState({ kind: "ready", requests: res.requests });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState({ kind: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [businessSlug, tab, refreshKey]);

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    router.refresh();
  };

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          Post requests from your team
        </h2>
        <div className="flex items-center gap-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  tab === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-zinc-200 bg-white text-muted-foreground hover:bg-zinc-50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {state.kind === "loading" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-destructive py-4">
          Couldn&apos;t load requests: {state.message}
        </p>
      )}

      {state.kind === "ready" && state.requests.length === 0 && (
        <p className="text-xs text-muted-foreground py-4">
          No {TAB_LABELS[tab].toLowerCase()} requests.
        </p>
      )}

      {state.kind === "ready" && state.requests.length > 0 && (
        <ol className="divide-y divide-zinc-100 -mx-4">
          {state.requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              businessSlug={businessSlug}
              onAction={refresh}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function RequestCard({
  request,
  businessSlug,
  onAction,
}: {
  request: SocialPostRequestSummary;
  businessSlug: string;
  onAction: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await approveSocialPostRequestAction({
        businessSlug,
        requestId: request.id,
      });
      if (!res.success) {
        showActionErrorToast(res.error, { action: "approve this request" });
        return;
      }
      toast.success("Request approved — draft created.");
      // Soft jump to social-posts so the owner sees the draft they just made.
      router.push(`/app/${businessSlug}/social-posts`);
      onAction();
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (busy || rejectReason.trim().length === 0) return;
    setBusy(true);
    try {
      const res = await rejectSocialPostRequestAction({
        businessSlug,
        requestId: request.id,
        reason: rejectReason.trim(),
      });
      if (!res.success) {
        showActionErrorToast(res.error, { action: "reject this request" });
        return;
      }
      toast.success("Request rejected.");
      setRejecting(false);
      setRejectReason("");
      onAction();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-4 py-3 hover:bg-zinc-50/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">
              {request.topic}
            </p>
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-bold tracking-wider"
            >
              {request.category.replaceAll("_", " ").toLowerCase()}
            </Badge>
            {request.status === "PENDING" && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-200 bg-amber-50 text-amber-700"
              >
                <Clock className="h-3 w-3 mr-1" /> awaiting review
              </Badge>
            )}
          </div>
          {request.brief && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {request.brief}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            From {request.requestedBy.name} ·{" "}
            {formatRelative(request.createdAt)}
          </p>
          {request.rejectionReason && (
            <p className="text-[11px] text-destructive italic">
              Rejected: {request.rejectionReason}
            </p>
          )}
          {request.socialPostId && (
            <a
              href={`/app/${businessSlug}/social-posts`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              View draft <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>

        {request.status === "PENDING" && !rejecting && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setRejecting(true)}
              disabled={busy}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              onClick={handleApprove}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              Approve &amp; draft
            </Button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-3 space-y-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (visible to the requester)"
            rows={2}
            maxLength={500}
            disabled={busy}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                setRejecting(false);
                setRejectReason("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReject}
              disabled={busy || rejectReason.trim().length === 0}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>Confirm reject</>
              )}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
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
