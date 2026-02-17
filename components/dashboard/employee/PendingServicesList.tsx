"use client";

import { formatPH } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Clock as ClockIcon, RefreshCcw } from "lucide-react";
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
    };
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
      <div className="h-full flex flex-col">
        <div className="space-y-4 p-4 lg:p-0">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 gap-2 rounded-xl border-zinc-200 bg-white hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
            >
              <RefreshCcw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span className="font-medium">Refresh</span>
            </Button>
          </div>

          {visibleServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 opacity-70 border-2 border-dashed border-slate-200 rounded-3xl">
              <div className="bg-slate-50 p-6 rounded-full">
                <Inbox className="w-10 h-10 text-slate-300" />
              </div>
              <div className="max-w-xs mx-auto">
                <h3 className="font-bold text-lg text-slate-900">
                  All caught up!
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  There are no pending services in the queue right now.
                </p>
              </div>
            </div>
          ) : (
            visibleServices.map((item) => {
              const customerInitials = item.booking.customer.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              const discountInfo = getApplicableDiscount(
                item.service.id, // Assuming service ID is available on item.service
                item.package_id ? Number(item.package_id) : undefined,
                item.price,
                saleEvents,
              );

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl p-3 shadow-sm border border-slate-100 transition-all group active:scale-[0.99] relative overflow-hidden ${canClaimServices ? "hover:border-indigo-200 hover:shadow-md cursor-pointer" : "opacity-70"}`}
                  onClick={() => {
                    if (canClaimServices) {
                      setSelectedService(item);
                    }
                  }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>

                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200 shadow-inner shrink-0">
                        {customerInitials}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm leading-tight group-hover:text-indigo-600 transition-colors">
                            {item.service.name}
                          </h4>
                          {item.package && (
                            <Badge
                              variant="secondary"
                              className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-semibold h-4 px-1"
                            >
                              {item.package.name}
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs font-medium text-slate-500">
                          {item.booking.customer.name}
                        </p>

                        <div className="flex items-center gap-3 pt-1">
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                            <ClockIcon className="w-3 h-3" />
                            {getDisplayScheduledAt(item)
                              ? formatPH(getDisplayScheduledAt(item), "h:mm a")
                              : "Walk-in"}
                          </span>
                          {item.service.duration && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {item.service.duration} mins
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end pl-2">
                      <span className="text-sm font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                        {discountInfo &&
                        discountInfo.finalPrice !== item.price ? (
                          <div className="flex flex-col items-end leading-none gap-0.5">
                            <span className="text-xs text-red-500 line-through opacity-70">
                              ₱{item.price.toLocaleString()}
                            </span>
                            <span className="text-emerald-600">
                              ₱{discountInfo.finalPrice.toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          `₱${item.price.toLocaleString()}`
                        )}
                      </span>
                    </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to claim this service?
              <br />
              <strong>{selectedService?.service.name}</strong> for{" "}
              {selectedService?.booking.customer.name}
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
                      ₱{selectedService.booking.grand_total.toLocaleString()}
                    </span>
                  </div>
                  {selectedService.booking.downpayment &&
                  selectedService.booking.downpayment > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Downpayment:
                        </span>
                        <span className="font-medium text-green-600">
                          ₱
                          {selectedService.booking.downpayment.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className="font-bold text-orange-600">
                          ₱
                          {(
                            selectedService.booking.grand_total -
                            selectedService.booking.downpayment
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-md">
                        <p className="text-xs text-orange-800 font-medium">
                          ⚠️ Half-paid: Balance of ₱
                          {(
                            selectedService.booking.grand_total -
                            selectedService.booking.downpayment
                          ).toLocaleString()}{" "}
                          still due
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-xs text-green-800 font-medium">
                        ✓ Fully paid
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
