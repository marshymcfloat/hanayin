"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { Search, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CustomerSearchInput from "@/components/bookings/CustomerSearchInput";
import { cn } from "@/lib/utils";

export type GiftCardFormValues = {
  code: string;
  customer_name: string;
  customer_email: string;
  expires_at: Date;
  service_ids: number[];
  package_ids: number[];
};

export type GiftCardOption = {
  id: number;
  name: string;
  category: string;
};

type GiftCardInitialData = {
  code: string;
  customer_name: string;
  customer_email: string;
  expires_at: Date;
  included_services: { service: { id: number; name: string } }[];
  included_packages: { package: { id: number; name: string } }[];
};

interface GiftCardFormProps {
  businessSlug: string;
  initials: string;
  services: GiftCardOption[];
  packages: GiftCardOption[];
  isSubmitting: boolean;
  isGeneratingCode: boolean;
  submitLabel: string;
  initialData?: GiftCardInitialData;
  onGenerateCode: () => Promise<string | null>;
  onSubmit: (values: GiftCardFormValues) => Promise<void>;
}

function getSuffix(code: string, initials: string) {
  const normalizedCode = code.trim().toUpperCase();
  const prefix = `${initials.toUpperCase()}-`;

  if (normalizedCode.startsWith(prefix)) {
    return normalizedCode.slice(prefix.length);
  }

  const parts = normalizedCode.split("-");
  return parts[parts.length - 1] || "";
}

function toDateInputValue(date: Date) {
  return format(new Date(date), "yyyy-MM-dd");
}

function maskEmail(email: string) {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;

  const maskedUser =
    user.length > 2
      ? `${user.substring(0, 2)}***${user.substring(user.length - 1)}`
      : `${user}***`;
  return `${maskedUser}@${domain}`;
}

function parseDateInput(value: string) {
  if (!value) return null;

  const date = new Date(`${value}T23:59:59`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function toggleId(values: number[], id: number) {
  return values.includes(id)
    ? values.filter((itemId) => itemId !== id)
    : [...values, id];
}

type SelectorTab = "services" | "packages";

function filterGiftCardOptions(options: GiftCardOption[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return options;

  return options.filter(
    (option) =>
      option.name.toLowerCase().includes(query) ||
      option.category.toLowerCase().includes(query),
  );
}

interface GiftCardSelectableRowProps {
  idPrefix: "service" | "package";
  option: GiftCardOption;
  checked: boolean;
  onToggle: (id: number) => void;
}

const GiftCardSelectableRow = memo(function GiftCardSelectableRow({
  idPrefix,
  option,
  checked,
  onToggle,
}: GiftCardSelectableRowProps) {
  const inputId = `gift-${idPrefix}-${option.id}`;

  const handleToggle = useCallback(() => {
    onToggle(option.id);
  }, [onToggle, option.id]);

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors",
        checked
          ? "border-primary/30 bg-primary/5"
          : "border-border hover:bg-accent/30",
      )}
    >
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={handleToggle}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {option.name}
        </p>
        <Badge
          variant="outline"
          className="mt-1 h-5 border-border px-1.5 text-[10px] font-normal text-muted-foreground"
        >
          {option.category}
        </Badge>
      </div>
    </label>
  );
});

GiftCardSelectableRow.displayName = "GiftCardSelectableRow";

interface GiftCardSelectorTabContentProps {
  tab: SelectorTab;
  options: GiftCardOption[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
}

const GiftCardSelectorTabContent = memo(function GiftCardSelectorTabContent({
  tab,
  options,
  searchValue,
  onSearchChange,
  selectedIds,
  onToggle,
}: GiftCardSelectorTabContentProps) {
  const optionType = tab === "services" ? "service" : "package";

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={`Search ${tab}`}
          className="h-8 rounded-lg pl-8 text-xs"
        />
      </div>
      <div className="max-h-[19rem] space-y-2 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">No {tab} found.</p>
        ) : (
          options.map((option) => (
            <GiftCardSelectableRow
              key={`${tab}-${option.id}`}
              idPrefix={optionType}
              option={option}
              checked={selectedIds.has(option.id)}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
    </div>
  );
});

GiftCardSelectorTabContent.displayName = "GiftCardSelectorTabContent";

interface GiftCardSelectorCardProps {
  services: GiftCardOption[];
  packages: GiftCardOption[];
  selectedServiceIds: number[];
  selectedPackageIds: number[];
  onToggleService: (id: number) => void;
  onTogglePackage: (id: number) => void;
}

const GiftCardSelectorCard = memo(function GiftCardSelectorCard({
  services,
  packages,
  selectedServiceIds,
  selectedPackageIds,
  onToggleService,
  onTogglePackage,
}: GiftCardSelectorCardProps) {
  const [activeTab, setActiveTab] = useState<SelectorTab>("services");
  const [serviceSearch, setServiceSearch] = useState("");
  const [packageSearch, setPackageSearch] = useState("");

  const filteredServices = useMemo(
    () => filterGiftCardOptions(services, serviceSearch),
    [services, serviceSearch],
  );
  const filteredPackages = useMemo(
    () => filterGiftCardOptions(packages, packageSearch),
    [packages, packageSearch],
  );

  const selectedServiceSet = useMemo(
    () => new Set(selectedServiceIds),
    [selectedServiceIds],
  );
  const selectedPackageSet = useMemo(
    () => new Set(selectedPackageIds),
    [selectedPackageIds],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-3 text-sm font-semibold text-foreground">Select Items</p>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SelectorTab)}
      >
        <TabsList className="grid w-full grid-cols-2 rounded-lg bg-muted p-1">
          <TabsTrigger value="services" className="text-xs font-semibold">
            Services ({selectedServiceIds.length})
          </TabsTrigger>
          <TabsTrigger value="packages" className="text-xs font-semibold">
            Packages ({selectedPackageIds.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="pt-3">
          <GiftCardSelectorTabContent
            tab="services"
            options={filteredServices}
            searchValue={serviceSearch}
            onSearchChange={setServiceSearch}
            selectedIds={selectedServiceSet}
            onToggle={onToggleService}
          />
        </TabsContent>

        <TabsContent value="packages" className="pt-3">
          <GiftCardSelectorTabContent
            tab="packages"
            options={filteredPackages}
            searchValue={packageSearch}
            onSearchChange={setPackageSearch}
            selectedIds={selectedPackageSet}
            onToggle={onTogglePackage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
});

GiftCardSelectorCard.displayName = "GiftCardSelectorCard";

export function GiftCardForm({
  businessSlug,
  initials,
  services,
  packages,
  isSubmitting,
  isGeneratingCode,
  submitLabel,
  initialData,
  onGenerateCode,
  onSubmit,
}: GiftCardFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [suffix, setSuffix] = useState(
    initialData ? getSuffix(initialData.code, initials) : "",
  );
  const [customerName, setCustomerName] = useState(
    initialData?.customer_name || "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    initialData?.customer_email || "",
  );
  const [expiresAt, setExpiresAt] = useState(
    initialData ? toDateInputValue(initialData.expires_at) : "",
  );

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>(
    initialData?.included_services.map((item) => item.service.id) || [],
  );
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>(
    initialData?.included_packages.map((item) => item.package.id) || [],
  );
  const [existingCustomerEmail, setExistingCustomerEmail] = useState<
    string | null
  >(null);

  const handleToggleService = useCallback((serviceId: number) => {
    setSelectedServiceIds((prev) => toggleId(prev, serviceId));
  }, []);

  const handleTogglePackage = useCallback((packageId: number) => {
    setSelectedPackageIds((prev) => toggleId(prev, packageId));
  }, []);

  const customerSearchForm = useMemo(
    () => ({
      setValue: (
        name: "customerId" | "customerName" | "email" | "phone",
        value: string,
      ) => {
        if (name === "customerId") {
          setCustomerId(value);
          return;
        }

        if (name === "customerName") {
          setCustomerName(value);
          return;
        }

        if (name === "phone") {
          return;
        }

        setCustomerEmail(value);
      },
    }),
    [],
  );

  const handleCustomerSelect = useCallback(
    (customer: { id: string; name: string; email?: string | null } | null) => {
      if (!customer) {
        setCustomerId("");
        setExistingCustomerEmail(null);
        return;
      }

      setCustomerId(customer.id);
      if (customer.email) {
        setExistingCustomerEmail(customer.email);
        setCustomerEmail(customer.email);
      } else {
        setExistingCustomerEmail(null);
      }
    },
    [],
  );

  const handleGenerateCode = async () => {
    const generated = await onGenerateCode();
    if (!generated) return;

    setSuffix(getSuffix(generated, initials));
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedSuffix = suffix.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(normalizedSuffix)) {
      toast.error("Gift card code suffix must be exactly 5 letters/numbers");
      return;
    }

    const email = customerEmail.trim().toLowerCase();
    if (!customerName.trim() || !email) {
      toast.error("Customer name and email are required");
      return;
    }

    const parsedDate = parseDateInput(expiresAt);
    if (!parsedDate) {
      toast.error("Expiry date is required");
      return;
    }

    if (selectedServiceIds.length === 0 && selectedPackageIds.length === 0) {
      toast.error("Select at least one service or package");
      return;
    }

    await onSubmit({
      code: `${initials.toUpperCase()}-${normalizedSuffix}`,
      customer_name: customerName.trim(),
      customer_email: email,
      expires_at: parsedDate,
      service_ids: selectedServiceIds,
      package_ids: selectedPackageIds,
    });
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gift-card-code">Gift Card Code</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  {initials.toUpperCase()}-
                </div>
                <Input
                  id="gift-card-code"
                  value={suffix}
                  onChange={(event) =>
                    setSuffix(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 5),
                    )
                  }
                  placeholder="A1B2C"
                  className="h-10 rounded-xl"
                  style={{ paddingLeft: `${initials.length + 3}ch` }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl border-dashed"
                onClick={handleGenerateCode}
                disabled={isGeneratingCode}
                aria-label="Generate code"
              >
                {isGeneratingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Format: <strong>{initials.toUpperCase()}-XXXXX</strong>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Customer Name</Label>
            <CustomerSearchInput
              form={customerSearchForm}
              businessSlug={businessSlug}
              value={customerName}
              onChange={setCustomerName}
              onCustomerSelect={handleCustomerSelect}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gift-card-customer-email">Customer Email</Label>
            {existingCustomerEmail && customerId ? (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                This customer already has an email linked (
                <span className="font-mono">
                  {maskEmail(existingCustomerEmail)}
                </span>
                ).
                <br />
                <span className="text-xs opacity-80">
                  To change it, update their profile separately.
                </span>
              </div>
            ) : (
              <Input
                id="gift-card-customer-email"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="name@example.com"
                className="h-10 rounded-xl"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gift-card-expires-at">Expiry Date</Label>
            <Input
              id="gift-card-expires-at"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              min={toDateInputValue(new Date())}
              className="h-10 rounded-xl"
            />
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground">Included Services</span>
              <span className="font-semibold text-foreground">
                {selectedServiceIds.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Included Packages</span>
              <span className="font-semibold text-foreground">
                {selectedPackageIds.length}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <GiftCardSelectorCard
            services={services}
            packages={packages}
            selectedServiceIds={selectedServiceIds}
            selectedPackageIds={selectedPackageIds}
            onToggleService={handleToggleService}
            onTogglePackage={handleTogglePackage}
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 cursor-pointer"
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
