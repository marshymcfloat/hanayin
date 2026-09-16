"use client";

/**
 * My-Requests page client. Lists the current user's submissions and
 * lets them cancel pending ones. Edit-while-pending is intentionally
 * deferred to a follow-up — for v1 the requester edits by cancelling
 * and resubmitting, which keeps the audit trail clean.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { cancelSocialPostRequestAction } from "@/features/social/actions/social-post-requests";
import type { SocialPostRequestSummary } from "@/features/social/actions/social-post-requests";
import { SuggestPostDialog } from "@/components/dashboard/social-posts/SuggestPostDialog";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<
  SocialPostRequestSummary["status"],
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  APPROVED: {
    label: "Approved",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  REJECTED: {
    label: "Rejected",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "border-zinc-200 bg-zinc-50 text-zinc-600",
  },
};

export function MyRequestsPageClient({
  businessSlug,
  initialRequests,
}: {
  businessSlug: string;
  initialRequests: SocialPostRequestSummary[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCancel(requestId: string) {
    setBusyId(requestId);
    try {
      const res = await cancelSocialPostRequestAction({
        businessSlug,
        requestId,
      });
      if (!res.success) {
        showActionErrorToast(res.error, { action: "cancel this request" });
        return;
      }
      toast.success("Request cancelled.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card px-4 sm:px-8 py-5 sm:py-6">
        <div className="max-w-3xl mx-auto w-full flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <MessageSquarePlus className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">My Requests</h1>
            <p className="text-xs text-muted-foreground">
              Posts you&apos;ve suggested. Owners review each request and
              you&apos;ll be notified when they go live.
            </p>
          </div>
          <SuggestPostDialog businessSlug={businessSlug} />
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-3xl mx-auto w-full space-y-3">
          {initialRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              No requests yet. Click <strong>Suggest a post</strong> above to
              get started.
            </div>
          ) : (
            <ol className="divide-y divide-zinc-100 rounded-2xl border border-border bg-card overflow-hidden">
              {initialRequests.map((req) => {
                const badge = STATUS_BADGE[req.status];
                return (
                  <li key={req.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate flex-1 min-w-[12rem]">
                        {req.topic}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold tracking-wider"
                      >
                        {req.category.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </div>
                    {req.brief && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {req.brief}
                      </p>
                    )}
                    {req.rejectionReason && (
                      <p className="text-xs italic text-destructive">
                        Rejected: {req.rejectionReason}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Submitted {formatRelative(req.createdAt)}
                        {req.reviewedAt
                          ? ` · reviewed ${formatRelative(req.reviewedAt)}`
                          : ""}
                      </span>
                      {req.status === "PENDING" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => handleCancel(req.id)}
                          disabled={busyId === req.id}
                        >
                          {busyId === req.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5 mr-1" />
                          )}
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
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
