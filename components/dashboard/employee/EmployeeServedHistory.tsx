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
} from "@/features/dashboard/actions";
import { toast } from "sonner";
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
import type { EmployeeServiceWorkItem } from "./service-work-state";

export interface ServedService extends EmployeeServiceWorkItem {
  service: EmployeeServiceWorkItem["service"];
  package: EmployeeServiceWorkItem["package"];
  package_id: number | null;
  /*
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
    amount_paid: number;
    payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
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
  */
}

export default function EmployeeServedHistory({
  mode = "history",
  services,
  employeeSpecialties,
  currentEmployeeId,
  currentEmployeeCommission,
  onMarkServed,
  onUnclaim,
  onUnserve,
  pendingActionIds,
  onWorkChanged,
}: {
  mode?: "active" | "history";
  services: ServedService[];
  employeeSpecialties?: string[];
  currentEmployeeId?: number;
  currentEmployeeCommission: number;
  onMarkServed?: (service: ServedService) => Promise<void>;
  onUnclaim?: (service: ServedService) => Promise<void>;
  onUnserve?: (service: ServedService) => Promise<void>;
  pendingActionIds?: ReadonlySet<number>;
  onWorkChanged?: () => void;
}) {
  const busyIds = pendingActionIds ?? new Set<number>();
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
    const service = services.find((item) => item.id === serviceId);
    if (!service || busyIds.has(serviceId)) return;
    setSelectedService(null);
    if (onMarkServed) return onMarkServed(service);
    if (!currentEmployeeId) return;
    const result = await markServiceServedAction(serviceId, currentEmployeeId);
    if (!result.success) toast.error("Unable to mark service as served", { description: result.error });
    else onWorkChanged?.();
  };

  const requestUnclaim = (serviceId: number) => {
    setPendingAction({ type: "unclaim", serviceId });
  };

  const executeUnclaim = async (serviceId: number) => {
    const service = services.find((item) => item.id === serviceId);
    setPendingAction(null);
    setSelectedService(null);
    if (!service || busyIds.has(serviceId)) return;
    if (onUnclaim) return onUnclaim(service);
    const result = await unclaimServiceAction(serviceId);
    if (!result.success) toast.error("Unable to unclaim service", { description: result.error });
    else onWorkChanged?.();
  };

  const requestUnserve = (serviceId: number) => {
    setPendingAction({ type: "unserve", serviceId });
  };

  const executeUnserve = async (serviceId: number) => {
    const service = services.find((item) => item.id === serviceId);
    setPendingAction(null);
    setSelectedService(null);
    if (!service || busyIds.has(serviceId)) return;
    if (onUnserve) return onUnserve(service);
    const result = await unserveServiceAction(serviceId);
    if (!result.success) toast.error("Unable to undo completed service", { description: result.error });
    else onWorkChanged?.();
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
      <div className="flex h-full flex-col">
        {visibleServices.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <History className="size-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground">
                {mode === "active" ? "Nothing in progress" : "No served history"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {mode === "active"
                  ? "Claimed services will appear here."
                  : "Completed services will appear here."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="min-w-0 divide-y divide-border overflow-x-hidden">
            {visibleServices.map((item) => {
              const customerInitials = getBookingCustomerName(item.booking)
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              const displayPrice = item.final_price ?? item.price;
              const hasDiscount = item.discount && item.discount > 0;

              return (
                <li key={item.id}>
                  <div className="group flex min-w-0 items-center gap-2 rounded-xl px-1 py-2 transition-colors hover:bg-primary/[0.04]">
                    <button
                      type="button"
                      onClick={() => setSelectedService(item)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-inset ring-primary/15">
                        {customerInitials}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                          <span className="truncate">{item.service.name}</span>
                          {item.package && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              {item.package.name}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {getBookingCustomerName(item.booking)} · {getDisplayScheduledAt(item) ? formatPH(getDisplayScheduledAt(item), "h:mm a") : "Walk-in"}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
                      {hasDiscount ? (
                        <div className="flex flex-col items-end gap-0.5 leading-none">
                          <span className="text-xs text-destructive line-through opacity-70 tabular-nums">
                            {formatCurrency(item.price)}
                          </span>
                          <span className="text-sm font-bold tabular-nums text-primary">
                            {formatCurrency(displayPrice)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-foreground">
                          {formatCurrency(item.price)}
                        </span>
                      )}
                    </div>
                    </button>
                    {mode === "active" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 shrink-0 rounded-lg px-3 text-[11px] font-semibold"
                        onClick={() => handleMarkAsServed(item.id)}
                        disabled={busyIds.has(item.id)}
                      >
                        {busyIds.has(item.id) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Done"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/10 text-primary"
                  >
                    {selectedService.status}
                  </Badge>
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
                  {selectedService.booking.payment_status !== "PAID" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="font-medium text-primary tabular-nums">
                          {formatCurrency(selectedService.booking.amount_paid)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {formatCurrency(
                            selectedService.booking.grand_total - selectedService.booking.amount_paid,
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-2 pl-2 border-l-2 border-amber-400">
                        {selectedService.booking.payment_status === "PARTIALLY_PAID" ? "Partially paid" : "Unpaid"} · Balance of{" "}
                        {formatCurrency(
                          selectedService.booking.grand_total - selectedService.booking.amount_paid,
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
                    disabled={busyIds.has(selectedService.id)}
                  >
                    {busyIds.has(selectedService.id) ? (
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
                    disabled={busyIds.has(selectedService.id)}
                  >
                    {busyIds.has(selectedService.id) && (
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
                  disabled={busyIds.has(selectedService.id)}
                >
                  {busyIds.has(selectedService.id) ? (
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
