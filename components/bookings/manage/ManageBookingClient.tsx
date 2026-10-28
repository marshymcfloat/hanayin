"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import {
  PortalCard,
  PortalCardBody,
  PortalCardHeader,
} from "@/components/dashboard/employee/portal/PortalCard";
import DatePicker from "@/components/bookings/DatePicker";
import TimeSlotPicker from "@/components/bookings/TimeSlotPicker";
import {
  getAvailableSlots,
  getDayCapacityRange,
} from "@/features/bookings/actions/availability";
import {
  cancelBookingByCustomerAction,
  rescheduleBookingByCustomerAction,
} from "@/features/bookings/actions/booking-self-serve";
import type { BookingForManage } from "@/features/bookings/self-serve-types";
import { cn, formatCurrency } from "@/lib/utils";

interface ManageBookingClientProps {
  booking: BookingForManage;
}

export function ManageBookingClient({ booking }: ManageBookingClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [view, setView] = React.useState<
    "summary" | "reschedule" | "done"
  >(booking.cancelled ? "done" : "summary");
  const [doneState, setDoneState] = React.useState<
    | { kind: "cancelled" }
    | { kind: "rescheduled"; newScheduledAt: string }
    | null
  >(booking.cancelled ? { kind: "cancelled" } : null);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [pickedDate, setPickedDate] = React.useState<Date | undefined>(
    undefined,
  );
  const [pickedTime, setPickedTime] = React.useState<Date | undefined>(
    undefined,
  );

  // ────────────────── slot lookup queries (reschedule view) ──────────────────

  const services = React.useMemo(
    () => booking.serviceIds.map((id) => ({ id, quantity: 1 })),
    [booking.serviceIds],
  );

  const { data: dayCapacity } = useQuery({
    queryKey: ["dayCapacity", booking.businessSlug, booking.serviceIds.join(",")],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(fromDate.getTime() + 14 * 86400000);
      return getDayCapacityRange({
        businessSlug: booking.businessSlug,
        services,
        fromDate,
        toDate,
      });
    },
    enabled: view === "reschedule" && services.length > 0,
    staleTime: 60_000,
  });

  const { data: slots = [], isLoading: isLoadingSlots } = useQuery({
    queryKey: [
      "manageSlots",
      booking.businessSlug,
      pickedDate?.toISOString(),
      booking.serviceIds.join(","),
    ],
    queryFn: async () => {
      if (!pickedDate) return [];
      return getAvailableSlots({
        businessSlug: booking.businessSlug,
        date: pickedDate,
        services,
      });
    },
    enabled: view === "reschedule" && !!pickedDate,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // ─────────────────────────────── mutations ─────────────────────────────────

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const result = await cancelBookingByCustomerAction({
        token,
        bookingId: booking.bookingId,
        businessSlug: booking.businessSlug,
      });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      setDoneState({ kind: "cancelled" });
      setView("done");
      setCancelDialogOpen(false);
      toast.success("Booking cancelled");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (newScheduledAt: Date) => {
      const result = await rescheduleBookingByCustomerAction({
        token,
        bookingId: booking.bookingId,
        businessSlug: booking.businessSlug,
        newScheduledAt,
      });
      if (!result.success) throw new Error(result.error);
      return newScheduledAt;
    },
    onSuccess: (newScheduledAt) => {
      setDoneState({
        kind: "rescheduled",
        newScheduledAt: newScheduledAt.toISOString(),
      });
      setView("done");
      toast.success("Booking rescheduled");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (view === "done" && doneState) {
    return <DoneView booking={booking} state={doneState} />;
  }

  if (view === "reschedule") {
    return (
      <RescheduleView
        booking={booking}
        pickedDate={pickedDate}
        pickedTime={pickedTime}
        slots={slots}
        isLoadingSlots={isLoadingSlots}
        dayCapacity={dayCapacity}
        onPickDate={(d) => {
          setPickedDate(d);
          setPickedTime(undefined);
        }}
        onPickTime={setPickedTime}
        onBack={() => {
          setView("summary");
          setPickedDate(undefined);
          setPickedTime(undefined);
        }}
        onConfirm={() => {
          if (!pickedTime) return;
          rescheduleMutation.mutate(pickedTime);
        }}
        confirming={rescheduleMutation.isPending}
      />
    );
  }

  return (
    <>
      <SummaryView
        booking={booking}
        onCancel={() => setCancelDialogOpen(true)}
        onReschedule={() => setView("reschedule")}
      />
      <CancelConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        booking={booking}
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
      />
    </>
  );
}

/* ─────────────────────────────── views ─────────────────────────────── */

function SummaryView({
  booking,
  onCancel,
  onReschedule,
}: {
  booking: BookingForManage;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  const blocked = booking.window === "blocked";
  const shortNotice = booking.window === "short_notice";

  return (
    <div className="flex w-full max-w-xl flex-col gap-5 sm:gap-6">
      {/* Hero — same green-gradient recipe as the success page so the
          customer recognizes this as part of the same flow. */}
      <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-emerald-700 to-emerald-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-20px_color-mix(in_oklch,var(--primary)_60%,transparent)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 -z-10 size-48 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_30%,black_30%,transparent_100%)]"
        />
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-50/85">
              Manage your booking
            </p>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              <Sparkles className="size-4" />
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-2xl">
              {booking.businessName}
            </h1>
            <p className="mt-2 text-sm text-emerald-100/85">
              {booking.scheduledAt ? (
                <>
                  <span className="font-medium text-white">
                    {new Date(booking.scheduledAt).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </span>
                  {" · "}
                  <span className="font-medium text-white">
                    {new Date(booking.scheduledAt).toLocaleTimeString(
                      undefined,
                      { hour: "numeric", minute: "2-digit" },
                    )}
                  </span>
                </>
              ) : (
                "Scheduled time not set"
              )}
            </p>
          </div>
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-emerald-50/90 ring-1 ring-inset ring-white/15">
            <span className="tabular-nums">Reference #{booking.bookingId}</span>
          </p>
        </div>
      </div>

      {/* Booking details */}
      <PortalCard>
        <PortalCardHeader
          eyebrow="What you booked"
          title="Booking details"
        />
        <PortalCardBody className="space-y-4">
          {booking.serviceNames.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Services
              </p>
              <div className="flex flex-wrap gap-1.5">
                {booking.serviceNames.map((name, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/15"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-2xl bg-muted/30 p-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatCurrency(booking.totalPrice)}
            </span>
          </div>
        </PortalCardBody>
      </PortalCard>

      {/* Window state + actions */}
      {blocked ? (
        <div className="rounded-3xl border border-black/[0.06] bg-amber-500/10 p-5 ring-1 ring-inset ring-amber-500/20 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
              <AlertTriangle className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                Too close to the appointment
              </p>
              <h2 className="mt-0.5 text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
                Online cancel and reschedule are no longer available
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your appointment is less than 6 hours away. Please call{" "}
                <span className="font-medium text-foreground">
                  {booking.businessName}
                </span>{" "}
                directly to make changes.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {shortNotice ? (
            <div className="flex items-start gap-3 rounded-2xl bg-amber-500/5 p-4 ring-1 ring-inset ring-amber-500/15">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Short notice.</span>{" "}
                Less than 24 hours until your appointment — changes are still
                allowed but may be hard for the business to fill last-minute.
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            onClick={onReschedule}
            className="h-12 w-full rounded-2xl text-base shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-16px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
          >
            <RotateCcw className="mr-2 size-4" />
            Reschedule
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 w-full rounded-2xl border-rose-500/20 bg-rose-500/[0.03] text-rose-700 ring-0 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300"
          >
            <Trash2 className="mr-2 size-4" />
            Cancel booking
          </Button>
        </div>
      )}
    </div>
  );
}

function RescheduleView({
  booking,
  pickedDate,
  pickedTime,
  slots,
  isLoadingSlots,
  dayCapacity,
  onPickDate,
  onPickTime,
  onBack,
  onConfirm,
  confirming,
}: {
  booking: BookingForManage;
  pickedDate: Date | undefined;
  pickedTime: Date | undefined;
  slots: Awaited<ReturnType<typeof getAvailableSlots>>;
  isLoadingSlots: boolean;
  dayCapacity: Record<string, number> | undefined;
  onPickDate: (date: Date | undefined) => void;
  onPickTime: (time: Date) => void;
  onBack: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 14);

  return (
    <div className="flex w-full max-w-xl flex-col gap-5 sm:gap-6">
      <PortalCard>
        <PortalCardHeader
          eyebrow="Reschedule"
          title="Pick a new time"
          icon={CalendarCheck}
        />
        <PortalCardBody className="space-y-5">
          <div className="rounded-2xl bg-muted/30 p-3 text-xs text-muted-foreground">
            Currently scheduled:{" "}
            <span className="font-medium text-foreground">
              {booking.scheduledAt
                ? new Date(booking.scheduledAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Date
            </p>
            <DatePicker
              value={pickedDate}
              onChange={onPickDate}
              minDate={new Date()}
              maxDate={maxDate}
              placeholder="Pick a new date"
              dayCapacity={dayCapacity}
            />
          </div>

          {pickedDate ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Available slots
              </p>
              <TimeSlotPicker
                slots={slots}
                value={pickedTime}
                onChange={onPickTime}
                isLoading={isLoadingSlots}
                isPublic
                emptyTitle="No slots open on this day"
                emptyDescription="Try a different date — or contact the business if you need help."
              />
            </div>
          ) : null}
        </PortalCardBody>
      </PortalCard>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-11 rounded-2xl border-black/[0.06]"
          disabled={confirming}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!pickedTime || confirming}
          className="h-11 rounded-2xl"
        >
          {confirming ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Confirming…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 size-4" />
              Confirm reschedule
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function DoneView({
  booking,
  state,
}: {
  booking: BookingForManage;
  state:
    | { kind: "cancelled" }
    | { kind: "rescheduled"; newScheduledAt: string };
}) {
  const cancelled = state.kind === "cancelled";
  return (
    <div className="flex w-full max-w-xl flex-col gap-5 sm:gap-6">
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-3xl text-white",
          cancelled
            ? "bg-gradient-to-br from-rose-600 via-rose-700 to-rose-900"
            : "bg-gradient-to-br from-primary via-emerald-700 to-emerald-900",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-20px_rgba(0,0,0,0.18)]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 -z-10 size-48 rounded-full bg-white/15 blur-3xl"
        />
        <div className="flex flex-col gap-3 p-6 sm:p-8">
          <span className="grid size-9 w-fit place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
            {cancelled ? (
              <XCircle className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
          </span>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
            {cancelled ? "Booking cancelled" : "Booking rescheduled"}
          </h1>
          {cancelled ? (
            <p className="text-sm text-white/85">
              Your booking with{" "}
              <span className="font-medium text-white">
                {booking.businessName}
              </span>{" "}
              has been cancelled.
            </p>
          ) : (
            <p className="text-sm text-white/85">
              Your new time is{" "}
              <span className="font-medium text-white">
                {new Date(state.newScheduledAt).toLocaleString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              .
            </p>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        You can close this tab. The business will see the change in their dashboard.
      </p>
    </div>
  );
}

/* ──────────────────────────── cancel dialog ──────────────────────────── */

function CancelConfirmDialog({
  open,
  onOpenChange,
  booking,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingForManage;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl border-black/[0.06] sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20 dark:text-rose-300">
              <Trash2 className="size-4" />
            </span>
            <div className="space-y-1 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Cancel booking
              </p>
              <AlertDialogTitle className="text-base font-semibold tracking-[-0.01em] sm:text-[17px]">
                Cancel your booking with {booking.businessName}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {booking.window === "short_notice"
                  ? "This is short notice — please consider rescheduling instead so the business has time to fill your slot."
                  : "You can rebook at any time from the business's booking page."}{" "}
                {booking.amountPaid > 0
                  ? "Any payments will be handled by the business directly."
                  : null}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Keep booking</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="rounded-full bg-rose-600 text-white hover:bg-rose-600/90 focus:ring-rose-500/40"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              "Cancel booking"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

void Clock; // imported for future "X hours from now" badge — keeping the icon set stable
