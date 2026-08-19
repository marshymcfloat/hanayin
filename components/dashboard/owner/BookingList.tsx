"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Booking,
  Customer,
  BookingStatus,
  AvailedService,
  Service,
  Employee,
  User,
  Voucher,
  Owner,
  BookingPayment,
} from "@/prisma/generated/prisma/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPH } from "@/lib/date-utils";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import {
  Search,
  Trash2,
  RefreshCcw,
  MoreHorizontal,
  Calendar,
  ArrowRight,
} from "lucide-react";
import {
  deleteBookingAction,
  updateBookingStatusAction,
} from "@/lib/server actions/dashboard";
import { toast } from "sonner";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  BookingQuickPanel,
  deriveBookingViewerContext,
} from "@/components/bookings/BookingQuickPanel";
import { useViewer } from "@/lib/auth/viewer-context";
import { cn } from "@/lib/utils";
import {
  BOOKING_PAYMENT_STAGE_LABELS,
  deriveBookingPaymentStage,
  type BookingPaymentStage,
} from "@/lib/utils/booking-payment-stage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  payments?: BookingPayment[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

export function BookingList({
  bookings,
  servicesCatalog = [],
  className,
  initialOpenBookingId,
}: {
  bookings: BookingWithDetails[];
  servicesCatalog?: {
    id: number;
    name: string;
    category: string;
    price: number;
    duration: number | null;
  }[];
  variant?: "card" | "embedded";
  className?: string;
  businessSlug?: string;
  staffingConflictBookingIds?: number[];
  /**
   * When set, the panel auto-opens for the booking with this id on
   * first render. Drives the ?open=<id> deep-link from notifications
   * and other surfaces. Silently ignored if the id isn't in the
   * current page's bookings.
   */
  initialOpenBookingId?: number | null;
  queryState?: {
    page: number;
    pageSize: number;
    total: number;
    search: string;
    status: string;
  };
}) {
  const router = useRouter();
  const viewer = useViewer();
  // Derive the booking-panel's permission flags from the shared viewer
  // context. Owners get every flag automatically; staff/manager/cashier
  // get the matrix-defined subset. Computed once per viewer object —
  // ViewerContextProvider already memoizes the object identity, so a
  // bare useMemo here would only re-run on real role changes.
  const viewerContext = useMemo(
    () => deriveBookingViewerContext(viewer),
    [viewer],
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Deep-link auto-open. Runs once per change of initialOpenBookingId
  // (which only changes if the user navigates with a different ?open=).
  // We resolve the id against the current bookings array — if the
  // booking isn't on this page (e.g. paginated out), we silently skip.
  //
  // Wave G5: this used to be a useEffect that called setState
  // synchronously, tripping react-hooks/set-state-in-effect. Switched
  // to the prev-value-during-render pattern, which is the React-docs
  // canonical fix and also corrects a latent bug — the old effect
  // re-fired whenever `bookings` changed (e.g. after a refetch),
  // re-opening the dialog after the user had closed it. Now the
  // auto-open fires exactly once per distinct ?open= value.
  // Sentinel undefined so the first render triggers auto-open exactly
  // once when initialOpenBookingId arrives.
  const [lastDeepLinkId, setLastDeepLinkId] = useState<
    number | null | undefined
  >(undefined);
  if (lastDeepLinkId !== initialOpenBookingId) {
    setLastDeepLinkId(initialOpenBookingId ?? null);
    if (initialOpenBookingId != null) {
      const match = bookings.find((b) => b.id === initialOpenBookingId);
      if (match) {
        setSelectedBooking(match);
        setIsDialogOpen(true);
      }
    }
  }

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const searchLower = search.toLowerCase();
      const customerName = getBookingCustomerName(booking).toLowerCase();
      const matchesSearch =
        customerName.includes(searchLower) ||
        booking.id.toString().includes(searchLower) ||
        (booking.customer?.phone &&
          booking.customer.phone.includes(searchLower));
      const stage = deriveBookingPaymentStage(booking);
      const matchesStatus = statusFilter === "ALL" || stage === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bookings, search, statusFilter]);

  const getStatusClass = (stage: BookingPaymentStage) => {
    switch (stage) {
      case "CONFIRMED":
        return "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800";
      case "COMPLETED":
        return "border-primary/30 bg-primary/10 text-primary";
      case "REJECTED":
      case "CANCELLED":
        return "border-destructive/30 bg-destructive/10 text-destructive";
      default:
        return "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800";
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleStatusUpdate = async (id: number, status: BookingStatus) => {
    const res = await updateBookingStatusAction(id, status);
    if (res.success) {
      toast.success(`Booking ${status.toLowerCase()} successfully`);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteBookingAction(id);
    if (res.success) {
      toast.success("Booking deleted successfully");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const openBookingDetails = (booking: BookingWithDetails) => {
    setSelectedBooking(booking);
    setIsDialogOpen(true);
  };

  const renderBookingActions = (booking: BookingWithDetails) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent/30 rounded-lg cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open actions for booking ${booking.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px] rounded-xl">
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
          Actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="rounded-lg cursor-pointer"
          onClick={() => openBookingDetails(booking)}
        >
          View Details
        </DropdownMenuItem>
        {viewerContext.role === "OWNER" &&
          deriveBookingPaymentStage(booking) === "AWAITING_PAYMENT" &&
          booking.hold_expires_at &&
          new Date(booking.hold_expires_at).getTime() > currentTime && (
            <DropdownMenuItem
              className="rounded-lg cursor-pointer font-medium text-primary focus:text-primary"
              onClick={() => openBookingDetails(booking)}
            >
              Check GCash
            </DropdownMenuItem>
          )}
        {booking.status === "ACCEPTED" && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-lg cursor-pointer"
            onClick={() => handleStatusUpdate(booking.id, "CANCELLED")}
          >
            Cancel Booking
          </DropdownMenuItem>
        )}
        {viewerContext.canDelete && (
          <>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="relative flex select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-destructive/10 text-destructive cursor-pointer w-full">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent
                onClick={(e) => e.stopPropagation()}
                className="rounded-2xl"
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Booking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the booking for{" "}
                    <span className="font-semibold text-foreground">
                      {getBookingCustomerName(booking)}
                    </span>
                    .
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => handleDelete(booking.id)}
                  >
                    Delete Booking
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className={cn("flex flex-col bg-background", className)}>
        <div className="border-b border-border bg-card">
          <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Bookings</h1>
                <p className="text-xs text-muted-foreground">
                  View and manage all customer appointments.
                </p>
              </div>
              <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {bookings.length}{" "}
                {bookings.length === 1 ? "booking" : "bookings"}
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-4 sm:py-6">
          <div className="max-w-7xl mx-auto w-full space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer name or ID..."
                  className="pl-9 h-9 rounded-xl border-border bg-background"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 rounded-xl border-border bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent position="popper" className="rounded-xl">
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="AWAITING_PAYMENT">
                    Awaiting payment
                  </SelectItem>
                  <SelectItem value="AWAITING_VERIFICATION">
                    Awaiting verification
                  </SelectItem>
                  <SelectItem value="NEEDS_RESOLUTION">
                    Needs resolution
                  </SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-xl border-border bg-background text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
                onClick={handleRefresh}
              >
                <RefreshCcw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden flex flex-col gap-3">
              {filteredBookings.length > 0 ? (
                filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-4 cursor-pointer active:scale-[0.99] transition-all hover:border-primary/20"
                    onClick={() => openBookingDetails(booking)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {getBookingCustomerName(booking).charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground line-clamp-1">
                            {getBookingCustomerName(booking)}
                          </span>
                          <span className="text-xs text-muted-foreground font-medium">
                            #{booking.id}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg",
                          getStatusClass(deriveBookingPaymentStage(booking)),
                        )}
                      >
                        {
                          BOOKING_PAYMENT_STAGE_LABELS[
                            deriveBookingPaymentStage(booking)
                          ]
                        }
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 py-3 border-y border-border/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                          Date
                        </span>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          {formatPH(booking.created_at, "MMM d, h:mm a")}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                          Total
                        </span>
                        <div className="flex flex-col items-start gap-0.5">
                          {booking.total_discount > 0 && (
                            <span className="text-xs text-muted-foreground line-through">
                              ₱
                              {(
                                booking.grand_total + booking.total_discount
                              ).toLocaleString()}
                            </span>
                          )}
                          <span className="text-sm font-bold text-foreground">
                            ₱{booking.grand_total.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Tap to view details
                      </span>
                      <div
                        className="flex items-center gap-1 -mr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                          onClick={() => openBookingDetails(booking)}
                        >
                          View Details
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                        {renderBookingActions(booking)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-card rounded-2xl border border-border p-12 flex flex-col items-center justify-center text-center">
                  <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Calendar className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    No bookings found
                  </h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search or filters.
                  </p>
                </div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border bg-muted/50">
                    <TableHead className="pl-6 w-[90px] font-semibold text-muted-foreground h-11">
                      ID
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground h-11">
                      Customer
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground h-11">
                      Date & Time
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground h-11">
                      Status
                    </TableHead>
                    <TableHead className="text-right font-semibold text-muted-foreground h-11">
                      Total
                    </TableHead>
                    <TableHead className="text-right pr-6 font-semibold text-muted-foreground h-11">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.length > 0 ? (
                    filteredBookings.map((booking) => (
                      <TableRow
                        key={booking.id}
                        className="hover:bg-accent/30 cursor-pointer transition-colors border-border/50 group"
                        onClick={() => openBookingDetails(booking)}
                      >
                        <TableCell className="pl-6 font-medium text-muted-foreground py-4">
                          <span className="bg-muted text-foreground px-2 py-1 rounded-md text-xs font-semibold">
                            #{booking.id}
                          </span>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shadow-sm">
                              {getBookingCustomerName(booking).charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                {getBookingCustomerName(booking)}
                              </span>
                              {booking.customer?.phone && (
                                <span className="text-xs text-muted-foreground">
                                  {booking.customer.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {formatPH(
                              booking.created_at,
                              "MMM d, yyyy • h:mm a",
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg",
                                getStatusClass(
                                  deriveBookingPaymentStage(booking),
                                ),
                              )}
                            >
                              {
                                BOOKING_PAYMENT_STAGE_LABELS[
                                  deriveBookingPaymentStage(booking)
                                ]
                              }
                            </Badge>
                            {booking.status === "ACCEPTED" &&
                              (booking.downpayment || 0) > 0 &&
                              booking.grand_total >
                                (booking.downpayment || 0) && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 text-[10px] px-2 py-0.5 font-medium rounded-md"
                                >
                                  Bal: ₱
                                  {(
                                    booking.grand_total -
                                    (booking.downpayment || 0)
                                  ).toLocaleString()}
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-4">
                          <div className="flex items-center justify-end gap-2">
                            {booking.total_discount > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0.5 border-primary/30 bg-primary/10 text-primary hidden xl:inline-flex"
                              >
                                -{booking.total_discount.toLocaleString()}
                                {booking.vouchers.length > 0 &&
                                  ` (${booking.vouchers[0].code})`}
                              </Badge>
                            )}
                            <div className="flex flex-col items-end gap-0.5">
                              {booking.total_discount > 0 && (
                                <span className="text-xs text-muted-foreground line-through">
                                  ₱
                                  {(
                                    booking.grand_total + booking.total_discount
                                  ).toLocaleString()}
                                </span>
                              )}
                              <span className="font-bold text-foreground text-base">
                                ₱{booking.grand_total.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {renderBookingActions(booking)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-64">
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <Calendar className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-base font-semibold text-foreground">
                              No bookings found
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Try adjusting your search or filters.
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      <BookingQuickPanel
        booking={selectedBooking}
        servicesCatalog={servicesCatalog}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        viewerContext={viewerContext}
      />
    </>
  );
}
