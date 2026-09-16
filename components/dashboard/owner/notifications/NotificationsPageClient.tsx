"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Mail,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NotificationRecord } from "@/features/notifications/actions/notifications";

type SerializedNotification = Omit<NotificationRecord, "sentAt"> & { sentAt: string };

type Props = {
  businessSlug: string;
  notifications: SerializedNotification[];
  totalCount: number;
  page: number;
  totalPages: number;
  currentType?: string;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMED: "Booking Confirmed",
  BOOKING_CANCELLED: "Booking Cancelled",
  PAYMENT_CONFIRMED: "Payment Receipt",
  REMINDER_DUE: "Appointment Reminder",
  FLOW_REMINDER_SENT: "Service Follow-up",
  RE_ENGAGEMENT_REMINDER_SENT: "Re-engagement",
  PAYSLIP_GENERATED: "Payslip",
};

const EVENT_TYPE_COLORS: Record<string, { badge: string }> = {
  BOOKING_CONFIRMED: { badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" },
  BOOKING_CANCELLED: { badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800" },
  PAYMENT_CONFIRMED: { badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800" },
  REMINDER_DUE: { badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800" },
  FLOW_REMINDER_SENT: { badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800" },
  RE_ENGAGEMENT_REMINDER_SENT: { badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800" },
  PAYSLIP_GENERATED: { badge: "bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-400 dark:border-zinc-700" },
};

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Booking Confirmed", value: "BOOKING_CONFIRMED" },
  { label: "Booking Cancelled", value: "BOOKING_CANCELLED" },
  { label: "Payment Receipt", value: "PAYMENT_CONFIRMED" },
  { label: "Reminders", value: "REMINDER_DUE" },
  { label: "Service Follow-up", value: "FLOW_REMINDER_SENT" },
  { label: "Re-engagement", value: "RE_ENGAGEMENT_REMINDER_SENT" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function ChannelBadge({ sent, label, icon }: { sent: boolean | null; label: string; icon: React.ReactNode }) {
  if (sent === null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium border ${
        sent
          ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
          : "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
      }`}
    >
      {icon}
      {label} {sent ? "✓" : "✗"}
    </span>
  );
}

export function NotificationsPageClient({
  businessSlug,
  notifications,
  totalCount,
  page,
  totalPages,
  currentType,
}: Props) {
  const router = useRouter();

  const navigate = (params: { page?: number; type?: string }) => {
    const searchParams = new URLSearchParams();
    const newPage = params.page ?? page;
    const newType = "type" in params ? params.type : currentType;
    if (newPage > 1) searchParams.set("page", String(newPage));
    if (newType) searchParams.set("type", newType);
    const query = searchParams.toString();
    router.push(`/app/${businessSlug}/notifications${query ? `?${query}` : ""}`);
  };

  return (
    <div className="flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Bell className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Notification History</h1>
              <p className="text-xs text-muted-foreground">{totalCount} total notifications sent</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-5xl mx-auto w-full space-y-4">

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="size-3.5 text-muted-foreground shrink-0" />
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => navigate({ type: opt.value, page: 1 })}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                  (currentType ?? "") === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-16 text-center">
              <Bell className="mb-3 size-8 text-muted-foreground/40" />
              <h3 className="text-sm font-semibold text-foreground">No notifications yet</h3>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Notifications sent to customers will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Desktop table header */}
              <div className="hidden sm:grid grid-cols-[1fr_160px_120px_80px] gap-4 border-b border-border bg-muted/30 px-4 py-2.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notification</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channels</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
              </div>

              <div className="divide-y divide-border">
                {notifications.map((n) => {
                  const typeStyle = EVENT_TYPE_COLORS[n.eventType] ?? { badge: "bg-muted text-muted-foreground border-border" };
                  return (
                    <div key={n.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold border ${typeStyle.badge}`}>
                              {EVENT_TYPE_LABELS[n.eventType] ?? n.eventType}
                            </span>
                            <p className="mt-1 text-sm font-medium text-foreground truncate">{n.subject}</p>
                          </div>
                          {n.success ? (
                            <CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {n.customerName && (
                            <span className="text-xs text-muted-foreground">{n.customerName}</span>
                          )}
                          <ChannelBadge sent={n.smsSent} label="SMS" icon={<MessageSquare className="size-2.5" />} />
                          <ChannelBadge sent={n.emailSent} label="Email" icon={<Mail className="size-2.5" />} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{formatDate(n.sentAt)}</p>
                        {n.failureReason && (
                          <p className="text-[11px] text-red-500 truncate">{n.failureReason}</p>
                        )}
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden sm:grid grid-cols-[1fr_160px_120px_80px] gap-4 items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold border ${typeStyle.badge}`}>
                              {EVENT_TYPE_LABELS[n.eventType] ?? n.eventType}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-foreground truncate">{n.subject}</p>
                          <p className="text-[11px] text-muted-foreground">{formatDate(n.sentAt)}</p>
                        </div>
                        <div className="min-w-0">
                          {n.customerName && (
                            <p className="text-sm text-foreground truncate">{n.customerName}</p>
                          )}
                          {n.customerEmail && (
                            <p className="text-[11px] text-muted-foreground truncate">{n.customerEmail}</p>
                          )}
                          {n.customerPhone && (
                            <p className="text-[11px] text-muted-foreground">{n.customerPhone}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <ChannelBadge sent={n.smsSent} label="SMS" icon={<MessageSquare className="size-2.5" />} />
                          <ChannelBadge sent={n.emailSent} label="Email" icon={<Mail className="size-2.5" />} />
                          {n.smsSent === null && n.emailSent === null && (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </div>
                        <div>
                          {n.success ? (
                            <Badge variant="outline" className="text-[10px] border-green-200 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                              Sent
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                              Failed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => navigate({ page: page - 1 })}
                  className="h-7 w-7 p-0 cursor-pointer"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => navigate({ page: page + 1 })}
                  className="h-7 w-7 p-0 cursor-pointer"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
