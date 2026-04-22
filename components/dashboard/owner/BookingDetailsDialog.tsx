"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPH } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  Booking,
  Customer,
  AvailedService,
  Service,
  Employee,
  BookingStatus,
  User,
  Voucher,
  Owner,
} from "@/prisma/generated/prisma/client";
import {
  Calendar,
  Clock,
  User as UserIcon,
  Phone,
  Mail,
  Receipt,
  CheckCircle2,
  QrCode,
  Loader2,
  PlusCircle,
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QrPaymentPanel from "@/components/bookings/QrPaymentPanel";
import {
  createBookingBalanceQrAction,
  getBookingQrPaymentReviewAction,
  markBookingPaidAction,
} from "@/lib/server actions/dashboard";
import { markBookingNoShowAction } from "@/lib/server actions/dashboard/owner";
import { addBookingServiceOrCreateFollowUpAction } from "@/lib/server actions/booking-addons";

type BookingWithDetails = Booking & {
  customer: Customer;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

interface BookingDetailsDialogProps {
  booking: BookingWithDetails | null;
  servicesCatalog?: {
    id: number;
    name: string;
    category: string;
    price: number;
    duration: number | null;
  }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (amount: number) =>
  `PHP ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function BookingDetailsDialog({
  booking,
  servicesCatalog = [],
  open,
  onOpenChange,
}: BookingDetailsDialogProps) {
  const router = useRouter();
  const [isReviewingQr, setIsReviewingQr] = useState(false);
  const [isGeneratingBalanceQr, setIsGeneratingBalanceQr] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isMarkingNoShow, setIsMarkingNoShow] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [isAddingService, setIsAddingService] = useState(false);
  const [qrReviewData, setQrReviewData] = useState<{
    qrImage: string;
    expiresAt?: string;
    amountLabel: string;
    status: "pending" | "paid" | "failed" | "expired";
  } | null>(null);

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case "ACCEPTED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "CANCELLED":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  const amountPaid = Math.max(0, booking?.amount_paid || 0);
  const remainingBalance = Math.max(0, (booking?.grand_total || 0) - amountPaid);
  const bookingDateTime = booking?.scheduled_at ?? booking?.created_at ?? new Date();

  const canReviewQr =
    booking?.payment_method === "QRPH" &&
    booking?.payment_status !== "PAID" &&
    Boolean(booking?.paymongo_payment_intent_id);

  const canGenerateBalanceQr =
    booking?.payment_method === "QRPH" &&
    booking?.status !== "CANCELLED" &&
    booking?.payment_status !== "PAID" &&
    remainingBalance > 0;

  const canMarkPaid =
    booking?.status !== "CANCELLED" && booking?.payment_status !== "PAID";
  const canMarkNoShow = booking?.status === "ACCEPTED";
  const payCtaLabel = amountPaid > 0 ? "Pay Remaining" : "Pay Now";
  const canAddService = booking?.status !== "CANCELLED";
  const availableServiceOptions = useMemo(
    () =>
      [...servicesCatalog].sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
      }),
    [servicesCatalog],
  );
  const selectedServiceOption = availableServiceOptions.find(
    (service) => String(service.id) === selectedServiceId,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (availableServiceOptions.length === 0) {
      setSelectedServiceId("");
      return;
    }

    if (
      !selectedServiceId ||
      !availableServiceOptions.some(
        (service) => String(service.id) === selectedServiceId,
      )
    ) {
      setSelectedServiceId(String(availableServiceOptions[0].id));
    }
  }, [open, availableServiceOptions, selectedServiceId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setServiceQuantity(1);
  }, [booking?.id, open]);

  if (!booking) return null;

  const handleReviewQr = async () => {
    setIsReviewingQr(true);
    try {
      const result = await getBookingQrPaymentReviewAction(booking.id);

      if (!result.success || !("data" in result) || !result.data) {
        toast.error(result.error || "Unable to load QR payment.");
        return;
      }

      const qrData = result.data;
      const amount =
        typeof qrData.amount === "number" ? qrData.amount : remainingBalance;

      setQrReviewData({
        qrImage: qrData.qrImage,
        expiresAt: qrData.expiresAt,
        status: qrData.status,
        amountLabel: formatCurrency(amount),
      });
    } finally {
      setIsReviewingQr(false);
    }
  };

  const handleGenerateBalanceQr = async () => {
    setIsGeneratingBalanceQr(true);
    try {
      const result = await createBookingBalanceQrAction(booking.id);
      if (!result.success || !("data" in result) || !result.data) {
        toast.error(result.error || "Unable to generate balance QR.");
        return;
      }

      const qrData = result.data;
      const amount =
        typeof qrData.amount === "number" ? qrData.amount : remainingBalance;

      setQrReviewData({
        qrImage: qrData.qrImage,
        expiresAt: qrData.expiresAt,
        status: qrData.status,
        amountLabel: formatCurrency(amount),
      });
      router.refresh();
    } finally {
      setIsGeneratingBalanceQr(false);
    }
  };

  const handleMarkPaid = async () => {
    setIsMarkingPaid(true);
    try {
      const result = await markBookingPaidAction(booking.id);
      if (!result.success) {
        toast.error(result.error || "Unable to mark booking as paid.");
        return;
      }
      toast.success("Booking marked as paid.");
      router.refresh();
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleMarkNoShow = async () => {
    setIsMarkingNoShow(true);
    try {
      const result = await markBookingNoShowAction(booking.id);
      if (!result.success) {
        toast.error(result.error || "Unable to mark as no-show.");
        return;
      }
      toast.success("Booking marked as no-show.");
      onOpenChange(false);
      router.refresh();
    } finally {
      setIsMarkingNoShow(false);
    }
  };

  const handleAddService = async () => {
    if (!canAddService) {
      toast.error("Cannot add services to a cancelled booking.");
      return;
    }

    if (!selectedServiceId) {
      toast.error("Select a service first.");
      return;
    }

    const serviceId = Number(selectedServiceId);
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      toast.error("Selected service is invalid.");
      return;
    }

    const quantity = Number.isFinite(serviceQuantity)
      ? Math.max(1, Math.min(10, Math.floor(serviceQuantity)))
      : 1;

    setIsAddingService(true);
    try {
      const result = await addBookingServiceOrCreateFollowUpAction({
        bookingId: booking.id,
        services: [{ id: serviceId, quantity }],
      });

      if (result.mode === "APPENDED") {
        toast.success("Service added to the current booking.");
      } else {
        toast.success(
          `Current booking already progressed. Follow-up booking #${result.bookingId} created.`,
        );
      }

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add service.",
      );
    } finally {
      setIsAddingService(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] md:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden overflow-y-auto bg-white border-none shadow-2xl rounded-3xl">
          <DialogHeader className="p-6 pb-4 bg-zinc-50/50 border-b border-zinc-100 flex shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                  Booking Details
                  <span className="text-zinc-400 font-medium text-lg">
                    #{booking.id}
                  </span>
                </DialogTitle>
                <div className="text-sm text-zinc-500 font-medium flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  {formatPH(bookingDateTime, "MMMM d, yyyy")}
                  <span className="text-zinc-300 mx-1">|</span>
                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                  {formatPH(bookingDateTime, "h:mm a")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border",
                    getStatusColor(booking.status),
                  )}
                >
                  {booking.status}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border",
                    booking.payment_status === "PAID"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : booking.payment_status === "PARTIALLY_PAID"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-700",
                  )}
                >
                  {booking.payment_status.replace("_", " ")}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8">
              <section className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <UserIcon className="h-3.5 w-3.5" /> Customer Information
                </h3>
                <div className="bg-zinc-50/80 p-4 rounded-xl border border-zinc-100/80">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                      <span className="text-[10px] uppercase text-zinc-400 font-semibold tracking-wide block mb-1">
                        Full Name
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-900">
                          {booking.customer.name}
                        </span>
                        {booking.customer.trust_tier === "TRUSTED" && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 rounded-md border-emerald-200 text-emerald-700 bg-emerald-50">
                            Trusted
                          </Badge>
                        )}
                        {booking.customer.trust_tier === "RESTRICTED" && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 rounded-md border-red-200 text-red-700 bg-red-50">
                            Restricted
                          </Badge>
                        )}
                        {booking.customer.no_show_count > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 rounded-md border-amber-200 text-amber-700 bg-amber-50">
                            {booking.customer.no_show_count} no-show{booking.customer.no_show_count > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {booking.customer.phone && (
                      <div>
                        <span className="text-[10px] uppercase text-zinc-400 font-semibold tracking-wide block mb-1">
                          Phone Number
                        </span>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="text-sm font-medium text-zinc-700">
                            {booking.customer.phone}
                          </span>
                        </div>
                      </div>
                    )}
                    {booking.customer.email && (
                      <div className="sm:col-span-2">
                        <span className="text-[10px] uppercase text-zinc-400 font-semibold tracking-wide block mb-1">
                          Email Address
                        </span>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="text-sm font-medium text-zinc-700">
                            {booking.customer.email}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <Separator className="bg-zinc-100" />

              <section className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5" /> Services & Pricing
                </h3>
                <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50/80 text-zinc-500 border-b border-zinc-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">
                          Service
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">
                          Staff
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">
                          Price
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 bg-white">
                      {booking.availed_services.map((as) => (
                        <tr
                          key={as.id}
                          className="hover:bg-zinc-50/50 transition-colors"
                        >
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-zinc-900">
                              {as.service.name}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {as.served_by_owner ? (
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold">
                                  {as.served_by_owner.user.name.charAt(0)}
                                </div>
                                <span className="text-zinc-700 font-medium">
                                  {as.served_by_owner.user.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0.5 rounded-md border-amber-200 text-amber-700 bg-amber-50"
                                >
                                  Owner
                                </Badge>
                              </div>
                            ) : as.served_by ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                                  {as.served_by.user.name.charAt(0)}
                                </div>
                                <span className="text-zinc-700 font-medium">
                                  {as.served_by.user.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-xs font-medium border border-amber-100">
                                Unassigned
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-zinc-700">
                            {formatCurrency(as.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <Separator className="bg-zinc-100" />

              <section className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <PlusCircle className="h-3.5 w-3.5" /> Add Service
                </h3>
                {availableServiceOptions.length === 0 ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                    No services available in your catalog yet.
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wide">
                          Service
                        </label>
                        <select
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          value={selectedServiceId}
                          onChange={(event) =>
                            setSelectedServiceId(event.target.value)
                          }
                          disabled={!canAddService || isAddingService}
                        >
                          {availableServiceOptions.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} ({service.category}) -{" "}
                              {formatCurrency(service.price)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wide">
                          Quantity
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={serviceQuantity}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setServiceQuantity(
                              Number.isFinite(value) ? value : 1,
                            );
                          }}
                          disabled={!canAddService || isAddingService}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-xs text-zinc-500">
                        {selectedServiceOption
                          ? `${selectedServiceOption.duration || 30} min | ${formatCurrency(selectedServiceOption.price)} each`
                          : "Select a service to continue."}
                      </p>
                      <Button
                        type="button"
                        onClick={handleAddService}
                        disabled={
                          !canAddService ||
                          !selectedServiceId ||
                          isAddingService
                        }
                        className="rounded-xl"
                      >
                        {isAddingService ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Add To Booking
                          </>
                        )}
                      </Button>
                    </div>
                    {!canAddService && (
                      <p className="text-xs text-red-600">
                        Cancelled bookings cannot receive new services.
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="flex flex-wrap justify-end gap-2 pt-2">
                {canMarkNoShow && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
                        disabled={isMarkingNoShow}
                      >
                        {isMarkingNoShow ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 mr-2" />
                        )}
                        Mark as No-Show
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark as No-Show?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will cancel the booking and record a no-show for{" "}
                          <strong>{booking.customer.name}</strong>. Customers
                          with 2 or more no-shows are restricted from booking.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={handleMarkNoShow}
                        >
                          Confirm No-Show
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {canReviewQr && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={handleReviewQr}
                    disabled={isReviewingQr || isGeneratingBalanceQr}
                  >
                    {isReviewingQr ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4 mr-2" />
                    )}
                    Review QR
                  </Button>
                )}
                {canGenerateBalanceQr && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
                    onClick={handleGenerateBalanceQr}
                    disabled={isGeneratingBalanceQr || isReviewingQr}
                  >
                    {isGeneratingBalanceQr ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4 mr-2" />
                    )}
                    {payCtaLabel}
                  </Button>
                )}
                {canMarkPaid && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    onClick={handleMarkPaid}
                    disabled={isMarkingPaid}
                  >
                    {isMarkingPaid ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Mark as Paid
                  </Button>
                )}
              </section>

              <section className="flex justify-end pt-2">
                <div className="w-full sm:w-2/3 md:w-1/2 bg-zinc-50/50 rounded-xl border border-zinc-100 p-5 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500 font-medium">Subtotal</span>
                    <span className="font-semibold text-zinc-900">
                      {formatCurrency(
                        booking.grand_total + booking.total_discount,
                      )}
                    </span>
                  </div>
                  {booking.total_discount > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-emerald-600 font-medium flex items-center gap-1.5">
                        Discount{" "}
                        {booking.vouchers.length > 0
                          ? `(${booking.vouchers[0].code})`
                          : ""}
                      </span>
                      <span className="font-semibold text-emerald-700">
                        -{formatCurrency(booking.total_discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500 font-medium">Paid</span>
                    <span className="font-semibold text-emerald-700">
                      {formatCurrency(amountPaid)}
                    </span>
                  </div>
                  <Separator className="bg-zinc-200 my-2" />
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-zinc-900">
                        Remaining Balance
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">
                        {booking.payment_status === "PAID"
                          ? "Paid in full"
                          : "Awaiting settlement"}
                      </span>
                    </div>
                    <span className="text-xl font-bold text-zinc-900 tracking-tight">
                      {formatCurrency(remainingBalance)}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {qrReviewData && (
        <QrPaymentPanel
          qrImage={qrReviewData.qrImage}
          amountLabel={qrReviewData.amountLabel}
          status={qrReviewData.status}
          expiresAt={qrReviewData.expiresAt}
          onClose={() => setQrReviewData(null)}
          onRetry={handleReviewQr}
        />
      )}
    </>
  );
}
