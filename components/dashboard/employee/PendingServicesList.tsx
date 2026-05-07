"use client";

import { formatPH } from "@/lib/date-utils";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Clock as ClockIcon, RefreshCcw } from "lucide-react";
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
import {
  claimServiceAction,
  getPendingServicesAction,
} from "@/lib/server actions/dashboard";
import {
  getEmployeeSpecialtySet,
  isCategoryAllowedForEmployee,
} from "@/lib/utils/employee-specialties";

import {
  getApplicableDiscount,
  type SaleEventForPricing,
} from "@/lib/utils/pricing";

export interface PendingService {
  id: number;
  service: {
    id: number; // Ensure ID is present
    name: string;
    duration: number | null;
    category: string;
  };
  booking: {
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
  package_id: number | null;
  package: {
    name: string;
  } | null;
}

export default function PendingServicesList({
  services: initialServices,
  businessSlug,
  currentEmployeeId,
  employeeSpecialties,
  saleEvents = [],
  canClaimServices = true,
}: {
  services: PendingService[];
  businessSlug: string;
  currentEmployeeId: number;
  employeeSpecialties?: string[];
  saleEvents?: SaleEventForPricing[];
  canClaimServices?: boolean;
}) {
  const [selectedService, setSelectedService] = useState<PendingService | null>(
    null,
  );
  const [isClaiming, setIsClaiming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: services = [], refetch } = useQuery({
    queryKey: ["pending-services", businessSlug],
    queryFn: () => getPendingServicesAction(),
    initialData: initialServices,
    refetchInterval: 5000,
  });

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClaim = async () => {
    if (!canClaimServices) {
      return;
    }
    if (!selectedService) return;
    setIsClaiming(true);
    const result = await claimServiceAction(
      selectedService.id,
      currentEmployeeId,
    );
    setIsClaiming(false);

    if (result.success) {
      setSelectedService(null);
    } else {
      alert(result.error);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="mb-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 gap-2 rounded-full border-black/[0.08] bg-transparent text-xs font-medium hover:bg-primary/[0.04] hover:text-primary cursor-pointer"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

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
          <ul className="-mx-2 divide-y divide-border">
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
                      "group flex w-full items-start justify-between gap-3 rounded-xl px-2 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to claim this service?
              <br />
              <strong>{selectedService?.service.name}</strong> for{" "}
              {selectedService
                ? getBookingCustomerName(selectedService.booking)
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              By claiming this service, you will be assigned as the staff member
              responsible for it. You can mark it as served later.
            </p>

            {selectedService && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-semibold text-slate-900">
                  Payment Status
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-medium">
                      {formatCurrency(selectedService.booking.grand_total)}
                    </span>
                  </div>
                  {selectedService.booking.downpayment &&
                  selectedService.booking.downpayment > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Downpayment:
                        </span>
                        <span className="font-medium text-primary tabular-nums">
                          {formatCurrency(selectedService.booking.downpayment)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                          {formatCurrency(
                            selectedService.booking.grand_total -
                              selectedService.booking.downpayment,
                          )}
                        </span>
                      </div>
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                          Half-paid · Balance of{" "}
                          <span className="tabular-nums">
                            {formatCurrency(
                              selectedService.booking.grand_total -
                                selectedService.booking.downpayment,
                            )}
                          </span>{" "}
                          still due
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2">
                      <p className="text-xs font-medium text-primary">
                        Fully paid
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedService(null)}
              disabled={isClaiming}
            >
              Cancel
            </Button>
            {canClaimServices ? (
              <Button onClick={handleClaim} disabled={isClaiming}>
                {isClaiming ? "Claiming..." : "Claim Service"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
