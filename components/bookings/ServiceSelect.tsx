import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  Package as PackageIcon,
  AlertCircle,
  Users,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

import {
  Service,
  ServicePackage,
  PackageItem,
} from "@/prisma/generated/prisma/client";
import { Control, useWatch } from "react-hook-form";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Badge } from "../ui/badge";

type PackageWithItems = ServicePackage & {
  items: (PackageItem & { service: Service })[];
};

import {
  getApplicableDiscount,
  type SaleEventForPricing,
} from "@/lib/utils/pricing";
import { checkCategoryAvailability } from "@/lib/server actions/availability";

type SelectedServiceItem = Service & {
  quantity?: number;
  packageId?: number;
  packageName?: string;
  originalPrice?: number;
  discount?: number;
  discountReason?: string | null;
};

type CategoryAvailability = {
  hasBusinessHours: boolean;
  businessHoursPassed: boolean;
  qualifiedEmployeeCount: number;
};

type FormLike = {
  control: unknown;
  setValue: (
    name: "services",
    value: SelectedServiceItem[],
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
  ) => void;
};

// N6 round 2: memoized service row. Keeping this as a sibling component
// (rather than inlining the JSX in the parent .map()) means React.memo's
// shallow compare can short-circuit re-renders for rows whose props
// didn't change. The big win is on toggle: previously useWatch would
// trigger a re-render of the whole ServiceSelect, which re-ran the JSX
// for all 50+ items including their badge logic and class merging. Now
// only the toggled row (and its previously-selected sibling) re-renders.
//
// All props are primitives or stable references so the shallow compare
// works without a custom comparator. `onToggle` must be stable in the
// parent (useCallback).
type ServiceRowProps = {
  service: Service;
  isSelected: boolean;
  isDisabled: boolean;
  isUnavailable: boolean;
  dataLoaded: boolean;
  noStaff: boolean;
  outsideHours: boolean;
  noBusinessHours: boolean;
  qualifiedEmployeeCount: number;
  hasSelectedDate: boolean;
  formattedPrice: string;
  discountFinalPrice: number | null;
  discountSlotsRemaining: number | null;
  onToggle: (service: Service) => void;
};

const ServiceRow = React.memo(function ServiceRow({
  service,
  isSelected,
  isDisabled,
  isUnavailable,
  dataLoaded,
  noStaff,
  outsideHours,
  noBusinessHours,
  qualifiedEmployeeCount,
  hasSelectedDate,
  formattedPrice,
  discountFinalPrice,
  discountSlotsRemaining,
  onToggle,
}: ServiceRowProps) {
  const handleSelect = React.useCallback(() => {
    if (!isDisabled) onToggle(service);
  }, [isDisabled, onToggle, service]);
  const showDiscount = discountFinalPrice !== null && !isUnavailable;
  return (
    <CommandItem
      value={service.name}
      onSelect={handleSelect}
      className={cn(
        "cursor-pointer aria-selected:bg-primary/5",
        isDisabled && "opacity-50 cursor-not-allowed",
      )}
      disabled={isDisabled}
    >
      <div className="flex items-start gap-3 w-full">
        <div
          className={cn(
            "flex items-center justify-center w-5 h-5 mt-0.5 rounded-md border-2 shrink-0 transition-all duration-150",
            isSelected
              ? "bg-primary border-primary text-primary-foreground shadow-sm"
              : "border-muted-foreground/30 bg-background",
          )}
        >
          <Check
            className={cn(
              "h-3.5 w-3.5 stroke-[3] text-white",
              isSelected ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
        <div className="flex flex-col flex-1 gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "font-medium",
                isUnavailable ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {service.name}
            </span>
            {showDiscount && (
              <Badge
                variant="secondary"
                className={cn(
                  "h-4 px-1 text-[10px] shadow-none",
                  discountSlotsRemaining !== null && discountSlotsRemaining <= 3
                    ? "bg-red-100 text-red-700 border-red-300 animate-pulse"
                    : discountSlotsRemaining !== null && discountSlotsRemaining <= 5
                      ? "bg-amber-100 text-amber-700 border-amber-300"
                      : "bg-destructive/10 text-destructive border-destructive/20",
                )}
              >
                {discountSlotsRemaining !== null
                  ? `${discountSlotsRemaining} ${discountSlotsRemaining === 1 ? "slot" : "slots"} left`
                  : "sale"}
              </Badge>
            )}
            {noStaff && (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40 shadow-none flex items-center gap-1"
              >
                <Users className="h-2.5 w-2.5" />
                No qualified staff
              </Badge>
            )}
            {!hasSelectedDate && dataLoaded && (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20 shadow-none"
              >
                Preview
              </Badge>
            )}
            {outsideHours && (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200 shadow-none flex items-center gap-1"
              >
                <Clock className="h-2.5 w-2.5" />
                Closed Now
              </Badge>
            )}
            {noBusinessHours && (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-gray-50 text-gray-700 border-gray-200 shadow-none flex items-center gap-1"
              >
                <AlertCircle className="h-2.5 w-2.5" />
                Closed
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground capitalize">
            {service.category}
            {qualifiedEmployeeCount > 0 &&
              !outsideHours &&
              !noBusinessHours && (
                <span className="ml-2 text-green-600">
                  - {qualifiedEmployeeCount} qualified staff
                </span>
              )}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {showDiscount && discountFinalPrice !== null ? (
            <>
              <span className="text-sm font-semibold text-destructive tabular-nums">
                ₱
                {discountFinalPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </span>
              <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                ₱{formattedPrice}
              </span>
            </>
          ) : (
            <span className="text-sm font-medium text-foreground/80 tabular-nums">
              ₱{formattedPrice}
            </span>
          )}
        </div>
      </div>
    </CommandItem>
  );
});


const ServiceSelect = React.memo(function ServiceSelect({
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
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [viewMode, setViewMode] = React.useState<"services" | "packages">(
    "services",
  );

  const selectedServices = useWatch({
    control: form.control as Control,
    name: "services",
    defaultValue: [],
  }) as SelectedServiceItem[];

  const serviceCategories = React.useMemo(() => {
    return Array.from(new Set(services.map((s) => s.category)));
  }, [services]);

  const normalizeId = React.useCallback((value: unknown) => {
    return String(value);
  }, []);

  const normalizePackageId = React.useCallback((value: unknown) => {
    return value === null || value === undefined || value === ""
      ? "none"
      : String(value);
  }, []);

  const selectedServiceKeys = React.useMemo(() => {
    const keySet = new Set<string>();
    selectedServices.forEach((service) => {
      keySet.add(
        `${normalizeId(service.id)}|${normalizePackageId(service.packageId)}`,
      );
    });
    return keySet;
  }, [selectedServices, normalizeId, normalizePackageId]);

  const filteredServices = React.useMemo(() => {
    return selectedCategory === "all"
      ? services
      : services.filter((s) => s.category === selectedCategory);
  }, [selectedCategory, services]);

  // N6 perf: pre-compute formatted price strings so the per-row render
  // doesn't re-run `.toLocaleString({ minimumFractionDigits: 2 })` for
  // every service on every parent re-render. With 50+ services and
  // useWatch triggering a full re-render on every toggle, this saved
  // hundreds of ms per click on slower devices. Map keyed by service id
  // so lookups stay O(1).
  const formattedServicePrices = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const s of services) {
      map.set(
        s.id,
        s.price.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      );
    }
    return map;
  }, [services]);

  const setSelectedServices = React.useCallback(
    (nextServices: SelectedServiceItem[]) => {
      form.setValue("services", nextServices, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
  );

  const { data: categoryAvailability } = useQuery({
    queryKey: [
      "categoryAvailability",
      businessSlug,
      serviceCategories,
      selectedDate?.toISOString(),
    ],
    queryFn: async () => {
      const results: Record<string, CategoryAvailability> = {};

      const availabilityPromises = serviceCategories.map(async (category) => {
        try {
          const availability = await checkCategoryAvailability({
            businessSlug,
            category,
            date: selectedDate,
          });
          return { category, availability };
        } catch (error) {
          console.error(`Error checking availability for ${category}:`, error);
          return {
            category,
            availability: {
              hasBusinessHours: true,
              businessHoursPassed: false,
              qualifiedEmployeeCount: 0,
            },
          };
        }
      });

      const resolvedAvailabilities = await Promise.all(availabilityPromises);
      resolvedAvailabilities.forEach(({ category, availability }) => {
        results[category] = availability;
      });

      return results;
    },
    enabled: !!businessSlug && serviceCategories.length > 0,
    staleTime: 30000,
  });

  // N6 round 3: keep refs to selectedServices and saleEvents so the
  // toggleService callback can be defined with [] dependencies. Without
  // this, useCallback's deps include selectedServices (which changes on
  // every toggle), so toggleService gets a fresh identity on every
  // click. That fresh identity flows down to <ServiceRow>'s `onToggle`
  // prop, which makes React.memo's shallow compare return false for
  // every row — and the memo we added in round 2 silently no-ops. With
  // refs, the callback is stable for the lifetime of the component, the
  // memo's shallow compare actually skips unchanged rows, and a single
  // toggle re-renders only the toggled row + its previously-selected
  // sibling instead of all 50+ services.
  const selectedServicesRef = React.useRef(selectedServices);
  const saleEventsRef = React.useRef(saleEvents);
  React.useEffect(() => {
    selectedServicesRef.current = selectedServices;
    saleEventsRef.current = saleEvents;
  });

  const toggleService = React.useCallback(
    (service: Service) => {
      const current = selectedServicesRef.current;
      const events = saleEventsRef.current;
      const targetKey = `${normalizeId(service.id)}|none`;
      const isSelected = current.some(
        (s) =>
          `${normalizeId(s.id)}|${normalizePackageId(s.packageId)}` ===
          targetKey,
      );
      let newServices: SelectedServiceItem[];
      if (isSelected) {
        newServices = current.filter(
          (s) =>
            normalizeId(s.id) !== normalizeId(service.id) ||
            normalizePackageId(s.packageId) !== "none",
        );
      } else {
        const discountInfo = getApplicableDiscount(
          service.id,
          undefined,
          service.price,
          events,
        );
        newServices = [
          ...current,
          {
            ...service,
            quantity: 1,
            price: discountInfo ? discountInfo.finalPrice : service.price,
            originalPrice: service.price,
            discount: discountInfo ? discountInfo.discount : 0,
            discountReason: discountInfo ? discountInfo.reason : null,
          },
        ];
      }
      setSelectedServices(newServices);
    },
    [normalizeId, normalizePackageId, setSelectedServices],
  );

  const togglePackage = React.useCallback(
    (pkg: PackageWithItems) => {
      const packageServices = pkg.items;
      const isPackageSelected = packageServices.every((item) =>
        selectedServiceKeys.has(
          `${normalizeId(item.service.id)}|${normalizePackageId(pkg.id)}`,
        ),
      );

      let newServices = [...selectedServices];

      if (isPackageSelected) {
        newServices = newServices.filter(
          (s) => normalizePackageId(s.packageId) !== normalizePackageId(pkg.id),
        );
      } else {
        const pkgDiscountInfo = getApplicableDiscount(
          0,
          pkg.id,
          pkg.price,
          saleEvents,
        );

        const ratio = pkgDiscountInfo
          ? pkgDiscountInfo.finalPrice / pkg.price
          : 1;

        pkg.items.forEach((item) => {
          newServices.push({
            ...item.service,
            price: item.custom_price * ratio,
            originalPrice: item.service.price,
            quantity: 1,
            packageId: pkg.id,
            packageName: pkg.name,
            discount: pkgDiscountInfo
              ? item.custom_price - item.custom_price * ratio
              : 0,
            discountReason: pkgDiscountInfo ? pkgDiscountInfo.reason : null,
          });
        });
      }

      setSelectedServices(newServices);
    },
    [
      normalizeId,
      normalizePackageId,
      saleEvents,
      selectedServiceKeys,
      selectedServices,
      setSelectedServices,
    ],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-11 w-full justify-between rounded-xl"
        >
          {selectedServices.length > 0
            ? `${selectedServices.length} service${
                selectedServices.length > 1 ? "s" : ""
              } selected`
            : disabled
              ? "Select a date first..."
              : "Select services or packages..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) max-h-[70vh] overflow-hidden rounded-xl border p-0 pointer-events-auto"
        align="start"
      >
        <div className="flex p-2 gap-2 border-b">
          <Button
            size="sm"
            variant={viewMode === "services" ? "default" : "secondary"}
            onClick={() => setViewMode("services")}
            className="flex-1"
          >
            Services
          </Button>
          <Button
            size="sm"
            variant={viewMode === "packages" ? "default" : "secondary"}
            onClick={() => setViewMode("packages")}
            className="flex-1"
          >
            Packages
          </Button>
        </div>

        {viewMode === "services" && (
          <div
            className="flex gap-1 p-2 border-b overflow-x-auto"
            onTouchMove={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors cursor-pointer",
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-primary/[0.04] hover:text-foreground",
              )}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3.5 text-xs font-medium capitalize transition-colors cursor-pointer",
                  selectedCategory === category
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary/[0.04] hover:text-foreground",
                )}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        <Command>
          <CommandInput
            placeholder={
              viewMode === "services"
                ? "Search service..."
                : "Search package..."
            }
          />
          <div
            className="max-h-[320px] overflow-y-auto overscroll-contain sm:max-h-[360px]"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {viewMode === "services"
                  ? filteredServices.map((service) => {
                      const isSelected = selectedServiceKeys.has(
                        `${normalizeId(service.id)}|none`,
                      );
                      const discountInfo = getApplicableDiscount(
                        service.id,
                        undefined,
                        service.price,
                        saleEvents,
                      );
                      const availability =
                        categoryAvailability?.[service.category];
                      const dataLoaded = !!availability;
                      const noStaff =
                        dataLoaded &&
                        availability?.qualifiedEmployeeCount === 0;
                      const outsideHours =
                        dataLoaded &&
                        availability?.businessHoursPassed === true;
                      const noBusinessHours =
                        dataLoaded && availability?.hasBusinessHours === false;
                      const isClosedForSelectedDate =
                        !!selectedDate && outsideHours;
                      const isUnavailable =
                        noStaff || noBusinessHours || isClosedForSelectedDate;
                      const isDisabled =
                        !!selectedDate && isUnavailable && !isSelected;
                      const qualifiedEmployeeCount =
                        availability?.qualifiedEmployeeCount ?? 0;
                      return (
                        <ServiceRow
                          key={service.id}
                          service={service}
                          isSelected={isSelected}
                          isDisabled={isDisabled}
                          isUnavailable={isUnavailable}
                          dataLoaded={dataLoaded}
                          noStaff={noStaff}
                          outsideHours={outsideHours}
                          noBusinessHours={noBusinessHours}
                          qualifiedEmployeeCount={qualifiedEmployeeCount}
                          hasSelectedDate={!!selectedDate}
                          formattedPrice={
                            formattedServicePrices.get(service.id) ??
                            service.price.toFixed(2)
                          }
                          discountFinalPrice={discountInfo?.finalPrice ?? null}
                          discountSlotsRemaining={
                            discountInfo?.slotsRemaining ?? null
                          }
                          onToggle={toggleService}
                        />
                      );
                    })
                  : packages.map((pkg) => {
                      const availability = categoryAvailability?.[pkg.category];
                      const dataLoaded = !!availability;
                      const noStaff =
                        dataLoaded &&
                        availability?.qualifiedEmployeeCount === 0;
                      const outsideHours =
                        dataLoaded &&
                        availability?.businessHoursPassed === true;
                      const noBusinessHours =
                        dataLoaded && availability?.hasBusinessHours === false;
                      const isClosedForSelectedDate =
                        !!selectedDate && outsideHours;
                      const isSelected = pkg.items.every((item) =>
                        selectedServiceKeys.has(
                          `${normalizeId(item.service.id)}|${normalizePackageId(
                            pkg.id,
                          )}`,
                        ),
                      );
                      const isUnavailable =
                        noStaff || noBusinessHours || isClosedForSelectedDate;
                      const isDisabled =
                        !!selectedDate && isUnavailable && !isSelected;

                      const discountInfo = getApplicableDiscount(
                        0,
                        pkg.id,
                        pkg.price,
                        saleEvents,
                      );

                      return (
                        <CommandItem
                          key={pkg.id}
                          value={pkg.name}
                          onSelect={() => {
                            if (!isDisabled) {
                              togglePackage(pkg);
                            }
                          }}
                          className={cn(
                            "cursor-pointer aria-selected:bg-primary/5",
                            isDisabled && "opacity-50 cursor-not-allowed",
                          )}
                          disabled={isDisabled}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <div
                              className={cn(
                                "flex items-center justify-center w-5 h-5 mt-0.5 rounded-md border-2 shrink-0 transition-all duration-150",
                                isSelected
                                  ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                  : "border-muted-foreground/30 bg-background",
                              )}
                            >
                              <Check
                                className={cn(
                                  "h-3.5 w-3.5 stroke-[3] text-white",
                                  isSelected ? "opacity-100" : "opacity-0",
                                )}
                              />
                            </div>

                            <div className="flex flex-col flex-1 gap-1.5">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary">
                                  <PackageIcon className="h-3 w-3" />
                                </div>
                                <span className="font-semibold text-foreground">
                                  {pkg.name}
                                </span>
                                {discountInfo && (
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "h-4 px-1 text-[10px] shadow-none",
                                      discountInfo.slotsRemaining !== null && discountInfo.slotsRemaining <= 3
                                        ? "bg-red-100 text-red-700 border-red-300 animate-pulse"
                                        : discountInfo.slotsRemaining !== null && discountInfo.slotsRemaining <= 5
                                          ? "bg-amber-100 text-amber-700 border-amber-300"
                                          : "bg-destructive/10 text-destructive border-destructive/20",
                                    )}
                                  >
                                    {discountInfo.slotsRemaining !== null
                                      ? `${discountInfo.slotsRemaining} ${discountInfo.slotsRemaining === 1 ? "slot" : "slots"} left`
                                      : "sale"}
                                  </Badge>
                                )}
                                {noStaff && (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 px-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40 shadow-none flex items-center gap-1"
                                  >
                                    <Users className="h-2.5 w-2.5" />
                                    No qualified staff
                                  </Badge>
                                )}
                                {!selectedDate && dataLoaded && (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20 shadow-none"
                                  >
                                    Preview
                                  </Badge>
                                )}
                                {outsideHours && (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 px-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200 shadow-none flex items-center gap-1"
                                  >
                                    <Clock className="h-2.5 w-2.5" />
                                    Closed Now
                                  </Badge>
                                )}
                                {noBusinessHours && (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 px-1.5 text-[10px] bg-gray-50 text-gray-700 border-gray-200 shadow-none flex items-center gap-1"
                                  >
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    Closed
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {pkg.items.slice(0, 3).map((item) => (
                                  <span
                                    key={item.service_id}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground border border-border"
                                  >
                                    {item.service.name}
                                  </span>
                                ))}
                                {pkg.items.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground self-center">
                                    +{pkg.items.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-0.5">
                              {discountInfo ? (
                                <>
                                  <span className="text-sm font-semibold text-destructive tabular-nums">
                                    ₱
                                    {discountInfo.finalPrice.toLocaleString(
                                      undefined,
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                                    ₱
                                    {pkg.price.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm font-medium text-foreground/80 tabular-nums">
                                  ₱
                                  {pkg.price.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              )}
                              {(() => {
                                if (discountInfo) return null;
                                const original = pkg.items.reduce(
                                  (sum, item) => sum + item.service.price,
                                  0,
                                );
                                if (original > pkg.price) {
                                  return (
                                    <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1 rounded-sm">
                                      Save ₱
                                      {(original - pkg.price).toLocaleString()}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
              </CommandGroup>
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

export default ServiceSelect;
