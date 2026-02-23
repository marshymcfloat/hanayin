"use client";

import { useMemo, useState } from "react";
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
} from "@/prisma/generated/prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { BookingDetailsDialog } from "./BookingDetailsDialog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BookingWithDetails = Booking & {
  customer: Customer;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

export function BookingList({
  bookings,
  servicesCatalog = [],
  variant = "card",
  className,
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
  queryState?: {
    page: number;
    pageSize: number;
    total: number;
    search: string;
    status: string;
  };
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      // Search Logic
      const searchLower = search.toLowerCase();
      const matchesSearch =
        booking.customer.name.toLowerCase().includes(searchLower) ||
        booking.id.toString().includes(searchLower) ||
        (booking.customer.phone &&
          booking.customer.phone.includes(searchLower));

      // Status Logic
      const matchesStatus =
        statusFilter === "ALL" || booking.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [bookings, search, statusFilter]);

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case "ACCEPTED":
        return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
      case "CANCELLED":
        return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-100";
    }
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
          className="h-8 w-8 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open actions for booking ${booking.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[180px] rounded-xl border-zinc-100 shadow-xl p-1"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="-mx-1 my-1 bg-zinc-100" />
        <DropdownMenuItem
          className="rounded-lg cursor-pointer focus:bg-emerald-50 focus:text-emerald-700"
          onClick={() => openBookingDetails(booking)}
        >
          View Details
        </DropdownMenuItem>
        {booking.status === "ACCEPTED" && (
          <DropdownMenuItem
            className="text-red-600 focus:text-red-700 focus:bg-red-50 rounded-lg cursor-pointer"
            onClick={() => handleStatusUpdate(booking.id, "CANCELLED")}
          >
            Cancel Booking
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="-mx-1 my-1 bg-zinc-100" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <div className="relative flex select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-red-50 text-red-600 focus:bg-red-50 cursor-pointer w-full group">
              <Trash2 className="w-3.5 h-3.5 mr-2 group-hover:text-red-700" />
              Delete
            </div>
          </AlertDialogTrigger>
          <AlertDialogContent
            onClick={(e) => e.stopPropagation()}
            className="rounded-3xl border-0 shadow-2xl"
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">
                Delete Booking?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                booking for{" "}
                <span className="font-semibold text-zinc-900">
                  {booking.customer.name}
                </span>
                .
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border-0 bg-zinc-100 hover:bg-zinc-200 text-zinc-700">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 rounded-xl text-white shadow-md shadow-red-200"
                onClick={() => handleDelete(booking.id)}
              >
                Delete Booking
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const isEmbedded = variant === "embedded";
  const tablePaddingLeft = isEmbedded ? "pl-4" : "pl-8";
  const tablePaddingRight = isEmbedded ? "pr-4" : "pr-8";

  return (
    <>
      <Card
        className={cn(
          "h-full flex flex-col overflow-hidden",
          isEmbedded
            ? "border-0 shadow-none bg-transparent rounded-none"
            : "shadow-xl shadow-zinc-200/50 border-none bg-white rounded-[32px]",
          className,
        )}
      >
        <CardHeader
          className={cn(
            "pb-6 space-y-6 border-b",
            isEmbedded
              ? "px-0 pt-0 bg-transparent border-zinc-100/60"
              : "md:px-8 md:pt-8 bg-zinc-50/50 border-zinc-100",
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold tracking-tight text-zinc-900">
                Bookings
              </CardTitle>
              <CardDescription className="text-base font-medium text-zinc-500">
                Manage and track all customer appointments
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-2 rounded-xl border-zinc-200 bg-white hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
              onClick={() => router.refresh()}
            >
              <RefreshCcw className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap font-medium">
                Refresh
              </span>
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search by customer name or ID..."
                className="pl-10 h-11 rounded-xl border-zinc-200 bg-white focus-visible:ring-emerald-500 placeholder:text-zinc-400"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-11 rounded-xl border-zinc-200 bg-white focus:ring-emerald-500">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent
          className={cn(
            "flex-1 overflow-auto p-0 min-h-[400px]",
            isEmbedded ? "bg-transparent" : "bg-white",
          )}
        >
          {/* Mobile Card View */}
          <div
            className={cn(
              "md:hidden flex flex-col space-y-4",
              isEmbedded ? "p-2" : "p-4",
            )}
          >
            {filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="p-5 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow active:scale-[0.98] active:transition-transform"
                  onClick={() => openBookingDetails(booking)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm">
                        {booking.customer.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-zinc-900 line-clamp-1">
                          {booking.customer.name}
                        </span>
                        <span className="text-xs text-zinc-500 font-medium">
                          #{booking.id}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg border",
                        getStatusColor(booking.status),
                      )}
                    >
                      {booking.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                        Date
                      </span>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-700">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        {formatPH(booking.created_at, "MMM d, h:mm a")}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                        Total
                      </span>
                      <div className="flex flex-col items-start gap-0.5">
                        {booking.total_discount > 0 && (
                          <span className="text-xs text-zinc-400 line-through">
                            ₱
                            {(
                              booking.grand_total + booking.total_discount
                            ).toLocaleString()}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-zinc-900">
                            ₱{booking.grand_total.toLocaleString()}
                          </span>
                          {booking.total_discount > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              -{booking.total_discount.toLocaleString()}
                              {booking.vouchers.length > 0 &&
                                ` (${booking.vouchers[0].code})`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-50">
                    <span className="text-xs text-zinc-400">
                      Tap to view details
                    </span>
                    <div
                      className="flex items-center gap-1 -mr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
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
              <div className="flex flex-col items-center justify-center h-64 text-center p-8 space-y-3">
                <div className="h-12 w-12 rounded-full bg-zinc-50 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-zinc-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-zinc-900">
                    No bookings found
                  </p>
                  <p className="text-sm text-zinc-500">
                    Try adjusting your search or filters.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-zinc-50/80 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-zinc-100">
                  <TableHead
                    className={cn(
                      "w-[100px] font-semibold text-zinc-500 h-12",
                      tablePaddingLeft,
                    )}
                  >
                    ID
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-500 h-12">
                    Customer
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-500 h-12">
                    Date & Time
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-500 h-12">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-semibold text-zinc-500 h-12">
                    Total
                  </TableHead>
                  <TableHead
                    className={cn(
                      "text-right font-semibold text-zinc-500 h-12",
                      tablePaddingRight,
                    )}
                  >
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.length > 0 ? (
                  filteredBookings.map((booking) => (
                    <TableRow
                      key={booking.id}
                      className="hover:bg-emerald-50/30 cursor-pointer transition-colors border-zinc-100 group"
                      onClick={() => openBookingDetails(booking)}
                    >
                      <TableCell
                        className={cn(
                          "font-medium text-zinc-500 py-4",
                          tablePaddingLeft,
                        )}
                      >
                        <span className="bg-zinc-100/80 text-zinc-600 px-2 py-1 rounded-md text-xs font-semibold">
                          #{booking.id}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold ring-2 ring-white shadow-sm">
                            {booking.customer.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors">
                              {booking.customer.name}
                            </span>
                            {booking.customer.phone && (
                              <span className="text-xs text-zinc-500">
                                {booking.customer.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-600 font-medium py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-zinc-400" />
                          {formatPH(booking.created_at, "MMM d, yyyy • h:mm a")}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg border shadow-sm",
                              getStatusColor(booking.status),
                            )}
                          >
                            {booking.status}
                          </Badge>
                          {booking.status === "ACCEPTED" &&
                            (booking.downpayment || 0) > 0 &&
                            booking.grand_total >
                              (booking.downpayment || 0) && (
                              <Badge
                                variant="outline"
                                className="border-orange-200 text-orange-700 bg-orange-50 text-[10px] px-2 py-0.5 font-medium rounded-md"
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
                              className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 hidden xl:inline-flex"
                            >
                              -{booking.total_discount.toLocaleString()}
                              {booking.vouchers.length > 0 &&
                                ` (${booking.vouchers[0].code})`}
                            </Badge>
                          )}
                          <div className="flex flex-col items-end gap-0.5">
                            {booking.total_discount > 0 && (
                              <span className="text-xs text-zinc-400 line-through">
                                ₱
                                {(
                                  booking.grand_total + booking.total_discount
                                ).toLocaleString()}
                              </span>
                            )}
                            <span className="font-bold text-zinc-900 text-base">
                              ₱{booking.grand_total.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn("text-right py-4", tablePaddingRight)}
                      >
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
                    <TableCell colSpan={6} className="h-96">
                      <div className="flex flex-col items-center justify-center text-center space-y-3">
                        <div className="h-12 w-12 rounded-full bg-zinc-50 flex items-center justify-center">
                          <Calendar className="h-6 w-6 text-zinc-300" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-base font-semibold text-zinc-900">
                            No bookings found
                          </p>
                          <p className="text-sm text-zinc-500">
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
        </CardContent>
      </Card>

      <BookingDetailsDialog
        booking={selectedBooking}
        servicesCatalog={servicesCatalog}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
