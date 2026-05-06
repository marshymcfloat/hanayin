"use client";

import { formatPH } from "@/lib/date-utils";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import {
  markServiceServedAction,
  unclaimServiceAction,
  unserveServiceAction,
} from "@/lib/server actions/dashboard";
import { useMemo, useState } from "react";
import {
  Loader2,
  History,
  RotateCcw,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getEmployeeSpecialtySet,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";

export interface ServedService {
  id: number;
  updated_at: Date;
  service: {
    name: string;
    duration: number | null;
    category: string;
  };
  booking: {
    // Nullable to support anonymous walk-ins (customer_id = null on the booking).
    // Use getBookingCustomerName() to render — it falls back to the label.
    customer: {
      name: string;
    } | null;
    is_anonymous_walk_in?: boolean | null;
    customer_label?: string | null;
    scheduled_at?: Date | null;
    created_at?: Date | null;
    downpayment: number | null;
    downpayment_status: string | null;
    grand_total: number;
  };
  scheduled_at: Date | null;
  price: number;
  final_price?: number | null;
  discount?: number | null;
  discount_reason?: string | null;
  status: string;
  package?: {
    name: string;
  } | null;
}

export default function EmployeeServedHistory({
  services,
  employeeSpecialties,
  currentEmployeeId,
  currentEmployeeCommission,
}: {
  services: ServedService[];
  employeeSpecialties?: string[];
  currentEmployeeId: number;
  currentEmployeeCommission: number;
}) {
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [selectedService, setSelectedService] = useState<ServedService | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<{
    type: "unclaim" | "unserve";
    serviceId: number;
  } | null>(null);

  const employeeSpecialtySet = useMemo(
    () => getEmployeeSpecialtySet(employeeSpecialties),
    [employeeSpecialties],
  );

  const visibleServices = useMemo(
    () =>
      services.filter((item) =>
        isCategoryAllowedForEmployee(item.service.category, employeeSpecialtySet),
      ),
    [services, employeeSpecialtySet],
  );

  const getDisplayScheduledAt = (service: ServedService) =>
    service.booking.scheduled_at ??
    service.booking.created_at ??
    service.scheduled_at;

  const handleMarkAsServed = async (serviceId: number) => {
    setLoadingId(serviceId);
    try {
      const result = await markServiceServedAction(
        serviceId,
        currentEmployeeId,
      );
      if (!result.success) {
        alert(result.error);
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setLoadingId(null);
    }
  };

  const requestUnclaim = (serviceId: number) => {
    setPendingAction({ type: "unclaim", serviceId });
  };

  const executeUnclaim = async (serviceId: number) => {
    setLoadingId(serviceId);
    try {
      const result = await unclaimServiceAction(serviceId);
      if (!result.success) {
        alert(result.error);
      } else {
        setSelectedService(null);
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setLoadingId(null);
      setPendingAction(null);
    }
  };

  const requestUnserve = (serviceId: number) => {
    setPendingAction({ type: "unserve", serviceId });
  };

  const executeUnserve = async (serviceId: number) => {
    setLoadingId(serviceId);
    try {
      const result = await unserveServiceAction(serviceId);
      if (!result.success) {
        alert(result.error);
      } else {
        setSelectedService(null);
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setLoadingId(null);
      setPendingAction(null);
    }
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === "unclaim") {
      executeUnclaim(pendingAction.serviceId);
    } else if (pendingAction.type === "unserve") {
      executeUnserve(pendingAction.serviceId);
    }
  };

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="space-y-3 p-4 lg:p-0">
          {visibleServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <History className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">
                  No served history
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Completed services will appear here.
                </p>
              </div>
            </div>
          ) : (
            visibleServices.map((item) => {
              const customerInitials = getBookingCustomerName(item.booking)
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              const displayPrice = item.final_price ?? item.price;
              const hasDiscount = item.discount && item.discount > 0;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer group active:scale-[0.99]"
                  onClick={() => setSelectedService(item)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {customerInitials}
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="font-semibold text-sm text-foreground flex items-center gap-2 truncate">
                        <span className="truncate">{item.service.name}</span>
                        {item.package && (
                          <span className="bg-muted text-muted-foreground border border-border text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0">
                            {item.package.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium truncate">
                        {getBookingCustomerName(item.booking)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0 pl-2">
                    {hasDiscount ? (
                      <div className="flex flex-col items-end leading-none gap-0.5">
                        <span className="text-xs text-destructive line-through opacity-70 tabular-nums">
                          {formatCurrency(item.price)}
                        </span>
                        <span className="font-bold text-sm text-primary tabular-nums">
                          {formatCurrency(displayPrice)}
                        </span>
                      </div>
                    ) : (
                      <span className="font-bold text-sm text-foreground tabular-nums">
                        {formatCurrency(item.price)}
                      </span>
                    )}
                    {item.status === "CLAIMED" ? (
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60 text-[10px] py-0 h-5"
                      >
                        Serving
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary border border-primary/30 text-[10px] py-0 h-5"
                      >
                        {item.status}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={!!selectedService}
        onOpenChange={(open) => !open && setSelectedService(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Service Details</DialogTitle>
            <DialogDescription>
              Full information about this service
            </DialogDescription>
          </DialogHeader>

          {selectedService && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-4 border-b">
                <Avatar className="h-12 w-12 border">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                    {getBookingCustomerName(selectedService.booking)
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">
                    {selectedService.service.name}
                  </h3>
                  <p className="text-muted-foreground">
                    {getBookingCustomerName(selectedService.booking)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-border border-y border-border">
                <div className="px-1 py-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Price
                  </p>
                  <div className="text-lg font-bold tabular-nums">
                    {selectedService.final_price &&
                    selectedService.final_price !== selectedService.price ? (
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs text-destructive line-through opacity-70">
                          {formatCurrency(selectedService.price)}
                        </span>
                        <span className="text-primary">
                          {formatCurrency(selectedService.final_price)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-foreground">
                        {formatCurrency(selectedService.price)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-3 py-3 space-y-1">
                  <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">
                    Commission ({currentEmployeeCommission}%)
                  </p>
                  <p className="text-lg font-bold text-primary tabular-nums">
                    {formatCurrency(
                      ((selectedService.final_price ?? selectedService.price) *
                        currentEmployeeCommission) /
                        100,
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-dashed">
                  <span className="text-muted-foreground">Scheduled For</span>
                  <span className="font-medium">
                    {getDisplayScheduledAt(selectedService)
                      ? formatPH(getDisplayScheduledAt(selectedService), "PPP p")
                      : "Unscheduled"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-dashed">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">
                    {selectedService.service.duration || "-"} min
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-dashed">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{selectedService.status}</Badge>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Payment Status
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(selectedService.booking.grand_total)}
                    </span>
                  </div>
                  {selectedService.booking.downpayment &&
                  selectedService.booking.downpayment > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Downpayment</span>
                        <span className="font-medium text-primary tabular-nums">
                          {formatCurrency(selectedService.booking.downpayment)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {formatCurrency(
                            selectedService.booking.grand_total -
                              selectedService.booking.downpayment,
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-2 pl-2 border-l-2 border-amber-400">
                        Half-paid · Balance of{" "}
                        {formatCurrency(
                          selectedService.booking.grand_total -
                            selectedService.booking.downpayment,
                        )}{" "}
                        still due
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-primary font-medium mt-2 pl-2 border-l-2 border-primary">
                      Fully paid
                    </p>
                  )}
                </div>
              </div>

              {selectedService.status === "CLAIMED" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10 h-11 rounded-xl cursor-pointer"
                    onClick={() => requestUnclaim(selectedService.id)}
                    disabled={loadingId === selectedService.id}
                  >
                    {loadingId === selectedService.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Unclaim
                  </Button>
                  <Button
                    className="flex-[2] bg-primary hover:bg-primary/90 text-primary-foreground h-11 rounded-xl cursor-pointer"
                    onClick={() => {
                      handleMarkAsServed(selectedService.id);
                      setSelectedService(null);
                    }}
                    disabled={loadingId === selectedService.id}
                  >
                    {loadingId === selectedService.id && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Mark as Served
                  </Button>
                </div>
              )}
              {selectedService.status === "COMPLETED" && (
                <Button
                  variant="outline"
                  className="w-full text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-950/30 h-11 rounded-xl cursor-pointer"
                  onClick={() => requestUnserve(selectedService.id)}
                  disabled={loadingId === selectedService.id}
                >
                  {loadingId === selectedService.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Undo (Unserve)
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "unclaim"
                ? "Unclaim this service?"
                : "Undo this service?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "unclaim"
                ? "This service will go back to the pending list and can be claimed by anyone."
                : "This will revert the service status and remove the commission."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={cn(
                "rounded-xl",
                pendingAction?.type === "unclaim"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : "bg-amber-600 hover:bg-amber-700 text-white",
              )}
            >
              {pendingAction?.type === "unclaim" ? "Unclaim" : "Undo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
