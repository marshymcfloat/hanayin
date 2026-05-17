"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Clock, Phone, Loader2 } from "lucide-react";
import type { AttendanceImpactBooking } from "@/app/actions/attendance";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * AttendanceImpactDialog — confirmation modal that fires when a manager
 * is about to transition an employee to a status that blocks their
 * bookings (ABSENT / OFF / LEAVE). Surfaces the bookings that will be
 * orphaned so the manager knows the cost of the action before they
 * commit.
 *
 * Open behavior is controlled by the parent — the parent runs the
 * `previewAttendanceImpactAction` server action and decides whether to
 * open this dialog (only when there's at least one affected booking).
 * Zero-impact transitions skip the dialog entirely.
 */
export interface AttendanceImpactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name of the employee being marked unavailable. */
  employeeName: string;
  /** "absent" / "off" / "leave" — the verb shown in the headline. */
  newStatusLabel: string;
  bookings: AttendanceImpactBooking[];
  loading?: boolean;
  onConfirm: () => void;
}

export function AttendanceImpactDialog({
  open,
  onOpenChange,
  employeeName,
  newStatusLabel,
  bookings,
  loading,
  onConfirm,
}: AttendanceImpactDialogProps) {
  const count = bookings.length;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl border-black/[0.06] sm:max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0 leading-tight space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Attendance change
              </p>
              <AlertDialogTitle className="text-base font-semibold tracking-[-0.01em] sm:text-[17px]">
                {count} booking{count === 1 ? "" : "s"} will lose their assigned staff
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Marking <span className="font-medium text-foreground">{employeeName}</span> as{" "}
                <span className="font-medium text-foreground">{newStatusLabel}</span> will unassign
                them from these bookings. They&apos;ll fall back to any-available staff or need
                manual reassignment.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <ul className="max-h-[18rem] overflow-y-auto rounded-2xl border border-black/[0.06] bg-muted/20 p-1 space-y-1">
          {bookings.map((b) => (
            <li
              key={b.bookingId}
              className="rounded-xl bg-background p-3 ring-1 ring-inset ring-black/[0.04]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-foreground truncate">
                    {b.customerName ?? `Booking #${b.bookingId}`}
                  </p>
                  {b.customerPhone ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="size-3 shrink-0" />
                      <span className="tabular-nums">{b.customerPhone}</span>
                    </p>
                  ) : null}
                </div>
                <div className="text-right shrink-0">
                  <p className="flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted-foreground">
                    <Clock className="size-3" />
                    {b.scheduledAt
                      ? new Date(b.scheduledAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                          timeZone: "Asia/Manila",
                        })
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">
                    {formatCurrency(b.totalPrice)}
                  </p>
                </div>
              </div>

              {b.serviceNames.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {b.serviceNames.slice(0, 4).map((name, i) => (
                    <span
                      key={`${b.bookingId}-${i}`}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-inset ring-primary/15"
                    >
                      {name}
                    </span>
                  ))}
                  {b.serviceNames.length > 4 ? (
                    <span className="text-[10px] text-muted-foreground">
                      +{b.serviceNames.length - 4} more
                    </span>
                  ) : null}
                </div>
              ) : null}

              {b.paymentStatus !== "UNPAID" ? (
                <p
                  className={cn(
                    "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ring-1 ring-inset",
                    b.paymentStatus === "PAID"
                      ? "bg-primary/10 text-primary ring-primary/15"
                      : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
                  )}
                >
                  {b.paymentStatus.replace("_", " ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="rounded-full bg-amber-500 text-white hover:bg-amber-500/90 focus:ring-amber-500/40"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Applying…
              </>
            ) : (
              `Mark ${newStatusLabel} anyway`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
