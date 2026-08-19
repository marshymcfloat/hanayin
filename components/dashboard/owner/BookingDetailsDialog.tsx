"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatPH } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import {
  BOOKING_PAYMENT_STAGE_LABELS,
  deriveBookingPaymentStage,
} from "@/lib/utils/booking-payment-stage";
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
  BookingPayment,
} from "@/prisma/generated/prisma/client";
import {
  Calendar,
  Clock,
  Phone,
  Mail,
  CheckCircle2,
  Loader2,
  PlusCircle,
  AlertTriangle,
  Trash2,
  History,
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
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { markBookingPaidAction } from "@/lib/server actions/dashboard";
import { markBookingNoShowAction } from "@/lib/server actions/dashboard/owner";
import { addBookingServiceOrCreateFollowUpAction } from "@/lib/server actions/booking-addons";
import { removeBookingServiceAction } from "@/lib/server actions/booking-modify";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { AuditTrail } from "@/components/audit/AuditTrail";
import { RescheduleDialog } from "@/components/dashboard/owner/booking-actions/RescheduleDialog";
import { CancelBookingDialog } from "@/components/dashboard/owner/booking-actions/CancelBookingDialog";
import { AdjustPriceDialog } from "@/components/dashboard/owner/booking-actions/AdjustPriceDialog";
import { ReassignStaffDialog } from "@/components/dashboard/owner/booking-actions/ReassignStaffDialog";
import { BookingNotesPanel } from "@/components/dashboard/owner/booking-actions/BookingNotesPanel";
import { SwapServiceDialog } from "@/components/dashboard/owner/booking-actions/SwapServiceDialog";
import {
  AvailedServiceStatus,
  PaymentStatus,
} from "@/prisma/generated/prisma/enums";
import { approveGcashPaymentAction } from "@/lib/server actions/manual-gcash";

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  payments?: (BookingPayment & { verified_by?: { name: string } | null })[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

/**
 * Permissions snapshot for the viewer. Computed server-side and passed down
 * so action buttons can render in one of three states: visible-and-clickable,
 * visible-but-disabled-with-tooltip, or hidden entirely. When omitted, the
 * dialog defaults to "owner" behavior (everything enabled) so existing
 * callers (BookingList from the owner dashboard) keep working unchanged.
 */
export type BookingViewerContext = {
  role: "OWNER" | "MANAGER" | "CASHIER" | "STAFF";
  /** True when the viewer is allowed to add services to this booking. */
  canAddService: boolean;
  /** True when the viewer is allowed to record payment on this booking. */
  canMarkPaid: boolean;
  /** True when the viewer is allowed to mark this booking as a no-show. */
  canMarkNoShow: boolean;
  /** True when the viewer is allowed to delete this booking outright. */
  canDelete: boolean;
  /**
   * True when the viewer is allowed to soft-cancel the booking.
   * Distinct from canDelete (irreversible). Defaults align with the
   * matrix: OWNER + MANAGER (with BOOKING_CANCEL) only.
   */
  canCancel: boolean;
  /**
   * True when the viewer is allowed to apply a price adjustment
   * (manual discount or surcharge with a reason).
   */
  canAdjustPrice: boolean;
  /**
   * True when the viewer is allowed to reassign a service line to a
   * different staff member. Powered by QUEUE_OVERRIDE_ALL — managers
   * and owners only.
   */
  canReassignStaff: boolean;
  /**
   * True when the viewer is allowed to expand the booking's audit
   * trail history. Owners + managers only — cashiers and staff
   * intentionally don't see business-level history. Backed by
   * getEntityAuditHistoryAction, which enforces the same rule
   * server-side.
   */
  canSeeAuditTrail: boolean;
};

const DEFAULT_OWNER_VIEWER: BookingViewerContext = {
  role: "OWNER",
  canAddService: true,
  canMarkPaid: true,
  canMarkNoShow: true,
  canDelete: true,
  canCancel: true,
  canAdjustPrice: true,
  canReassignStaff: true,
  canSeeAuditTrail: true,
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
  /**
   * Permissions of the user viewing this dialog. Omit for owner-only
   * callers — defaults to a fully-enabled OWNER context.
   */
  viewerContext?: BookingViewerContext;
}

const formatCurrency = (amount: number) =>
  `₱${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function BookingDetailsDialog({
  booking,
  servicesCatalog = [],
  open,
  onOpenChange,
  viewerContext = DEFAULT_OWNER_VIEWER,
}: BookingDetailsDialogProps) {
  const router = useRouter();
  const params = useParams<{ businessSlug: string }>();
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isVerifyingGcash, setIsVerifyingGcash] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isMarkingNoShow, setIsMarkingNoShow] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [isAddingService, setIsAddingService] = useState(false);
  const [removingLineId, setRemovingLineId] = useState<number | null>(null);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const getStatusColor = (status: BookingStatus) => {
    // Portal pill recipe — `ring-1 ring-inset` instead of border so
    // the chip doesn't add a layout border in cards. Same recipe used
    // by PortalCardHeader's count chip and the public booking surface.
    switch (status) {
      case "ACCEPTED":
      case "COMPLETED":
        // Both states use primary tints; the text label
        // ("ACCEPTED" / "COMPLETED") carries the differentiation.
        return "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 border-transparent";
      case "CANCELLED":
        return "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20 border-transparent dark:text-rose-300";
      default:
        return "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 border-transparent dark:text-amber-300";
    }
  };

  const amountPaid = Math.max(0, booking?.amount_paid || 0);
  const remainingBalance = Math.max(
    0,
    (booking?.grand_total || 0) - amountPaid,
  );
  const bookingDateTime =
    booking?.scheduled_at ?? booking?.created_at ?? new Date();
  const paymentStage = booking ? deriveBookingPaymentStage(booking) : null;
  const pendingGcashPayment = booking?.payments?.[0];
  const canVerifyAwaitingPayment =
    viewerContext.role === "OWNER" &&
    paymentStage === "AWAITING_PAYMENT" &&
    pendingGcashPayment?.status === "PENDING" &&
    !!booking?.hold_expires_at &&
    new Date(booking.hold_expires_at).getTime() > currentTime;

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const canMarkPaid =
    booking?.status === "ACCEPTED" && booking?.payment_status !== "PAID";
  const canMarkNoShow = booking?.status === "ACCEPTED";
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

  // Reset audit-trail open state when the dialog opens / closes / booking changes.
  useEffect(() => {
    if (!open) setIsAuditOpen(false);
  }, [open, booking?.id]);

  if (!booking) return null;

  // Mirrors checkAvailedServiceRemovable in lib/services/booking-modify.ts.
  // Re-implemented in the client purely to decide whether to render the
  // Remove control for a line — the server action remains the security
  // boundary, this is just UX. Keep these rules in sync with the helper.
  const bookingHasPayment =
    Math.round((booking.amount_paid ?? 0) * 100) / 100 > 0 ||
    booking.payment_status !== PaymentStatus.UNPAID;
  const isLineRemovable = (line: { status: AvailedServiceStatus }) =>
    booking.status === "ACCEPTED" &&
    !bookingHasPayment &&
    line.status === AvailedServiceStatus.PENDING &&
    booking.availed_services.length > 1;
  // Mirrors checkAvailedServiceReassignable: PENDING or CLAIMED only,
  // and the booking itself is still active.
  const isLineReassignable = (line: { status: AvailedServiceStatus }) =>
    booking.status !== "CANCELLED" &&
    (line.status === AvailedServiceStatus.PENDING ||
      line.status === AvailedServiceStatus.CLAIMED);

  const handleRemoveLine = async (availedServiceId: number) => {
    setRemovingLineId(availedServiceId);
    try {
      const result = await removeBookingServiceAction({
        bookingId: booking.id,
        availedServiceId,
      });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "remove this service" });
        return;
      }
      toast.success("Service removed");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(message, { action: "remove this service" });
    } finally {
      setRemovingLineId(null);
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

  const handleVerifyUnsubmittedGcash = async () => {
    if (!pendingGcashPayment || !params.businessSlug) return;
    setIsVerifyingGcash(true);
    try {
      const result = await approveGcashPaymentAction({
        paymentId: pendingGcashPayment.id,
        businessSlug: params.businessSlug,
        source: "OWNER_VERIFIED_WITHOUT_SUBMISSION",
        attestation: {
          transactionFound: true,
          recipientMatched: true,
          amountMatched: true,
          detailsReviewed: true,
        },
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment confirmed. The booking is now accepted.");
      onOpenChange(false);
      router.refresh();
    } finally {
      setIsVerifyingGcash(false);
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
        <DialogContent className="w-[95vw] max-w-none max-h-[90dvh] rounded-2xl p-0 gap-0 flex flex-col overflow-hidden bg-white shadow-2xl sm:max-w-2xl sm:max-h-[85vh] sm:rounded-3xl">
          <DialogHeader className="p-4 sm:px-6 sm:py-4 border-b border-border/60 flex shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-1.5">
                  Booking Details
                  <span className="text-muted-foreground/60 font-medium">
                    #{booking.id}
                  </span>
                </DialogTitle>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>{formatPH(bookingDateTime, "MMM d, yyyy")}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{formatPH(bookingDateTime, "h:mm a")}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] rounded-full leading-none h-5",
                      getStatusColor(booking.status),
                    )}
                  >
                    {paymentStage
                      ? BOOKING_PAYMENT_STAGE_LABELS[paymentStage]
                      : booking.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] rounded-full leading-none h-5 border-transparent",
                      booking.payment_status === "PAID"
                        ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
                        : booking.payment_status === "PARTIALLY_PAID"
                          ? "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300"
                          : "bg-muted text-muted-foreground ring-1 ring-inset ring-black/[0.06]",
                    )}
                  >
                    {booking.payment_status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Customer
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {getBookingCustomerName(booking)}
                    </span>
                    {booking.is_anonymous_walk_in && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 rounded-md border-transparent bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300 leading-none font-medium"
                      >
                        Anonymous walk-in
                      </Badge>
                    )}
                    {booking.customer?.trust_tier === "TRUSTED" && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 rounded-md border-primary/30 text-primary bg-primary/10 leading-none font-medium"
                      >
                        Trusted
                      </Badge>
                    )}
                    {booking.customer?.trust_tier === "RESTRICTED" && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 rounded-md border-destructive/30 text-destructive bg-destructive/10 leading-none font-medium"
                      >
                        Restricted
                      </Badge>
                    )}
                    {booking.customer && booking.customer.no_show_count > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 rounded-md border-transparent bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300 leading-none font-medium"
                      >
                        {booking.customer.no_show_count} no-show
                        {booking.customer.no_show_count > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  {(booking.customer?.phone || booking.customer?.email) && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 text-xs text-muted-foreground">
                      {booking.customer?.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          <span className="font-medium text-foreground/80">
                            {booking.customer.phone}
                          </span>
                        </div>
                      )}
                      {booking.customer?.email && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="font-medium text-foreground/80 truncate">
                            {booking.customer.email}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {booking.payments?.[0] && (
                <section className="space-y-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    GCash payment review
                  </h3>
                  <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-4 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Expected amount</dt>
                      <dd className="font-semibold">
                        ₱{booking.payments[0].amount_principal.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Payer</dt>
                      <dd>
                        {booking.payments[0].payer_name || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd className="break-all font-mono">
                        {booking.payments[0].provider_reference ||
                          "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Submitted</dt>
                      <dd>
                        {booking.payments[0].submitted_at
                          ? formatPH(
                              booking.payments[0].submitted_at,
                              "MMM d, h:mm a",
                            )
                          : "Not submitted"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reviewed by</dt>
                      <dd>
                        {booking.payments[0].verified_by?.name ||
                          "Not reviewed"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reviewed</dt>
                      <dd>
                        {booking.payments[0].verified_at
                          ? formatPH(
                              booking.payments[0].verified_at,
                              "MMM d, h:mm a",
                            )
                          : "Not reviewed"}
                      </dd>
                    </div>
                  </dl>
                  {canVerifyAwaitingPayment && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" className="w-full rounded-xl">
                          <CheckCircle2 className="mr-2 size-4" />
                          Check GCash
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-3xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Confirm GCash payment?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            The customer did not notify the salon. Confirm only
                            after finding the transaction in the salon&apos;s
                            GCash history and matching the recipient and exact
                            amount.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                          <span>Booking #{booking.id}</span>
                          <strong>
                            {formatCurrency(
                              pendingGcashPayment.amount_principal,
                            )}
                          </strong>
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isVerifyingGcash}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleVerifyUnsubmittedGcash}
                            disabled={isVerifyingGcash}
                          >
                            {isVerifyingGcash
                              ? "Confirming…"
                              : "Confirm payment"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {booking.payments[0].escalation_reason ? (
                    <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                      <strong>Escalation:</strong>{" "}
                      {booking.payments[0].escalation_reason}
                    </p>
                  ) : null}
                  {booking.payments[0].rejection_reason ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                      <strong>Rejection:</strong>{" "}
                      {booking.payments[0].rejection_reason}
                    </p>
                  ) : null}
                  {booking.payments[0].resolution_outcome ? (
                    <p className="rounded-xl border p-3 text-xs">
                      <strong>Resolution:</strong>{" "}
                      {booking.payments[0].resolution_outcome.replaceAll(
                        "_",
                        " ",
                      )}
                      {booking.payments[0].resolution_note
                        ? ` · ${booking.payments[0].resolution_note}`
                        : ""}
                    </p>
                  ) : null}
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Services
                </h3>
                <div className="divide-y divide-border/60 border-t border-b border-border/60">
                  {booking.availed_services.map((as) => {
                    const removable = isLineRemovable(as);
                    const isRemovingThis = removingLineId === as.id;
                    const showRowActions =
                      viewerContext.canAddService ||
                      viewerContext.canReassignStaff;
                    return (
                      <div
                        key={as.id}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-foreground truncate">
                            {as.service.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                            {as.served_by_owner ? (
                              <>
                                <div className="h-4 w-4 rounded-full bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300 flex items-center justify-center text-[9px] font-bold shrink-0">
                                  {as.served_by_owner.user.name.charAt(0)}
                                </div>
                                <span className="text-muted-foreground truncate">
                                  {as.served_by_owner.user.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 h-3.5 rounded-full border-transparent bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300 leading-none font-medium shrink-0"
                                >
                                  Owner
                                </Badge>
                              </>
                            ) : as.served_by ? (
                              <>
                                <div className="h-4 w-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                                  {as.served_by.user.name.charAt(0)}
                                </div>
                                <span className="text-muted-foreground truncate">
                                  {as.served_by.user.name}
                                </span>
                              </>
                            ) : (
                              <span className="text-amber-700 bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300 px-1.5 py-0 h-4 rounded-md text-[10px] font-medium inline-flex items-center leading-none">
                                Unassigned
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap shrink-0">
                          {formatCurrency(as.price)}
                        </div>
                        {showRowActions && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {viewerContext.canReassignStaff &&
                              isLineReassignable(as) && (
                                <ReassignStaffDialog
                                  availedServiceId={as.id}
                                  serviceName={as.service.name}
                                  currentEmployeeName={
                                    as.served_by?.user.name ??
                                    as.served_by_owner?.user.name ??
                                    null
                                  }
                                  currentEmployeeId={as.served_by_id ?? null}
                                />
                              )}
                            {viewerContext.canAddService && removable && (
                              <SwapServiceDialog
                                bookingId={booking.id}
                                availedServiceId={as.id}
                                currentServiceName={as.service.name}
                                currentServiceId={as.service.id}
                                servicesCatalog={servicesCatalog}
                              />
                            )}
                            {viewerContext.canAddService && removable && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                                    aria-label={`Remove ${as.service.name}`}
                                    disabled={isRemovingThis}
                                  >
                                    {isRemovingThis ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Remove {as.service.name}?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This adjusts the booking total by{" "}
                                      <span className="font-semibold text-foreground">
                                        {formatCurrency(as.final_price)}
                                      </span>
                                      . The customer is not notified
                                      automatically.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-full">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleRemoveLine(as.id)}
                                    >
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {viewerContext.canAddService && (
                <section className="space-y-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Add Service
                  </h3>
                  {availableServiceOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No services available in your catalog yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem] gap-2">
                        <select
                          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                          value={selectedServiceId}
                          onChange={(event) =>
                            setSelectedServiceId(event.target.value)
                          }
                          disabled={!canAddService || isAddingService}
                          aria-label="Service"
                        >
                          {availableServiceOptions.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} ({service.category}) -{" "}
                              {formatCurrency(service.price)}
                            </option>
                          ))}
                        </select>
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
                          className="h-9"
                          aria-label="Quantity"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {selectedServiceOption
                            ? `${selectedServiceOption.duration || 30} min · ${formatCurrency(selectedServiceOption.price)} each`
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
                          size="sm"
                          className="h-9 shrink-0 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
                        >
                          {isAddingService ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Adding…
                            </>
                          ) : (
                            <>
                              <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                      {!canAddService && (
                        <p className="text-xs text-destructive">
                          Cancelled bookings cannot receive new services.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Notes — any tenant user can read; INTERNAL writable by all,
                  CUSTOMER_VISIBLE writes gated by canAddService (BOOKING_MODIFY). */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Notes
                </h3>
                <BookingNotesPanel
                  bookingId={booking.id}
                  canAddCustomerVisible={viewerContext.canAddService}
                />
              </section>

              {/* Audit history — owners + managers per role-permissions matrix.
                  Backed by getEntityAuditHistoryAction which enforces the same
                  rule server-side. */}
              {viewerContext.canSeeAuditTrail && (
                <section className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setIsAuditOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
                    aria-expanded={isAuditOpen}
                  >
                    <History className="h-3 w-3" />
                    {isAuditOpen ? "Hide history" : "View history"}
                  </button>
                  {isAuditOpen && (
                    <AuditTrail
                      entityType="Booking"
                      entityId={String(booking.id)}
                      limit={25}
                    />
                  )}
                </section>
              )}

              <section className="space-y-2 pt-3 border-t border-border/60">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(
                        booking.grand_total + booking.total_discount,
                      )}
                    </span>
                  </div>
                  {booking.total_discount > 0 && (
                    <div className="flex justify-between items-center text-sm text-primary">
                      <span>
                        Discount
                        {booking.vouchers.length > 0
                          ? ` (${booking.vouchers[0].code})`
                          : ""}
                      </span>
                      <span className="font-medium tabular-nums">
                        -{formatCurrency(booking.total_discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm text-primary">
                    <span>Paid</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(amountPaid)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-border/60">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Remaining Balance
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {booking.payment_status === "PAID"
                        ? "Paid in full"
                        : "Awaiting settlement"}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums tracking-tight",
                      remainingBalance === 0
                        ? "text-primary"
                        : "text-foreground",
                    )}
                  >
                    {formatCurrency(remainingBalance)}
                  </span>
                </div>
              </section>

              <section className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border/60">
                {viewerContext.canAddService &&
                  booking.status === "ACCEPTED" &&
                  booking.scheduled_at && (
                    <RescheduleDialog
                      bookingId={booking.id}
                      currentScheduledAt={
                        booking.scheduled_at instanceof Date
                          ? booking.scheduled_at.toISOString()
                          : booking.scheduled_at
                      }
                    />
                  )}
                {viewerContext.canAdjustPrice &&
                  booking.status === "ACCEPTED" &&
                  booking.payment_status !== "PAID" && (
                    <AdjustPriceDialog
                      bookingId={booking.id}
                      lines={booking.availed_services.map((as) => ({
                        id: as.id,
                        serviceName: as.service.name,
                        finalPrice: as.final_price,
                      }))}
                    />
                  )}
                {viewerContext.canCancel &&
                  booking.status !== "CANCELLED" &&
                  booking.status !== "COMPLETED" && (
                    <CancelBookingDialog
                      bookingId={booking.id}
                      customerLabel={getBookingCustomerName(booking)}
                    />
                  )}
                {canMarkNoShow && viewerContext.canMarkNoShow && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-full border-transparent px-4 text-amber-700 bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-300"
                        disabled={isMarkingNoShow}
                      >
                        {isMarkingNoShow ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        No-Show
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark as No-Show?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will cancel the booking and record a no-show for{" "}
                          <strong>{getBookingCustomerName(booking)}</strong>.
                          Customers with 2 or more no-shows are restricted from
                          booking.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-full">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-full bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                          onClick={handleMarkNoShow}
                        >
                          Confirm No-Show
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {canMarkPaid && viewerContext.canMarkPaid && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
                    onClick={handleMarkPaid}
                    disabled={isMarkingPaid}
                  >
                    {isMarkingPaid ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Mark as Paid
                  </Button>
                )}
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
