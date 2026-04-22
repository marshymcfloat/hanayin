import React, { useMemo } from "react";
import { Button } from "../ui/button";
import { Minus, Plus, X, Package, Sparkles } from "lucide-react";
import { Badge } from "../ui/badge";

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
        {groupedServices.standalone.map((service) => (
          <div
            key={`standalone-${service.id}`}
            className="flex flex-col gap-2 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors relative group"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground/90">
                    {service.name}
                  </span>
                  {service.flow_triggers && service.flow_triggers.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-4 px-1 bg-indigo-50/50 text-indigo-600 border-indigo-100"
                    >
                      <Sparkles className="w-2 h-2 mr-1" />
                      Flow
                    </Badge>
                  )}
                </div>

                {service.discountReason ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-destructive">
                      ₱
                      {service.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    {(service.originalPrice ?? service.price) > service.price && (
                      <span className="text-[10px] text-muted-foreground line-through decoration-muted-foreground/50">
                        ₱
                        {(service.originalPrice ?? service.price).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium">
                    ₱
                    {service.price.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  ₱
                  {(service.price * (service.quantity || 1)).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 touch-manipulation text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8 -mr-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => removeService(service.id)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              {/* Controls */}
              <div className="flex h-11 items-center gap-1 self-start rounded-md border bg-muted/40 sm:h-9">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-11 touch-manipulation rounded-none rounded-l-md hover:bg-background hover:text-foreground sm:w-9"
                  onClick={() => updateQuantity(service.id, -1)}
                  type="button"
                >
                  <Minus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </Button>
                <span className="min-w-[2rem] text-center text-sm font-medium tabular-nums sm:min-w-[1.5rem] sm:text-xs">
                  {service.quantity || 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-11 touch-manipulation rounded-none rounded-r-md hover:bg-background hover:text-foreground sm:w-9"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateQuantity(service.id, 1);
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </Button>
              </div>

              {service.discountReason && (
                <Badge
                  variant="destructive"
                  className="h-5 px-1.5 text-[10px] font-medium"
                >
                  {service.discountReason}
                </Badge>
              )}
              {service.slotsRemaining !== undefined && service.slotsRemaining !== null && (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] font-medium border-amber-300 text-amber-700 bg-amber-50"
                >
                  {service.slotsRemaining} {service.slotsRemaining === 1 ? "slot" : "slots"} left
                </Badge>
              )}
            </div>

            {service.flow_triggers && service.flow_triggers.length > 0 && (
              <div className="absolute right-3 bottom-3 opacity-5 pointer-events-none">
                <Sparkles className="w-8 h-8 text-indigo-500" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default SelectedServiceList;
