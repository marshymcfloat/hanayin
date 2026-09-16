"use client";

import { formatPH } from "@/lib/date-utils";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Clock as ClockIcon,
  RefreshCcw,
} from "lucide-react";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimServiceAction, getPendingServicesAction } from "@/features/dashboard/actions";
import {
  getEmployeeSpecialtySet,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";

import {
  getApplicableDiscount,
  type SaleEventForPricing,
} from "@/lib/utils/pricing";
import type { EmployeeServiceWorkItem } from "./service-work-state";

export type PendingService = EmployeeServiceWorkItem;

export default function PendingServicesList({
  services: initialServices,
  businessSlug = "",
  currentEmployeeId,
  employeeSpecialties,
  saleEvents = [],
  canClaimServices = true,
  showRefresh = true,
  onClaim,
  onClaimed,
  pendingActionIds = new Set<number>(),
}: {
  services: PendingService[];
  businessSlug?: string;
  currentEmployeeId?: number;
  employeeSpecialties?: string[];
  saleEvents?: SaleEventForPricing[];
  canClaimServices?: boolean;
  showRefresh?: boolean;
  onClaim?: (service: PendingService) => Promise<void>;
  onClaimed?: () => void;
  pendingActionIds?: ReadonlySet<number>;
}) {
  const [selectedService, setSelectedService] = useState<PendingService | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: legacyServices = initialServices, refetch } = useQuery<PendingService[]>({
    queryKey: ["pending-services", businessSlug],
    queryFn: async () =>
      (await getPendingServicesAction()) as unknown as PendingService[],
    initialData: initialServices,
    enabled: !onClaim && !!businessSlug,
    refetchInterval: onClaim ? false : 5_000,
  });
  const services = onClaim ? initialServices : legacyServices;

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

  const getDisplayScheduledAt = (item: PendingService) =>
    item.booking.scheduled_at ?? item.booking.created_at ?? item.scheduled_at;

  const handleClaim = async () => {
    if (!canClaimServices) return;
    if (!selectedService) return;
    const service = selectedService;
    setSelectedService(null);
    if (onClaim) {
      await onClaim(service);
      return;
    }
    if (!currentEmployeeId) return;
    const result = await claimServiceAction(service.id, currentEmployeeId);
    if (result.success) {
      onClaimed?.();
    } else {
      toast.error("Unable to claim service", { description: result.error });
    }
    await refetch();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col">
        {showRefresh ? (
          <div className="mb-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCcw className={cn("mr-2 size-3.5", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        ) : null}
        {visibleServices.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Inbox className="size-5" />
            </div>
            <div className="max-w-xs space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground">
                All caught up
              </h3>
              <p className="text-xs text-muted-foreground">
                There are no pending services in the queue right now.
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

              const discountInfo = getApplicableDiscount(
                item.service.id,
                item.package_id ? Number(item.package_id) : undefined,
                item.price,
                saleEvents,
              );
              const interactive = canClaimServices;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (interactive) setSelectedService(item);
                    }}
                    disabled={!interactive}
                    className={cn(
                      "group flex w-full min-w-0 items-start justify-between gap-2 rounded-xl px-1 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                      interactive
                        ? "cursor-pointer hover:bg-primary/[0.04]"
                        : "cursor-default opacity-70",
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-inset ring-primary/15">
                        {customerInitials}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
                            {item.service.name}
                          </h4>
                          {item.package && (
                            <Badge
                              variant="outline"
                              className="h-4 border-primary/30 bg-primary/10 px-1.5 text-[9px] font-medium text-primary"
                            >
                              {item.package.name}
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs font-medium text-muted-foreground">
                          {getBookingCustomerName(item.booking)}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                            <ClockIcon className="size-3" />
                            {getDisplayScheduledAt(item)
                              ? formatPH(getDisplayScheduledAt(item), "h:mm a")
                              : "Walk-in"}
                          </span>
                          {item.service.duration && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                              · {item.service.duration} mins
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end">
                      {discountInfo &&
                      discountInfo.finalPrice !== item.price ? (
                        <div className="flex flex-col items-end gap-0.5 leading-none">
                          <span className="text-xs text-destructive line-through opacity-70 tabular-nums">
                            {formatCurrency(item.price)}
                          </span>
                          <span className="text-sm font-bold tabular-nums text-primary">
                            {formatCurrency(discountInfo.finalPrice)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-foreground">
                          {formatCurrency(item.price)}
                        </span>
                      )}
                    </div>
                  </button>
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
        <DialogContent className="gap-0 overflow-hidden rounded-2xl border-primary/15 p-0 shadow-2xl sm:max-w-sm">
          <div className="h-1 bg-primary" aria-hidden="true" />
          <DialogHeader className="items-center gap-1.5 px-10 pb-5 pt-5 text-center sm:text-center">
            <DialogTitle className="text-lg">Claim Service</DialogTitle>
            <DialogDescription className="max-w-[16rem] leading-5">
              <span className="font-semibold text-foreground">
                {selectedService?.service.name}
              </span>{" "}
              for{" "}
              {selectedService
                ? getBookingCustomerName(selectedService.booking)
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-5">
            {selectedService && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-3">
                  <h4 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Payment
                  </h4>
                  <div className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Total amount</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(selectedService.booking.grand_total)}
                    </span>
                  </div>
                  {selectedService.booking.payment_status !== "PAID" ? (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="font-medium text-primary tabular-nums">
                          {formatCurrency(selectedService.booking.amount_paid)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                          {formatCurrency(
                            selectedService.booking.grand_total - selectedService.booking.amount_paid,
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {selectedService.booking.payment_status === "PARTIALLY_PAID"
                            ? "Partially paid"
                            : "Payment still due"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 pt-1 text-xs font-medium text-primary">
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                      <span>Fully paid</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="border-t bg-muted/20 px-5 py-4">
            <Button
              variant="outline"
              onClick={() => setSelectedService(null)}
              disabled={!!selectedService && pendingActionIds.has(selectedService.id)}
            >
              Cancel
            </Button>
            {canClaimServices ? (
              <Button
                onClick={handleClaim}
                disabled={!!selectedService && pendingActionIds.has(selectedService.id)}
              >
                Claim Service
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
