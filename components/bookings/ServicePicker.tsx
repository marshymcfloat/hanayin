"use client";

import * as React from "react";
import { readPackageChoices, matchesServiceRule } from "@/features/catalog/offer-definitions";
import { PackageChoiceDialog } from "@/components/bookings/PackageChoiceDialog";
import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { Check, ChevronDown, Clock3, Package, Plus, Search, Sparkles, Users } from "lucide-react";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import designStyles from "@/components/bookings/design-study/booking-design-experiment.module.css";
import liveStyles from "@/components/bookings/design-study/live-booking-sheet.module.css";
import { BookingDesignForm, type BookingDesignTreatment } from "@/components/bookings/design-study/BookingSelectionSurface";
import type {
  PackageItem,
  Service,
  ServicePackage,
} from "@/prisma/generated/prisma/client";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { checkCategoryAvailability } from "@/features/bookings/actions/availability";
import {
  getApplicableDiscount,
  type SaleEventForPricing,
} from "@/lib/utils/pricing";
import { cn } from "@/lib/utils";
import { useOptionalViewer } from "@/lib/auth/viewer-context";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";
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

export type SelectedService = Service & {
  packageInstanceId?: string; packageChoiceId?: string; selectionKey?: string;
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
  locked?: boolean;
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
  duration?: number | null;
  selected: boolean;
  disabled: boolean;
  locked?: boolean;
  availability: AvailabilityState;
  kind: "service" | "package";
  owner?: boolean;
  redesign?: boolean;
  onSelect: () => void;
};

const PickerRow = React.memo(function PickerRow({
  title,
  category,
  price,
  originalPrice,
  detail,
  duration,
  selected,
  disabled,
  locked = false,
  availability,
  kind,
  owner = false,
  redesign = false,
  onSelect,
}: PickerRowProps) {
  if (redesign) return <button type="button" role="option" aria-selected={selected}
    disabled={locked || (disabled && !selected)} onClick={onSelect} className={designStyles.service}>
    <span className={designStyles.serviceCopy}><strong>{title}</strong><span>{detail || category}</span>
      <small><Clock3 size={11} aria-hidden="true" />{duration ? `${duration} min · ` : ""}{availability.label}</small>
    </span>
    <span className={designStyles.servicePrice}>₱{price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      {originalPrice !== undefined && originalPrice > price && <del className="block text-xs text-muted-foreground">₱{originalPrice.toLocaleString()}</del>}
    </span>
    <span className={designStyles.addIcon} aria-hidden="true">{selected ? <Check size={16} /> : <Plus size={16} />}</span>
  </button>;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={locked || (disabled && !selected)}
      onClick={onSelect}
      className={cn(
        "group grid min-h-14 w-full cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150",
        owner && "min-h-17 grid-cols-[2.5rem_minmax(0,1fr)_auto] rounded-[16px] border-[#E7E9E4] bg-white px-3.5 py-3 outline-none focus-visible:ring-3 focus-visible:ring-[#72CF35] sm:px-4",
        selected
          ? owner ? "!border-[#72CF35] !bg-[#EFF9E8]" : "border-foreground/35 bg-foreground/[0.055]"
          : owner ? "hover:border-[#9DAC92] hover:bg-[#FAFBF8]" : "border-border/80 bg-background hover:border-foreground/20 hover:bg-muted/35",
        (locked || (disabled && !selected)) && "cursor-not-allowed opacity-55",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border transition-colors",
          owner && "size-10 rounded-[12px] border-0 bg-[#F1F2EF] text-[#343633]",
          selected
            ? owner ? "!bg-[#20211F] !text-[#B9F379]" : "border-foreground bg-foreground text-background"
            : owner ? "!text-[#343633]" : "border-muted-foreground/35 bg-background text-transparent",
        )}
        aria-hidden="true"
      >
        {owner ? selected ? <Check className="size-4 stroke-[3]" /> : kind === "package" ? <Package className="size-4" /> : <Sparkles className="size-4" /> : <Check className="size-3 stroke-[3]" />}
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          {kind === "package" && !owner && (
            <Package className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={cn("truncate text-sm font-semibold leading-5 text-foreground", owner && "text-[#20211F]")}>
            {title}
          </span>
        </span>
        <span className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground", owner && "flex-wrap text-[#696C67]")}>
          <span className="truncate capitalize">{detail || category}</span>
          {owner && duration ? <><span aria-hidden="true">·</span><span>{duration} min</span></> : null}
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
        <span className={cn("block text-sm font-semibold tabular-nums text-foreground", owner && "font-mono text-[#20211F]")}>
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
  presentation = "default",
  redesign = false,
  selectionSheet,
}: {
  services: Service[];
  packages?: PackageWithItems[];
  categories: string[];
  form: FormLike;
  saleEvents?: SaleEventForPricing[];
  businessSlug: string;
  selectedDate?: Date;
  disabled?: boolean;
  presentation?: "default" | "owner";
  redesign?: boolean;
  selectionSheet?: { total: number; canContinue: boolean; onContinue: () => void };
}) {
  const owner = presentation === "owner";
  const staffDialogTheme = useOptionalViewer()?.actorType === "EMPLOYEE" ? staffTheme.workspace : "";
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"services" | "packages">("services");
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [choicePackage, setChoicePackage] = React.useState<PackageWithItems | null>(null);
  const [choiceOpen, setChoiceOpen] = React.useState(false);
  const choiceDialog = choicePackage ? <PackageChoiceDialog key={choicePackage.id} pkg={choicePackage} services={services} open={choiceOpen} onClose={() => setChoiceOpen(false)} onExited={() => setChoicePackage(null)} onAdd={items => form.setValue("services", [...selectedRef.current, ...items], { shouldDirty: true, shouldValidate: true })} /> : null;

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
      if (readPackageChoices(item.choices).length) { setChoicePackage(item); setChoiceOpen(true); return; }
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

  if (redesign && selectionSheet) {
    const quantities: Record<string, number> = {};
    const treatments: BookingDesignTreatment[] = services.map(service => {
      const selectedService = selected.find(item => item.id === service.id && item.packageId == null);
      const id = `service:${service.id}`;
      quantities[id] = selectedService?.quantity ?? (selectedService ? 1 : 0);
      const state = getAvailabilityState(availability?.[service.category], Boolean(selectedDate));
      return { id, name: service.name, category: service.category, description: service.description || service.category,
        price: selectedService?.price ?? getApplicableDiscount(service.id, undefined, service.price, saleEvents)?.finalPrice ?? service.price,
        minutes: service.duration ?? 0, kind: "service", disabled: state.disabled, availabilityLabel: state.label };
    });
    packages.forEach(item => {
      const members = selected.filter(entry => entry.packageId === item.id);
      const id = `package:${item.id}`;
      quantities[id] = readPackageChoices(item.choices).length ? new Set(members.map(member => member.packageInstanceId)).size : members[0]?.quantity ?? (members.length ? 1 : 0);
      const state = getAvailabilityState(availability?.[item.category], Boolean(selectedDate));
      treatments.push({ id, name: item.name, category: item.category, description: [...item.items.map(entry => entry.service.name), ...readPackageChoices(item.choices).map(choice => choice.label)].join(" + "),
        price: getApplicableDiscount(0, item.id, item.price, saleEvents)?.finalPrice ?? item.price,
        minutes: item.duration ?? 0, kind: "package", disabled: readPackageChoices(item.choices).length ? readPackageChoices(item.choices).some(choice => !services.some(service => matchesServiceRule(choice.rule, service))) : state.disabled || item.items.length === 0, availabilityLabel: readPackageChoices(item.choices).length ? "Choose included services" : state.label });
    });
    const matches = (entry: SelectedService, key: string) => key === (entry.packageId == null ? `service:${entry.id}` : `package:${entry.packageId}`);
    return <>{choiceDialog}<BookingDesignForm presentation="sheet" treatments={treatments} categories={["All services", ...Array.from(new Set([...categories, ...packages.map(item => item.category)]))]}
      live={{ ...selectionSheet, quantities, disabled,
        onToggle: key => {
          if (disabled) return;
          const flexible = packages.find(item => key === `package:${item.id}` && readPackageChoices(item.choices).length);
          if (flexible) { togglePackage(flexible); return; }
          if (quantities[key]) { commit(selected.filter(entry => !matches(entry, key))); return; }
          const treatment = treatments.find(item => item.id === key);
          if (!treatment || treatment.disabled) return;
          if (treatment.kind === "service") { const service = services.find(item => key === `service:${item.id}`); if (service) toggleService(service); }
          else { const item = packages.find(item => key === `package:${item.id}`); if (item) togglePackage(item); }
        },
        onQuantity: (key, delta) => {
          const flexible = packages.find(item => key === `package:${item.id}` && readPackageChoices(item.choices).length);
          if (flexible && delta > 0) { togglePackage(flexible); return; }
          if (flexible) { const instance = selected.find(entry => entry.packageId === flexible.id)?.packageInstanceId; commit(selected.filter(entry => entry.packageInstanceId !== instance)); return; }
          if (!disabled) commit(selected.map(entry => matches(entry, key) ? { ...entry, quantity: Math.min(99, Math.max(1, (entry.quantity ?? 1) + delta)) } : entry));
        },
      }} /></>;
  }

  const content = (
    <>
        {choiceDialog}
        {redesign ? <>
          <div className={designStyles.catalogToolbar}>
            <AnimatedFilterGroup className={designStyles.switcher} label="Offering type">
              {(["services", "packages"] as const).map(itemMode => <button key={itemMode} type="button" aria-pressed={mode === itemMode} disabled={disabled} onClick={() => setMode(itemMode)}>
                {itemMode === "services" ? <Sparkles size={15} aria-hidden="true" /> : <Package size={15} aria-hidden="true" />}
                {itemMode === "services" ? "Services" : "Packages"}<span>{itemMode === "services" ? services.length : packages.length}</span>
              </button>)}
            </AnimatedFilterGroup>
            <label className={designStyles.search}><Search size={17} aria-hidden="true" /><input aria-label={`Search ${mode}`} placeholder={`Search ${mode}`} value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} /></label>
          </div>
          {mode === "services" && <AnimatedFilterGroup className={designStyles.categories} label="Treatment category">
            {["all", ...categories].map(itemCategory => <button key={itemCategory} type="button" disabled={disabled} aria-pressed={category === itemCategory} onClick={() => setCategory(itemCategory)}>{itemCategory === "all" ? "All services" : itemCategory}</button>)}
          </AnimatedFilterGroup>}
          <div className={designStyles.listCaption}><span>{mode === "services" ? visibleServices.length : visiblePackages.length} {mode} to explore</span><span>Select to add <Plus size={12} aria-hidden="true" /></span></div>
        </> : <div className={cn("border-b p-2", owner && "border-[#E7E9E4] px-0 pb-3 pt-0")}>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Offering type">
            {(["services", "packages"] as const).map((itemMode) => (
              <button
                key={itemMode}
                type="button"
                role="tab"
                aria-selected={mode === itemMode}
                onClick={() => setMode(itemMode)}
                disabled={disabled}
                className={cn(
                  "min-h-9 cursor-pointer rounded-md px-3 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  owner && "min-h-11 rounded-[10px] focus-visible:ring-[#72CF35]",
                  mode === itemMode
                    ? owner ? "bg-[#20211F] text-white shadow-none" : "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {itemMode} <span className="ml-1 opacity-55">{itemMode === "services" ? services.length : packages.length}</span>
              </button>
            ))}
          </div>
          <label className={cn("mt-2 flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring", owner && "mt-3 h-11 rounded-[12px] border-[#DDE0D9] bg-[#F8F9F6] focus-within:ring-[#72CF35]")}>
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search {mode}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={disabled}
              placeholder={`Search ${mode}`}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>}

        {!redesign && mode === "services" && (
          <div
            className={cn(owner
              ? "flex min-w-0 max-w-full flex-wrap gap-1.5 border-b border-[#E7E9E4] py-2.5"
              : "flex min-w-0 max-w-full touch-pan-x gap-1 overflow-x-auto overscroll-x-contain border-b px-2 py-1.5")}
            onTouchStart={owner ? undefined : (event) => event.stopPropagation()}
            onTouchMove={owner ? undefined : (event) => event.stopPropagation()}
          >
            {["all", ...categories].map((itemCategory) => (
              <button
                key={itemCategory}
                type="button"
                onClick={() => setCategory(itemCategory)}
                aria-pressed={owner ? category === itemCategory : undefined}
                disabled={disabled}
                className={cn(
                  "h-8 shrink-0 cursor-pointer rounded-md px-3 text-[11px] font-medium capitalize transition-colors",
                  owner && "min-h-11 h-auto max-w-full shrink-0 whitespace-normal rounded-full px-3 py-1.5 text-xs leading-4 focus-visible:ring-2 focus-visible:ring-[#72CF35]",
                  category === itemCategory
                    ? owner ? "bg-[#20211F] text-white" : "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {itemCategory}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn("max-h-[320px] touch-pan-y overflow-y-auto overscroll-contain p-2 sm:max-h-[360px]", owner && "max-h-[min(45dvh,470px)] px-0 pb-0 pt-3 sm:max-h-[min(48dvh,520px)]")}
          role="listbox"
          tabIndex={redesign ? 0 : undefined}
          aria-multiselectable={owner ? true : undefined}
          aria-label={mode === "services" ? "Services" : "Packages"}
          onWheel={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <div className={cn("grid grid-cols-1 gap-1.5 sm:grid-cols-2", owner && "gap-2 sm:grid-cols-1")}>
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
                      redesign={redesign}
                      title={service.name}
                      category={service.category}
                      duration={service.duration}
                      price={discount?.finalPrice ?? service.price}
                      originalPrice={discount ? service.price : undefined}
                      selected={isSelected}
                      disabled={state.disabled}
                      locked={owner && disabled}
                      availability={state}
                      kind="service"
                      owner={owner}
                      onSelect={() => !disabled && (!state.disabled || isSelected) && toggleService(service)}
                    />
                  );
                })
              : visiblePackages.map((item) => {
                  const isSelected = selected.some(entry => entry.packageId === item.id);
                  const state = readPackageChoices(item.choices).length ? { disabled: readPackageChoices(item.choices).some(choice => !services.some(service => matchesServiceRule(choice.rule, service))), tone: "default" as const, label: "Choose included services" } : getAvailabilityState(
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
                      redesign={redesign}
                      title={item.name}
                      category={item.category}
                      detail={item.items.map((entry) => entry.service.name).join(", ")}
                      duration={item.duration}
                      price={discount?.finalPrice ?? item.price}
                      originalPrice={discount ? item.price : undefined}
                      selected={isSelected}
                      disabled={state.disabled}
                      locked={owner && disabled}
                      availability={state}
                      kind="package"
                      owner={owner}
                      onSelect={() => !disabled && (!state.disabled || isSelected) && togglePackage(item)}
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
    </>
  );

  if (owner) {
    if (redesign) return <section aria-label="Choose services or packages" className={`${designStyles.catalog} ${liveStyles.catalog}`}>{content}<p className={designStyles.catalogNote}><Clock3 size={13} aria-hidden="true" />Availability is checked for your selected date.</p></section>;
    return <section aria-label="Choose services or packages" className="min-w-0 w-full overflow-hidden rounded-[20px] border border-[#E7E9E4] bg-[#FAFBF8] p-3 sm:p-4">{content}</section>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label="Choose services or packages" aria-expanded={open} disabled={disabled} className="h-11 w-full justify-between rounded-lg border-border bg-background px-3 shadow-none hover:bg-muted/30">
          <span className="truncate font-medium">{selected.length ? `${selected.length} service${selected.length === 1 ? "" : "s"} selected` : "Choose services or packages"}</span>
          <span className="ml-2 flex shrink-0 items-center gap-2">{selected.length > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">{selected.length}</span>}<ChevronDown className="size-4 text-muted-foreground" /></span>
        </Button>
      </PopoverTrigger>
      <PopoverContent ref={panelRef} align="start" className={cn("pointer-events-auto w-(--radix-popover-trigger-width) overflow-hidden rounded-2xl border border-border bg-popover p-0 shadow-xl data-[state=open]:animate-none data-[state=closed]:animate-none", staffDialogTheme)}>
        {content}
      </PopoverContent>
    </Popover>
  );
}
