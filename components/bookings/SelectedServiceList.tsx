import React, { useMemo } from "react";
import { Button } from "../ui/button";
import { Minus, Plus, X, Package, Sparkles } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

type SelectedServiceItem = {
  id: number;
  name: string;
  price: number;
  quantity?: number;
  packageId?: number;
  packageName?: string;
  originalPrice?: number;
  discountReason?: string | null;
  slotsRemaining?: number | null;
  flow_triggers?: unknown[];
};

type SelectedServiceListProps = {
  form: {
    setValue: (name: "services", value: SelectedServiceItem[]) => void;
  };
  services: SelectedServiceItem[];
};

const SelectedServiceList = React.memo(function SelectedServiceList({
  form,
  services: selectedServices,
}: SelectedServiceListProps) {
  const updateQuantity = (
    serviceId: number,
    delta: number,
    packageId?: number,
  ) => {
    const newServices = selectedServices.map((s) => {
      if (s.id === serviceId && s.packageId === packageId) {
        const newQuantity = (s.quantity || 1) + delta;
        return { ...s, quantity: Math.max(1, newQuantity) };
      }
      return s;
    });
    form.setValue("services", newServices);
  };

  const removeService = (serviceId: number, packageId?: number) => {
    let newServices;
    if (packageId) {
      newServices = selectedServices.filter((s) => s.packageId !== packageId);
    } else {
      newServices = selectedServices.filter(
        (s) => !(s.id === serviceId && !s.packageId),
      );
    }
    form.setValue("services", newServices);
  };

  const groupedServices = useMemo(() => {
    const groups: Record<string, SelectedServiceItem[]> = {};
    const standalone: SelectedServiceItem[] = [];

    selectedServices.forEach((service) => {
      if (service.packageId) {
        if (!groups[service.packageId]) {
          groups[service.packageId] = [];
        }
        groups[service.packageId].push(service);
      } else {
        standalone.push(service);
      }
    });

    return { groups, standalone };
  }, [selectedServices]);

  if (!selectedServices || selectedServices.length === 0) {
    return (
      <div className="text-center p-8 border-2 border-dashed border-muted-foreground/10 rounded-xl bg-muted/20">
        <Package className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground font-medium">
          No services selected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* Packages */}
        {Object.entries(groupedServices.groups).map(([pkgId, services]) => {
          const packageName = services[0]?.packageName || "Package";
          const pkgPrice = services.reduce(
            (sum, s) => sum + s.price * (s.quantity || 1),
            0,
          );

          return (
            <div
              key={`pkg-${pkgId}`}
              className="bg-primary/5 border border-primary/20 rounded-lg overflow-hidden"
            >
              {/* Package Header */}
              <div className="bg-primary/10 px-3 py-2 flex items-center justify-between border-b border-primary/10">
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold text-xs text-primary uppercase tracking-wide">
                    {packageName}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 touch-manipulation text-primary/60 hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8 -mr-1"
                  onClick={() => removeService(services[0].id, Number(pkgId))}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Package Content */}
              <div className="p-2 space-y-1">
                {services.map((service, idx) => (
                  <div
                    key={`${service.id}-${service.packageId}-${idx}`}
                    className="flex justify-between items-center text-xs pl-2 border-l-2 border-primary/20 ml-1"
                  >
                    <span className="text-muted-foreground">
                      {(service.quantity ?? 1) > 1 && (
                        <span className="font-medium text-foreground mr-1">
                          {service.quantity ?? 1}x
                        </span>
                      )}
                      {service.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Package Footer */}
              <div className="bg-background/40 px-3 py-2 flex justify-between items-center text-xs border-t border-primary/10">
                <div className="flex h-11 items-center gap-1 rounded-md border bg-background shadow-sm sm:h-9">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-full w-11 touch-manipulation rounded-none rounded-l-md hover:bg-muted sm:w-9"
                    onClick={() => {
                      const currentQty = services[0].quantity || 1;
                      if (currentQty > 1) {
                        const newServices = selectedServices.map((s) => {
                          if (s.packageId === Number(pkgId)) {
                            return { ...s, quantity: (s.quantity || 1) - 1 };
                          }
                          return s;
                        });
                        form.setValue("services", newServices);
                      }
                    }}
                    type="button"
                  >
                    <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                  </Button>
                  <span className="w-9 text-center text-sm font-medium sm:w-7 sm:text-xs">
                    {services[0].quantity || 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-full w-11 touch-manipulation rounded-none rounded-r-md hover:bg-muted sm:w-9"
                    onClick={() => {
                      const newServices = selectedServices.map((s) => {
                        if (s.packageId === Number(pkgId)) {
                          return { ...s, quantity: (s.quantity || 1) + 1 };
                        }
                        return s;
                      });
                      form.setValue("services", newServices);
                    }}
                    type="button"
                  >
                    <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                  </Button>
                </div>
                <div className="font-semibold text-primary">
                  ₱
                  {pkgPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Standalone Services */}
        {groupedServices.standalone.map((service) => {
          const qty = service.quantity || 1;
          const lineTotal = service.price * qty;
          const hasOriginal = service.discountReason && (service.originalPrice ?? service.price) > service.price;
          return (
            <div
              key={`standalone-${service.id}`}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border/70 bg-card/50 hover:bg-card transition-colors group"
            >
              {/* Left: name + unit price + meta */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-medium text-sm text-foreground/90 truncate">
                    {service.name}
                  </span>
                  {service.flow_triggers && service.flow_triggers.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[9px] h-3.5 px-1 bg-primary/10 text-primary border-primary/20"
                    >
                      <Sparkles className="w-2 h-2 mr-0.5" />
                      Flow
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      service.discountReason ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    ₱{service.price.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  {hasOriginal && (
                    <span className="text-[10px] text-muted-foreground/70 line-through tabular-nums">
                      ₱{(service.originalPrice ?? service.price).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                  {service.discountReason && (
                    <Badge
                      variant="destructive"
                      className="h-3.5 px-1 text-[9px] font-medium leading-none"
                    >
                      {service.discountReason}
                    </Badge>
                  )}
                  {service.slotsRemaining !== undefined && service.slotsRemaining !== null && (
                    <Badge
                      variant="outline"
                      className="h-3.5 px-1 text-[9px] font-medium border-amber-300 text-amber-700 bg-amber-50 leading-none"
                    >
                      {service.slotsRemaining} left
                    </Badge>
                  )}
                </div>
              </div>

              {/* Right: qty + total + remove */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex h-7 items-center rounded-md border border-border/70 bg-muted/40">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-full w-6 rounded-none rounded-l-md hover:bg-background"
                    onClick={() => updateQuantity(service.id, -1)}
                    type="button"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="min-w-[1.25rem] text-center text-[11px] font-medium tabular-nums">
                    {qty}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-full w-6 rounded-none rounded-r-md hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(service.id, 1);
                    }}
                    type="button"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <span className="font-semibold text-xs tabular-nums whitespace-nowrap">
                  ₱{lineTotal.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mr-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  onClick={() => removeService(service.id)}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default SelectedServiceList;
