"use client";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import { formatPH } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/utils";
import type {
  BookingStatus,
  BookingPaymentStatus,
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
import { Banknote, ReceiptText, Wallet } from "lucide-react";
import {
  getEmployeeTodayBookingsAction,
} from "@/features/dashboard/actions";
import { RecordPaymentDialog } from "@/components/bookings/RecordPaymentDialog";
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
  payments: Array<{
    id: number;
    status: BookingPaymentStatus;
    payment_method: PaymentMethod;
    amount_principal: number;
    provider_reference: string | null;
    paid_at: Date | null;
  }>;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function getBookingStatusColor(status: BookingStatus) {
  switch (status) {
    case "HOLD":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
    case "ACCEPTED":
    case "COMPLETED":
      // Both states use primary tints; the text label differentiates.
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

  const renderBookingActions = (
    booking: EmployeePaymentBooking,
    options?: { includeDetails?: boolean },
  ) => {
    const canMarkPaid =
      (booking.status === "ACCEPTED" || booking.status === "COMPLETED") &&
      booking.payment_status !== "PAID";
    const includeDetails = Boolean(options?.includeDetails);

    return (
      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {includeDetails && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0 rounded-full border-[#E7E9E4] px-3 text-xs font-medium hover:border-[#72CF35] hover:bg-[#EFF9E8] cursor-pointer"
            onClick={() => setSelectedBooking(booking)}
          >
            <ReceiptText className="mr-1.5 size-3.5" />
            Details
          </Button>
        )}
        {canMarkPaid ? (
          <RecordPaymentDialog
            bookingId={booking.id}
            customerName={getBookingCustomerName(booking)}
            grandTotal={booking.grand_total}
            amountPaid={booking.amount_paid}
            onRecorded={refreshBookings}
            trigger={<Button type="button" size="sm" className="min-h-11 shrink-0 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer"><Banknote className="mr-1.5 size-3.5" />Record payment</Button>}
          />
        ) : null}
      </div>
    );
  };

  return (
    <>
      <section className={cn("flex flex-col", className)}>
        <div className="flex flex-col gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "unsettled" || value === "all") {
                setActiveTab(value);
              }
            }}
          >
            <TabsList className="grid h-10 w-full grid-cols-2 rounded-full bg-foreground/[0.04] p-1">
              <TabsTrigger
                value="unsettled"
                className="rounded-full text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
              >
                Unsettled
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="rounded-full text-xs font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
              >
                Today&apos;s bookings
              </TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              {filteredBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                    <Wallet className="size-5" />
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {activeTab === "unsettled"
                        ? "All settled for today"
                        : "Nothing booked yet today"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Payment entries will appear here as bookings come in.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="-mx-2 divide-y divide-border">
                  {filteredBookings.map((booking) => {
                    const amountPaid = roundMoney(Math.max(0, booking.amount_paid));
                    const remainingBalance = roundMoney(
                      Math.max(0, booking.grand_total - amountPaid),
                    );
                    const unpaidServiceCount =
                      booking.payment_status === "PAID"
                        ? 0
                        : booking.availed_services.length;
                    const customerName = getBookingCustomerName(booking);
                    const initials =
                      customerName
                        .split(" ")
                        .map((n) => n[0])
                        .filter(Boolean)
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "?";

                    return (
                      <li key={booking.id} className="space-y-3 px-2 py-4 first:pt-3 last:pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-inset ring-primary/15">
                              {initials}
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {customerName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Booking #{booking.id} · {getRelativeScheduledLabel(booking)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-5 rounded-full px-2 text-[9px] font-semibold uppercase tracking-wider",
                                getBookingStatusColor(booking.status),
                              )}
                            >
                              {booking.status}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-5 rounded-full px-2 text-[9px] font-semibold uppercase tracking-wider",
                                getPaymentStatusColor(booking.payment_status),
                              )}
                            >
                              {booking.payment_status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>

                        {/* Payment totals — flat 3-column inline grid */}
                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-foreground/[0.02] p-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Total
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                              {formatCurrency(booking.grand_total)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Paid
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-primary tabular-nums">
                              {formatCurrency(amountPaid)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Remaining
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 text-sm font-semibold tabular-nums",
                                remainingBalance > 0
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-foreground",
                              )}
                            >
                              {formatCurrency(remainingBalance)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {booking.availed_services.slice(0, 3).map((item) => (
                            <Badge
                              key={item.id}
                              variant="outline"
                              className="h-5 rounded-full border-primary/20 bg-primary/[0.06] px-2 text-[10px] font-medium text-primary"
                            >
                              {item.service.name}
                            </Badge>
                          ))}
                          {booking.availed_services.length > 3 && (
                            <Badge
                              variant="outline"
                              className="h-5 rounded-full border-black/[0.06] bg-foreground/[0.04] px-2 text-[10px] font-medium text-muted-foreground"
                            >
                              +{booking.availed_services.length - 3} more
                            </Badge>
                          )}
                        </div>

                        <div className="flex justify-end">
                          {renderBookingActions(booking, { includeDetails: true })}
                        </div>

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
        <DialogContent className={`${staffTheme.workspace} sm:max-w-lg rounded-t-3xl rounded-b-none sm:rounded-3xl`}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">
              {selectedBooking
                ? getBookingCustomerName(selectedBooking)
                : "Booking"}
            </DialogTitle>
            {selectedBooking ? (
              <p className="text-xs text-muted-foreground">
                Booking #{selectedBooking.id} ·{" "}
                {getRelativeScheduledLabel(selectedBooking)}
              </p>
            ) : null}
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-5">
              {/* Status badges row */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-6 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider",
                    getBookingStatusColor(selectedBooking.status),
                  )}
                >
                  {selectedBooking.status}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "h-6 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider",
                    getPaymentStatusColor(selectedBooking.payment_status),
                  )}
                >
                  {selectedBooking.payment_status.replace("_", " ")}
                </Badge>
              </div>

              {/* Included services */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Included services
                </p>
                <ul className="-mx-1 divide-y divide-border">
                  {selectedBooking.availed_services.map((item) => (
                    <li
                      key={item.id}
                      className="px-1 py-2.5 text-sm font-medium text-foreground"
                    >
                      {item.service.name}
                    </li>
                  ))}
                </ul>
              </div>

              {selectedBooking.payments.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Payment history</p>
                  <ul className="divide-y rounded-2xl border px-3">
                    {selectedBooking.payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                        <div><span className="font-semibold">{payment.payment_method.replaceAll("_", " ")}</span><span className="ml-2 text-muted-foreground">{payment.status}</span>{payment.provider_reference ? <p className="font-mono text-muted-foreground">{payment.provider_reference}</p> : null}</div>
                        <strong>{formatCurrency(payment.amount_principal)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Totals */}
              <div className="space-y-2 rounded-2xl bg-foreground/[0.02] p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(selectedBooking.grand_total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {formatCurrency(Math.max(0, selectedBooking.amount_paid))}
                  </span>
                </div>
                <Separator className="my-1 bg-border" />
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Remaining
                  </span>
                  <span
                    className={cn(
                      "text-xl font-bold tabular-nums tracking-tight",
                      selectedBooking.grand_total -
                        Math.max(0, selectedBooking.amount_paid) >
                        0
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-primary",
                    )}
                  >
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

              <div className="flex flex-wrap justify-end gap-2">
                {renderBookingActions(selectedBooking)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
