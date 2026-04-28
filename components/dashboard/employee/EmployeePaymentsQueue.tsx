"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPH } from "@/lib/date-utils";
import type {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/prisma/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, ReceiptText } from "lucide-react";
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
  };
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
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ACCEPTED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "COMPLETED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

function getPaymentStatusColor(status: PaymentStatus) {
  switch (status) {
    case "PAID":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PARTIALLY_PAID":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
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
    const amountPaid = roundMoney(Math.max(0, booking.amount_paid));
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
            className="h-7 shrink-0 rounded-md border-zinc-200 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={() => setSelectedBooking(booking)}
          >
            <ReceiptText className="h-3 w-3 mr-1" />
            Details
          </Button>
        )}
        {canMarkPaid && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 rounded-md border-zinc-200 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
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
      <Card
        className={cn(
          "rounded-2xl border border-slate-100 shadow-sm bg-white",
          className,
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-[15px] font-bold text-slate-900">
              Today&apos;s Payments
            </CardTitle>
            <Badge
              variant="secondary"
              className="h-5 rounded-full bg-slate-100 px-2 text-[10px] font-medium text-slate-700 border border-slate-200"
            >
              {visibleBookings.length} bookings
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "unsettled" || value === "all") {
                setActiveTab(value);
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-2 h-9 rounded-lg bg-slate-100">
              <TabsTrigger value="unsettled" className="rounded-md text-[11px]">
                Unsettled
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-md text-[11px]">
                All Today
              </TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-3 space-y-2.5">
              {filteredBookings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-900">
                    No bookings in this view
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Payment entries will appear here for today.
                  </p>
                </div>
              ) : (
                filteredBookings.map((booking) => {
                  const amountPaid = roundMoney(Math.max(0, booking.amount_paid));
                  const remainingBalance = roundMoney(
                    Math.max(0, booking.grand_total - amountPaid),
                  );
                  const unpaidServiceCount =
                    booking.payment_status === "PAID"
                      ? 0
                      : booking.availed_services.length;

                  return (
                    <div
                      key={booking.id}
                      className="rounded-lg border border-slate-100 p-3 space-y-2.5 bg-white shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-900">
                            {booking.customer.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Booking #{booking.id} - {getRelativeScheduledLabel(booking)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-4 text-[9px] px-1.5 font-semibold",
                              getBookingStatusColor(booking.status),
                            )}
                          >
                            {booking.status}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-4 text-[9px] px-1.5 font-semibold",
                              getPaymentStatusColor(booking.payment_status),
                            )}
                          >
                            {booking.payment_status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-[11px]">
                        <div className="flex justify-between text-slate-600">
                          <span>Total</span>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(booking.grand_total)}
                          </span>
                        </div>
                        <div className="flex justify-between mt-1 text-slate-600">
                          <span>Paid</span>
                          <span className="font-semibold text-emerald-700">
                            {formatCurrency(amountPaid)}
                          </span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-slate-600">Remaining</span>
                          <span className="font-semibold text-orange-700">
                            {formatCurrency(remainingBalance)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {booking.availed_services.slice(0, 3).map((item) => (
                          <Badge
                            key={item.id}
                            variant="secondary"
                            className="h-5 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium px-1.5"
                          >
                            {item.service.name}
                          </Badge>
                        ))}
                        {booking.availed_services.length > 3 && (
                          <Badge
                            variant="secondary"
                            className="h-5 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-medium px-1.5"
                          >
                            +{booking.availed_services.length - 3} more
                          </Badge>
                        )}
                      </div>

                      <div className="pt-0.5">
                        {renderBookingActions(booking, { includeDetails: true })}
                      </div>

                      {unpaidServiceCount > 0 && (
                        <p className="text-[10px] text-slate-500">
                          {unpaidServiceCount} service
                          {unpaidServiceCount > 1 ? "s" : ""} are still under an
                          unsettled booking payment.
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedBooking)}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Booking #{selectedBooking?.id} - {selectedBooking?.customer.name}
            </DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                Scheduled: {getRelativeScheduledLabel(selectedBooking)}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Included Services
                </p>
                <div className="rounded-lg border border-slate-100 divide-y divide-slate-100">
                  {selectedBooking.availed_services.map((item) => (
                    <div
                      key={item.id}
                      className="px-3 py-2 text-sm text-slate-700 font-medium"
                    >
                      {item.service.name}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(selectedBooking.grand_total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid</span>
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(Math.max(0, selectedBooking.amount_paid))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining</span>
                  <span className="font-semibold text-orange-700">
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

