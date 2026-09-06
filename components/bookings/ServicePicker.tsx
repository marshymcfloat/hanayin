"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { Check, ChevronDown, Package, Search, Users } from "lucide-react";
import type {
  PackageItem,
  Service,
  ServicePackage,
} from "@/prisma/generated/prisma/client";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { checkCategoryAvailability } from "@/lib/server actions/availability";
import {
  getApplicableDiscount,
  type SaleEventForPricing,
} from "@/lib/utils/pricing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

gsap.registerPlugin(useGSAP);

type PackageWithItems = ServicePackage & {
  items: (PackageItem & { service: Service })[];
};

type SelectedService = Service & {
  quantity?: number;
  packageId?: number;
  packageName?: string;
  originalPrice?: number;
  discount?: number;
  discountReason?: string | null;
};

type FormLike = {
  control: unknown;
  setValue: (
    name: "services",
    value: SelectedService[],
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
  ) => void;
};

type Availability = {
  hasBusinessHours: boolean;
  businessHoursPassed: boolean;
  qualifiedEmployeeCount: number;
  qualifiedOwnerCount: number;
  qualifiedProviderCount: number;
};

type AvailabilityState = {
  disabled: boolean;
  tone: "default" | "warning";
  label: string;
};

function getAvailabilityState(
  availability: Availability | undefined,
  hasSelectedDate: boolean,
): AvailabilityState {
  if (!availability) {
    return { disabled: false, tone: "default", label: "Checking availability" };
  }
  if (!hasSelectedDate) {
    return {
      disabled: false,
      tone: "default",
      label:
        availability.qualifiedProviderCount > 0
          ? `${availability.qualifiedProviderCount} providers available`
          : "Choose a date to check availability",
    };
  }
  if (!availability.hasBusinessHours || availability.businessHoursPassed) {
    return {
      disabled: true,
      tone: "warning",
      label: "Unavailable on selected date",
    };
  }
  if (availability.qualifiedProviderCount === 0) {
    return { disabled: true, tone: "warning", label: "No available providers" };
  }
  return {
    disabled: false,
    tone: "default",
    label: `${availability.qualifiedProviderCount} providers available`,
  };
}

type PickerRowProps = {
  title: string;
  category: string;
  price: number;
  originalPrice?: number;
  detail?: string;
  selected: boolean;
  disabled: boolean;
  availability: AvailabilityState;
  kind: "service" | "package";
  onSelect: () => void;
};

const PickerRow = React.memo(function PickerRow({
  title,
  category,
  price,
  originalPrice,
  detail,
  selected,
  disabled,
  availability,
  kind,
  onSelect,
}: PickerRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled && !selected}
      onClick={onSelect}
      className={cn(
        "group grid min-h-14 w-full cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150",
        selected
          ? "border-foreground/35 bg-foreground/[0.055]"
          : "border-border/80 bg-background hover:border-foreground/20 hover:bg-muted/35",
        disabled && !selected && "cursor-not-allowed opacity-55",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-foreground bg-foreground text-background"
            : "border-muted-foreground/35 bg-background text-transparent",
        )}
        aria-hidden="true"
      >
        <Check className="size-3 stroke-[3]" />
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          {kind === "package" && (
            <Package className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold leading-5 text-foreground">
            {title}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
          <span className="truncate capitalize">{detail || category}</span>
          <span aria-hidden="true">·</span>
          <Users className="size-3 shrink-0" />
          <span
            className={cn(
              "truncate",
              availability.tone === "warning" && "text-amber-700",
            )}
          >
            {availability.label}
          </span>
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-foreground">
          ₱{price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
        {originalPrice !== undefined && originalPrice > price && (
          <span className="block text-[10px] tabular-nums text-muted-foreground line-through">
            ₱{originalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        )}
      </span>
    </button>
  );
});

export default function ServicePicker({
  services,
  packages = [],
  categories,
  form,
  saleEvents = [],
  businessSlug,
  selectedDate,
  disabled = false,
}: {
  services: Service[];
  packages?: PackageWithItems[];
  categories: string[];
  form: FormLike;
  saleEvents?: SaleEventForPricing[];
  businessSlug: string;
  selectedDate?: Date;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"services" | "packages">("services");
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const selected = useWatch({
    control: form.control as Control,
    name: "services",
    defaultValue: [],
  }) as SelectedService[];
  const selectedRef = React.useRef(selected);
  const eventsRef = React.useRef(saleEvents);
  React.useEffect(() => {
    selectedRef.current = selected;
    eventsRef.current = saleEvents;
  });

  const serviceCategories = React.useMemo(
    () => Array.from(new Set(services.map((service) => service.category))),
    [services],
  );
  const { data: availability } = useQuery({
    queryKey: [
      "categoryAvailability",
      businessSlug,
      serviceCategories,
      selectedDate?.toISOString(),
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        serviceCategories.map(async (serviceCategory) => {
          try {
            return [
              serviceCategory,
              await checkCategoryAvailability({
                businessSlug,
                category: serviceCategory,
                date: selectedDate,
              }),
            ] as const;
          } catch {
            return [serviceCategory, undefined] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<
        string,
        Availability | undefined
      >;
    },
    enabled: Boolean(businessSlug && serviceCategories.length),
    staleTime: 30_000,
  });

  const selectedKeys = React.useMemo(
    () =>
      new Set(
        selected.map(
          (item) => `${item.id}|${item.packageId ?? "service"}`,
        ),
      ),
    [selected],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleServices = React.useMemo(
    () =>
      services.filter(
        (service) =>
          (category === "all" || service.category === category) &&
          (!normalizedQuery ||
            service.name.toLowerCase().includes(normalizedQuery) ||
            service.category.toLowerCase().includes(normalizedQuery)),
      ),
    [category, normalizedQuery, services],
  );
  const visiblePackages = React.useMemo(
    () =>
      packages.filter(
        (item) =>
          !normalizedQuery ||
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.category.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, packages],
  );

  const commit = React.useCallback(
    (next: SelectedService[]) => {
      form.setValue("services", next, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
  );
  const toggleService = React.useCallback(
    (service: Service) => {
      const current = selectedRef.current;
      const exists = current.some(
        (item) => item.id === service.id && item.packageId == null,
      );
      if (exists) {
        commit(
          current.filter(
            (item) => !(item.id === service.id && item.packageId == null),
          ),
        );
        return;
      }
      const discount = getApplicableDiscount(
        service.id,
        undefined,
        service.price,
        eventsRef.current,
      );
      commit([
        ...current,
        {
          ...service,
          quantity: 1,
          price: discount?.finalPrice ?? service.price,
          originalPrice: service.price,
          discount: discount?.discount ?? 0,
          discountReason: discount?.reason ?? null,
        },
      ]);
    },
    [commit],
  );
  const togglePackage = React.useCallback(
    (item: PackageWithItems) => {
      const current = selectedRef.current;
      const exists = item.items.every((entry) =>
        current.some(
          (selectedItem) =>
            selectedItem.id === entry.service.id &&
            selectedItem.packageId === item.id,
        ),
      );
      if (exists) {
        commit(current.filter((selectedItem) => selectedItem.packageId !== item.id));
        return;
      }
      const withoutExistingPackage = current.filter(
        (selectedItem) => selectedItem.packageId !== item.id,
      );
      const discount = getApplicableDiscount(
        0,
        item.id,
        item.price,
        eventsRef.current,
      );
      const ratio = discount ? discount.finalPrice / item.price : 1;
      commit([
        ...withoutExistingPackage,
        ...item.items.map((entry) => ({
          ...entry.service,
          quantity: 1,
          price: entry.custom_price * ratio,
          originalPrice: entry.service.price,
          packageId: item.id,
          packageName: item.name,
          discount: discount
            ? entry.custom_price - entry.custom_price * ratio
            : 0,
          discountReason: discount?.reason ?? null,
        })),
      ]);
    },
    [commit],
  );

  useGSAP(
    () => {
      if (!open || !panelRef.current) return;
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          panelRef.current,
          { autoAlpha: 0, y: -5, scale: 0.995 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.16,
            ease: "power2.out",
            clearProps: "transform,opacity,visibility",
          },
        );
      });
      return () => media.revert();
    },
    { dependencies: [open], scope: panelRef, revertOnUpdate: true },
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-11 w-full justify-between rounded-lg border-border bg-background px-3 shadow-none hover:bg-muted/30"
        >
          <span className="truncate font-medium">
            {selected.length
              ? `${selected.length} service${selected.length === 1 ? "" : "s"} selected`
              : "Choose services or packages"}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-2">
            {selected.length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                {selected.length}
              </span>
            )}
            <ChevronDown className="size-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        ref={panelRef}
        align="start"
        className="pointer-events-auto w-(--radix-popover-trigger-width) overflow-hidden rounded-2xl border border-border bg-popover p-0 shadow-xl data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <div className="border-b p-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Offering type">
            {(["services", "packages"] as const).map((itemMode) => (
              <button
                key={itemMode}
                type="button"
                role="tab"
                aria-selected={mode === itemMode}
                onClick={() => setMode(itemMode)}
                className={cn(
                  "min-h-9 cursor-pointer rounded-md px-3 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === itemMode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {itemMode} <span className="ml-1 opacity-55">{itemMode === "services" ? services.length : packages.length}</span>
              </button>
            ))}
          </div>
          <label className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search {mode}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${mode}`}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {mode === "services" && (
          <div
            className="flex min-w-0 max-w-full touch-pan-x gap-1 overflow-x-auto overscroll-x-contain border-b px-2 py-1.5"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            {["all", ...categories].map((itemCategory) => (
              <button
                key={itemCategory}
                type="button"
                onClick={() => setCategory(itemCategory)}
                className={cn(
                  "h-8 shrink-0 cursor-pointer rounded-md px-3 text-[11px] font-medium capitalize transition-colors",
                  category === itemCategory
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {itemCategory}
              </button>
            ))}
          </div>
        )}

        <div
          className="max-h-[320px] touch-pan-y overflow-y-auto overscroll-contain p-2 sm:max-h-[360px]"
          role="listbox"
          aria-label={mode === "services" ? "Services" : "Packages"}
          onWheel={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {mode === "services"
              ? visibleServices.map((service) => {
                  const isSelected = selectedKeys.has(`${service.id}|service`);
                  const state = getAvailabilityState(
                    availability?.[service.category],
                    Boolean(selectedDate),
                  );
                  const discount = getApplicableDiscount(
                    service.id,
                    undefined,
                    service.price,
                    saleEvents,
                  );
                  return (
                    <PickerRow
                      key={service.id}
                      title={service.name}
                      category={service.category}
                      price={discount?.finalPrice ?? service.price}
                      originalPrice={discount ? service.price : undefined}
                      selected={isSelected}
                      disabled={state.disabled}
                      availability={state}
                      kind="service"
                      onSelect={() => (!state.disabled || isSelected) && toggleService(service)}
                    />
                  );
                })
              : visiblePackages.map((item) => {
                  const isSelected = item.items.every((entry) =>
                    selectedKeys.has(`${entry.service.id}|${item.id}`),
                  );
                  const state = getAvailabilityState(
                    availability?.[item.category],
                    Boolean(selectedDate),
                  );
                  const discount = getApplicableDiscount(
                    0,
                    item.id,
                    item.price,
                    saleEvents,
                  );
                  return (
                    <PickerRow
                      key={item.id}
                      title={item.name}
                      category={item.category}
                      detail={item.items.map((entry) => entry.service.name).join(", ")}
                      price={discount?.finalPrice ?? item.price}
                      originalPrice={discount ? item.price : undefined}
                      selected={isSelected}
                      disabled={state.disabled}
                      availability={state}
                      kind="package"
                      onSelect={() => (!state.disabled || isSelected) && togglePackage(item)}
                    />
                  );
                })}
            {((mode === "services" && visibleServices.length === 0) ||
              (mode === "packages" && visiblePackages.length === 0)) && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground sm:col-span-2">
                No matching {mode}.
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
