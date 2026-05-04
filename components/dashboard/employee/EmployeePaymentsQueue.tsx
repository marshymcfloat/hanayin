"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import { formatPH } from "@/lib/date-utils";
import type {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/prisma/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, ReceiptText, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  getEmployeeTodayBookingsAction,
  markEmployeeBookingPaidAction,
} from "@/lib/server actions/dashboard";
import { cn } from "@/lib/utils";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
} from "@/lib/utils/employee-specialties";

export type EmployeePaymentBooking = {
  id: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  grand_total: number;
  amount_paid: number;
  created_at: Date;
  scheduled_at: Date | null;
  customer: {
    name: string;
    email: string | null;
  } | null;
  is_anonymous_walk_in?: boolean | null;
  customer_label?: string | null;
  availed_services: Array<{
    id: number;
    service: {
      name: string;
      category: string;
    };
  }>;
};

const formatCurrency = (amount: number) =>
  `PHP ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function getBookingStatusColor(status: BookingStatus) {
  switch (status) {
    case "HOLD":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
    case "ACCEPTED":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300";
    case "COMPLETED":
      return "border-primary/30 bg-primary/10 text-primary";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getPaymentStatusColor(status: PaymentStatus) {
  switch (status) {
    case "PAID":
      return "border-primary/30 bg-primary/10 text-primary";
    case "PARTIALLY_PAID":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getRelativeScheduledLabel(booking: EmployeePaymentBooking) {
  const source = booking.scheduled_at || booking.created_at;
  return formatPH(source, "MMM d, h:mm a");
}

export default function EmployeePaymentsQueue({
  businessSlug,
  bookings: initialBookings,
  employeeSpecialties,
  className,
}: {
  businessSlug: string;
  bookings: EmployeePaymentBooking[];
  employeeSpecialties?: string[];
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"unsettled" | "all">("unsettled");
  const [selectedBooking, setSelectedBooking] =
    useState<EmployeePaymentBooking | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const queryKey = ["employee-today-bookings", businessSlug];
  const { data: bookings = [] } = useQuery({
    queryKey,
    queryFn: () => getEmployeeTodayBookingsAction(),
    initialData: initialBookings,
    refetchInterval: 15_000,
  });

  const employeeSpecialtySet = useMemo(
    () => getEmployeeSpecialtySet(employeeSpecialties),
    [employeeSpecialties],
  );

  const visibleBookings = useMemo(
    () =>
      bookings.filter((booking) =>
        hasAnyAllowedCategoryForEmployee(
          booking.availed_services.map((item) => item.service.category),
          employeeSpecialtySet,
        ),
      ),
    [bookings, employeeSpecialtySet],
  );

  const filteredBookings = useMemo(() => {
    if (activeTab === "all") return visibleBookings;
    return visibleBookings.filter((booking) => booking.payment_status !== "PAID");
  }, [activeTab, visibleBookings]);

  const refreshBookings = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const handleMarkPaid = async (booking: EmployeePaymentBooking) => {
    setActionId(booking.id);
    setSelectedBooking(booking);
    try {
      const result = await markEmployeeBookingPaidAction(booking.id);
      if (!result.success) {
        toast.error(result.error || "Unable to mark booking as paid.");
        return;
      }

      toast.success("Booking marked as paid.");
      await refreshBookings();
    } finally {
      setActionId(null);
    }
  };

  const renderBookingActions = (
    booking: EmployeePaymentBooking,
    options?: { includeDetails?: boolean },
  ) => {
    const canMarkPaid =
      booking.status !== "CANCELLED" && booking.payment_status !== "PAID";
    const isLoading = actionId === booking.id;
    const includeDetails = Boolean(options?.includeDetails);

    return (
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {includeDetails && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 rounded-md px-2 text-[11px] font-medium cursor-pointer"
            onClick={() => setSelectedBooking(booking)}
          >
            <ReceiptText className="h-3 w-3 mr-1" />
            Details
          </Button>
        )}
        {canMarkPaid && (
          <Button
            type="button"
            size="sm"
            className="h-7 shrink-0 rounded-md px-2 text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            disabled={isLoading}
            onClick={() => handleMarkPaid(booking)}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            )}
            Mark Paid
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <section
        className={cn(
          "rounded-2xl border border-border bg-card overflow-hidden",
          className,
        )}
      >
        <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </span>
            <h3 className="text-[15px] font-bold text-foreground truncate">
              Today&apos;s Payments
            </h3>
          </div>
          <Badge
            variant="outline"
            className="h-5 rounded-full bg-muted px-2 text-[10px] font-medium text-muted-foreground border-border tabular-nums shrink-0"
          >
            {visibleBookings.length} {visibleBookings.length === 1 ? "booking" : "bookings"}
          </Badge>
        </header>

        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "unsettled" || value === "all") {
                setActiveTab(value);
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-2 h-9 rounded-lg bg-muted">
              <TabsTrigger value="unsettled" className="rounded-md text-xs cursor-pointer">
                Unsettled
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-md text-xs cursor-pointer">
                All Today
              </TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-3">
              {filteredBookings.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    No bookings in this view
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Payment entries will appear here for today.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {filteredBookings.map((booking) => {
                    const amountPaid = roundMoney(Math.max(0, booking.amount_paid));
                    const remainingBalance = roundMoney(
                      Math.max(0, booking.grand_total - amountPaid),
                    );
                    const unpaidServiceCount =
                      booking.payment_status === "PAID"
                        ? 0
                        : booking.availed_services.length;

                    return (
                      <li key={booking.id} className="py-3 first:pt-3 last:pb-3 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground truncate">
                              {getBookingCustomerName(booking)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Booking #{booking.id} · {getRelativeScheduledLabel(booking)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-4 text-[9px] px-1.5 font-semibold uppercase tracking-wider",
                                getBookingStatusColor(booking.status),
                              )}
                            >
                              {booking.status}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-4 text-[9px] px-1.5 font-semibold uppercase tracking-wider",
                                getPaymentStatusColor(booking.payment_status),
                              )}
                            >
                              {booking.payment_status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>

                        {/* Payment summary — flat 3-column row, no nested card */}
                        <div className="grid grid-cols-3 text-[11px] text-muted-foreground">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-semibold">Total</p>
                            <p className="font-semibold text-foreground tabular-nums">
                              {formatCurrency(booking.grand_total)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-semibold">Paid</p>
                            <p className="font-semibold text-primary tabular-nums">
                              {formatCurrency(amountPaid)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-semibold">Remaining</p>
                            <p className={cn(
                              "font-semibold tabular-nums",
                              remainingBalance > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                            )}>
                              {formatCurrency(remainingBalance)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {booking.availed_services.slice(0, 3).map((item) => (
                            <Badge
                              key={item.id}
                              variant="secondary"
                              className="h-5 bg-muted text-foreground border-border text-[10px] font-medium px-1.5"
                            >
                              {item.service.name}
                            </Badge>
                          ))}
                          {booking.availed_services.length > 3 && (
                            <Badge
                              variant="secondary"
                              className="h-5 bg-muted text-muted-foreground border-border text-[10px] font-medium px-1.5"
                            >
                              +{booking.availed_services.length - 3} more
                            </Badge>
                          )}
                        </div>

                        <div>{renderBookingActions(booking, { includeDetails: true })}</div>

                        {unpaidServiceCount > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {unpaidServiceCount} service
                            {unpaidServiceCount > 1 ? "s" : ""} are still under an
                            unsettled booking payment.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <Dialog
        open={Boolean(selectedBooking)}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
      >
        <DialogContent className="sm:max-w-lg rounded-t-3xl rounded-b-none sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              Booking #{selectedBooking?.id}
              {selectedBooking
                ? ` · ${getBookingCustomerName(selectedBooking)}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Scheduled: {getRelativeScheduledLabel(selectedBooking)}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Included Services
                </p>
                <ul className="divide-y divide-border border-y border-border">
                  {selectedBooking.availed_services.map((item) => (
                    <li
                      key={item.id}
                      className="px-1 py-2 text-sm text-foreground font-medium"
                    >
                      {item.service.name}
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(selectedBooking.grand_total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-semibold text-primary tabular-nums">
                    {formatCurrency(Math.max(0, selectedBooking.amount_paid))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatCurrency(
                      Math.max(
                        0,
                        selectedBooking.grand_total -
                          Math.max(0, selectedBooking.amount_paid),
                      ),
                    )}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-1.5">
                {renderBookingActions(selectedBooking)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
