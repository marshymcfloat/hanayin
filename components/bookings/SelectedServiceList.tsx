import React, { useMemo, useContext } from "react";
import { BookingQuoteContext } from "@/components/bookings/BookingQuoteContext";
import { Button } from "../ui/button";
import { Minus, Plus, X, Package, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

type SelectedServiceItem = {
  packageInstanceId?: string; packageChoiceId?: string; selectionKey?: string;
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
  presentation?: "default" | "owner";
};

function formatMoney(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function OwnerSelectedRow({ name, detail, quantity, price, icon: Icon, onIncrease, onDecrease, onRemove }: {
  name: string;
  detail: string;
  quantity: number;
  price: number;
  icon: LucideIcon;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-[#E1E5DC] bg-white px-2.5 py-2">
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-[#4D842D]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-semibold leading-4 text-[#20211F]">{name}</p>
          <p className="mt-0.5 line-clamp-2 break-words text-[11px] leading-4 text-[#696C67]">{detail}</p>
        </div>
      </div>
      <div className="mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_2.75rem] items-center gap-1">
        <div className="inline-flex shrink-0 items-center rounded-lg border border-[#DDE0D9] bg-[#F8F9F6]">
          <button type="button" onClick={onDecrease} disabled={quantity <= 1} aria-label={`Decrease ${name} quantity`} className="grid size-11 cursor-pointer place-items-center rounded-l-lg disabled:cursor-not-allowed disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-[#72CF35]"><Minus className="size-3.5" aria-hidden="true" /></button>
          <span className="min-w-5 text-center font-mono text-xs font-semibold tabular-nums">{quantity}</span>
          <button type="button" onClick={onIncrease} aria-label={`Increase ${name} quantity`} className="grid size-11 cursor-pointer place-items-center rounded-r-lg focus-visible:ring-2 focus-visible:ring-[#72CF35]"><Plus className="size-3.5" aria-hidden="true" /></button>
        </div>
        <strong className="min-w-0 break-all text-right font-mono text-xs font-semibold leading-4 tabular-nums text-[#20211F]">{formatMoney(price)}</strong>
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-[#696C67] hover:bg-[#FFF0F0] hover:text-[#C74248] focus-visible:ring-2 focus-visible:ring-[#72CF35]"><X className="size-4" aria-hidden="true" /></button>
      </div>
    </article>
  );
}

const SelectedServiceList = React.memo(function SelectedServiceList({
  form,
  services: selectedServices,
  presentation = "default",
}: SelectedServiceListProps) {
  const quote = useContext(BookingQuoteContext);
  const lineTotal = (service: SelectedServiceItem) => {
    const index = selectedServices.indexOf(service);
    const prefix = `${service.selectionKey ?? `cart-${index}-${service.id}`}-`;
    const lines = quote?.services.filter(line => line.selectionKey?.startsWith(prefix));
    return lines?.length ? lines.reduce((sum, line) => sum + line.price, 0) : service.price * (service.quantity || 1);
  };
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

  const removeService = (serviceId: number, packageId?: number, instanceId?: string) => {
    let newServices;
    if (packageId) {
      newServices = selectedServices.filter((s) => instanceId ? s.packageInstanceId !== instanceId : s.packageId !== packageId);
    } else {
      newServices = selectedServices.filter(
        (s) => !(s.id === serviceId && !s.packageId),
      );
    }
    form.setValue("services", newServices);
  };

  const updatePackageQuantity = (packageId: number, delta: number, instanceId?: string) => {
    if (instanceId) {
      if (delta < 0) { form.setValue("services", selectedServices.filter(service => service.packageInstanceId !== instanceId)); return; }
      const next = crypto.randomUUID();
      form.setValue("services", [...selectedServices, ...selectedServices.filter(service => service.packageInstanceId === instanceId).map((service, index) => ({ ...service, quantity: 1, packageInstanceId: next, selectionKey: `${next}-${index}` }))]);
      return;
    }
    form.setValue("services", selectedServices.map((service) =>
      service.packageId === packageId
        ? { ...service, quantity: Math.max(1, (service.quantity || 1) + delta) }
        : service,
    ));
  };

  const groupedServices = useMemo(() => {
    const groups: Record<string, SelectedServiceItem[]> = {};
    const standalone: SelectedServiceItem[] = [];

    selectedServices.forEach((service) => {
      if (service.packageId) {
        const key = service.packageInstanceId ?? String(service.packageId);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(service);
      } else {
        standalone.push(service);
      }
    });

    return { groups, standalone };
  }, [selectedServices]);

  if (presentation === "owner") {
    if (selectedServices.length === 0) {
      return <p className="rounded-xl border border-dashed border-[#DDE0D9] bg-[#F8F9F6] px-3 py-4 text-xs text-[#696C67]">No treatments selected yet. Choose from the catalog above.</p>;
    }

    return (
      <div className="space-y-1.5" aria-label="Selected treatments">
        {Object.entries(groupedServices.groups).map(([key, items]) => {
          const packageId = items[0].packageId!;
          const name = items[0]?.packageName || "Package";
          const quantity = items[0]?.quantity || 1;
          return (
            <OwnerSelectedRow
              key={key}
              name={name}
              detail={String(items.length) + " included · " + items.map((item) => item.name).join(" · ")}
              quantity={quantity}
              price={items.reduce((sum, item) => sum + lineTotal(item), 0)}
              icon={Package}
              onDecrease={() => updatePackageQuantity(packageId, -1, items[0].packageInstanceId)}
              onIncrease={() => updatePackageQuantity(packageId, 1, items[0].packageInstanceId)}
              onRemove={() => removeService(items[0].id, packageId, items[0].packageInstanceId)}
            />
          );
        })}
        {groupedServices.standalone.map((service) => (
          <OwnerSelectedRow
            key={service.id}
            name={service.name}
            detail={[formatMoney(service.price) + " each", service.discountReason, service.slotsRemaining == null ? null : String(service.slotsRemaining) + " left"].filter(Boolean).join(" · ")}
            quantity={service.quantity || 1}
            price={lineTotal(service)}
            icon={Sparkles}
            onDecrease={() => updateQuantity(service.id, -1)}
            onIncrease={() => updateQuantity(service.id, 1)}
            onRemove={() => removeService(service.id)}
          />
        ))}
      </div>
    );
  }
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
            (sum, s) => sum + lineTotal(s),
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
                onClick={() => removeService(services[0].id, services[0].packageId, services[0].packageInstanceId)}
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
                    onClick={() => updatePackageQuantity(services[0].packageId!, -1, services[0].packageInstanceId)}
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
                    onClick={() => updatePackageQuantity(services[0].packageId!, 1, services[0].packageInstanceId)}
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
          const totalPrice = lineTotal(service);
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
                  ₱{totalPrice.toLocaleString(undefined, {
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
