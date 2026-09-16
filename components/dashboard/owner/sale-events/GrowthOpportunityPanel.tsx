"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Loader2, Megaphone, RefreshCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  generateGrowthCampaignAction,
  getTodayGrowthOpportunitiesAction,
  refreshGrowthContextAction,
  refreshGrowthOpportunitiesAction,
} from "@/features/growth/actions/growth";
import type { OpportunityView } from "@/lib/services/growth/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildGrowthFlowQuery,
  type GrowthFlowContext,
} from "../growth/types";
import { recommendCampaignStyling } from "@/lib/services/growth/styling-recommender";
import {
  SOCIAL_IMAGE_PROFILE_OPTIONS,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";
import type { CaptionTone } from "@/features/growth/schemas";
import type { OpportunityTypeLiteral } from "@/lib/services/growth/types";

type ServiceOption = { id: number; name: string; category: string };

const CAPTION_TONE_OPTIONS: Array<{
  value: CaptionTone;
  label: string;
  hint: string;
}> = [
  {
    value: "AUTO",
    label: "Recommended (auto)",
    hint: "Let the engine pick the voice based on this opportunity.",
  },
  {
    value: "FRIENDLY_TAGLISH",
    label: "Friendly Taglish",
    hint: "Warm, conversational, like texting a friend who hypes you up.",
  },
  {
    value: "PREMIUM_LUXURY",
    label: "Premium / luxury",
    hint: "Refined and editorial. Restraint over hype. No emoji.",
  },
  {
    value: "WITTY_PLAYFUL",
    label: "Witty / playful",
    hint: "Cheeky one-liners, observational humor. Stay tasteful.",
  },
  {
    value: "WARM_NURTURING",
    label: "Warm / nurturing",
    hint: "Gentle, no pressure — focus on rest and recovery.",
  },
  {
    value: "DIRECT_URGENT",
    label: "Direct / urgent",
    hint: "Confident, present-tense, every line moves toward booking.",
  },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toManilaDateTimeInput(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

export function GrowthOpportunityPanel(props: {
  businessSlug: string;
  initialOpportunity: OpportunityView | null;
  services: ServiceOption[];
  packages: { id: number; name: string }[];
  flowContext?: GrowthFlowContext;
  growthAiEnabled: boolean;
  socialEnabled: boolean;
}) {
  const [opportunity, setOpportunity] = useState<OpportunityView | null>(
    props.initialOpportunity,
  );
  const [showSchedule, setShowSchedule] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftStep, setDraftStep] = useState<1 | 2>(1);
  const [scopeSearch, setScopeSearch] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  const [generatedDraft, setGeneratedDraft] = useState<{
    saleEventId: number | null;
    socialPostId: string;
  } | null>(null);

  const [customDiscount, setCustomDiscount] = useState("15");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [customSlotLimit, setCustomSlotLimit] = useState("");

  // Voice & visuals overrides — engine recommendations as defaults.
  const [captionTone, setCaptionTone] = useState<CaptionTone>("AUTO");
  const [imageProfile, setImageProfile] = useState<SocialImageProfile | "AUTO">(
    "AUTO",
  );
  const [ownerCaptionDirection, setOwnerCaptionDirection] = useState("");
  const [ownerImageDirection, setOwnerImageDirection] = useState("");

  // Compute the recommendation from the currently selected opportunity +
  // services so the dialog can show "Recommended" hints next to the auto
  // choices and pre-fill the underlying selections accordingly.
  const stylingRecommendation = useMemo(() => {
    if (!opportunity) return null;
    const selectedServices = props.services.filter((s) =>
      selectedServiceIds.includes(s.id),
    );
    return recommendCampaignStyling({
      opportunityType: opportunity.type as OpportunityTypeLiteral,
      serviceCategories: selectedServices.map((s) => s.category),
      serviceNames: selectedServices.map((s) => s.name),
    });
  }, [opportunity, selectedServiceIds, props.services]);

  useEffect(() => {
    if (dialogOpen && opportunity) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomStartDate(toManilaDateTimeInput(opportunity.timeWindowStart));
      setCustomEndDate(toManilaDateTimeInput(opportunity.timeWindowEnd));
    }
  }, [dialogOpen, opportunity]);

  const servicesByCategory = useMemo(() => {
    const grouped = props.services.reduce(
      (acc, service) => {
        const key = service.category.trim() || "Uncategorized";
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(service);
        return acc;
      },
      {} as Record<string, ServiceOption[]>,
    );
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, services]) => ({
        category,
        services: [...services].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [props.services]);

  const filteredServicesByCategory = useMemo(() => {
    const query = scopeSearch.trim().toLowerCase();
    if (!query) return servicesByCategory;
    return servicesByCategory
      .map((group) => ({
        ...group,
        services: group.services.filter((service) =>
          `${service.name} ${group.category}`.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.services.length > 0);
  }, [scopeSearch, servicesByCategory]);

  const filteredPackages = useMemo(() => {
    const query = scopeSearch.trim().toLowerCase();
    return query
      ? props.packages.filter((pkg) => pkg.name.toLowerCase().includes(query))
      : props.packages;
  }, [scopeSearch, props.packages]);

  const selectedScopeCount = selectedServiceIds.length + selectedPackageIds.length;
  const allServiceIds = useMemo(
    () => props.services.map((service) => service.id),
    [props.services],
  );
  const allPackageIds = useMemo(
    () => props.packages.map((pkg) => pkg.id),
    [props.packages],
  );

  const capacitySummary = useMemo(() => {
    if (!opportunity?.metadata) return null;
    const openSlots =
      typeof opportunity.metadata.openSlots === "number"
        ? opportunity.metadata.openSlots
        : null;
    const capacity =
      typeof opportunity.metadata.estimatedCapacitySlots === "number"
        ? opportunity.metadata.estimatedCapacitySlots
        : null;
    if (openSlots === null || capacity === null) return null;
    return { openSlots, capacity };
  }, [opportunity]);

  const refresh = () => {
    startRefresh(async () => {
      const context = await refreshGrowthContextAction(props.businessSlug);
      if (!context.success) {
        toast.error(context.error || "Failed to refresh context.");
        return;
      }
      const opportunities = await refreshGrowthOpportunitiesAction(props.businessSlug);
      if (!opportunities.success) {
        toast.error(opportunities.error || "Failed to refresh opportunities.");
        return;
      }
      const today = await getTodayGrowthOpportunitiesAction(props.businessSlug);
      if (!today.success) {
        toast.error(today.error || "Failed to load opportunities.");
        return;
      }
      setOpportunity(today.data[0] || null);
      toast.success("Growth opportunity refreshed.");
    });
  };

  const toggleNumber = (
    key: "service" | "package",
    value: number,
    checked: boolean,
  ) => {
    if (key === "service") {
      setSelectedServiceIds((previous) =>
        checked
          ? Array.from(new Set([...previous, value]))
          : previous.filter((item) => item !== value),
      );
      return;
    }
    setSelectedPackageIds((previous) =>
      checked
        ? Array.from(new Set([...previous, value]))
        : previous.filter((item) => item !== value),
    );
  };

  const setManyNumbers = (
    key: "service" | "package",
    values: number[],
    checked: boolean,
  ) => {
    if (key === "service") {
      setSelectedServiceIds((previous) => {
        const updated = new Set(previous);
        values.forEach((value) => {
          if (checked) {
            updated.add(value);
          } else {
            updated.delete(value);
          }
        });
        return Array.from(updated);
      });
      return;
    }

    setSelectedPackageIds((previous) => {
      const updated = new Set(previous);
      values.forEach((value) => {
        if (checked) {
          updated.add(value);
        } else {
          updated.delete(value);
        }
      });
      return Array.from(updated);
    });
  };

  const isAllSelected = (selectedIds: number[], ids: number[]) =>
    ids.length > 0 && ids.every((id) => selectedIds.includes(id));

  const isPartiallySelected = (selectedIds: number[], ids: number[]) =>
    ids.some((id) => selectedIds.includes(id));

  const servicesAllSelected = isAllSelected(selectedServiceIds, allServiceIds);
  const servicesPartiallySelected =
    !servicesAllSelected &&
    isPartiallySelected(selectedServiceIds, allServiceIds);
  const packagesAllSelected = isAllSelected(selectedPackageIds, allPackageIds);
  const packagesPartiallySelected =
    !packagesAllSelected &&
    isPartiallySelected(selectedPackageIds, allPackageIds);

  const generateDraft = async () => {
    if (!props.growthAiEnabled) {
      toast.error("AI draft generation is available on Pro.");
      return;
    }

    if (!opportunity || isGenerating) return;

    const generatingToastId = toast.loading("Generating draft event and post...", {
      description: "You can keep browsing while we prepare it.",
    });
    setDialogOpen(false);
    setIsGenerating(true);

    const discountNum = parseFloat(customDiscount);
    const slotNum = customSlotLimit.trim() ? parseInt(customSlotLimit, 10) : undefined;

    const result = await generateGrowthCampaignAction({
      businessSlug: props.businessSlug,
      opportunityId: opportunity.id,
      selectedServiceIds,
      selectedPackageIds,
      overrides: {
        discountPercent:
          Number.isFinite(discountNum) && discountNum >= 1 ? discountNum : undefined,
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
        slotLimit: slotNum && slotNum >= 1 ? slotNum : undefined,
      },
      styling: {
        captionTone,
        imageProfile: imageProfile === "AUTO" ? undefined : imageProfile,
        ownerCaptionDirection: ownerCaptionDirection.trim() || undefined,
        ownerImageDirection: ownerImageDirection.trim() || undefined,
      },
    });

    setIsGenerating(false);

    if (!result.success || !result.data) {
      toast.error(result.error || "Failed to generate growth draft.", {
        id: generatingToastId,
      });
      return;
    }

    setGeneratedDraft({
      saleEventId: result.data.saleEventId,
      socialPostId: result.data.socialPostId,
    });
    toast.success("Draft event and post are ready for review.", {
      id: generatingToastId,
    });
  };

  const step3Href = generatedDraft && props.socialEnabled
    ? `/app/${props.businessSlug}/social-posts?${buildGrowthFlowQuery({
        step: 3,
        source: "sale-events",
        opportunityId: props.flowContext?.opportunityId || opportunity?.id,
        saleEventId: generatedDraft.saleEventId ?? undefined,
        socialPostId: generatedDraft.socialPostId,
      })}`
    : null;

  return (
    <>
      <article className="rounded-2xl bg-muted/30 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-zinc-900">
            Today&apos;s Growth Opportunity
          </h3>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCcw className="size-3" />
          )}
          Refresh
        </button>
      </div>

      {!opportunity ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
          No growth opportunity detected yet for today.
        </div>
      ) : (
        <>
          <p className="mt-4 max-w-3xl text-base font-semibold leading-6 text-foreground">{opportunity.reason}</p>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-background px-3 py-2.5"><dt className="text-[11px] font-medium text-muted-foreground">Opportunity</dt><dd className="mt-1 text-sm font-semibold capitalize text-foreground">{opportunity.type.replaceAll("_", " ").toLowerCase()}</dd></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2.5"><dt className="text-[11px] font-medium text-muted-foreground">Confidence</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{(opportunity.confidence * 100).toFixed(0)}%</dd></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2.5"><dt className="text-[11px] font-medium text-muted-foreground">Suggested offer</dt><dd className="mt-1 text-sm font-semibold capitalize text-foreground">{opportunity.recommendedOfferTypes.join(", ").replaceAll("_", " ").toLowerCase()}</dd></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2.5"><dt className="text-[11px] font-medium text-muted-foreground">Best window</dt><dd className="mt-1 text-xs font-semibold leading-5 text-foreground">{formatDateTime(opportunity.timeWindowStart)} – {formatDateTime(opportunity.timeWindowEnd)}</dd></div>
          </dl>

          {capacitySummary ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
              <p className="text-xs font-semibold text-emerald-800">
                Capacity check: {capacitySummary.openSlots} open slots out of{" "}
                {capacitySummary.capacity}
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {props.growthAiEnabled ? (
              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) {
                    setDraftStep(1);
                    setScopeSearch("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary/90"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {isGenerating ? "Generating Draft..." : "Create Draft Event + Post"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-4xl sm:rounded-[28px] sm:border">
                  <DialogHeader className="shrink-0 border-b border-border bg-background px-5 pb-4 pt-5 pr-14 sm:px-7 sm:pb-5 sm:pt-6">
                    <div className="mb-4 flex items-center gap-2" aria-label={`Step ${draftStep} of 2`}>
                      {[1, 2].map((step) => (
                        <div key={step} className="flex flex-1 items-center gap-2">
                          <span className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${draftStep >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {draftStep > step ? <Check className="size-3.5" /> : step}
                          </span>
                          <span className={`hidden text-xs font-medium sm:inline ${draftStep >= step ? "text-foreground" : "text-muted-foreground"}`}>
                            {step === 1 ? "Choose scope" : "Campaign details"}
                          </span>
                          {step === 1 ? <span className="h-px flex-1 bg-border" /> : null}
                        </div>
                      ))}
                    </div>
                    <DialogTitle className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {draftStep === 1 ? "What should this campaign promote?" : "Shape your draft campaign"}
                    </DialogTitle>
                    <DialogDescription className="mt-1 max-w-2xl text-sm leading-6">
                      {draftStep === 1
                        ? "Choose services or packages, or let AI select the best fit for this opportunity."
                        : "Confirm the offer and choose a creative style."}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-3 sm:px-7 sm:py-4">
                  {draftStep === 1 ? (
                  <div className="mx-auto max-w-4xl space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedServiceIds([]);
                        setSelectedPackageIds([]);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3 border-b px-1 py-3 text-left transition-colors duration-200 ${selectedScopeCount === 0 ? "border-primary text-foreground" : "border-border hover:bg-muted/30"}`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-semibold text-foreground">AI chooses the best fit {selectedScopeCount === 0 ? <Check className="size-4 text-primary" /> : null}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Recommended — matches this opportunity with the most relevant services.</span>
                      </span>
                    </button>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={scopeSearch}
                        onChange={(event) => setScopeSearch(event.target.value)}
                        placeholder="Search services or packages"
                        aria-label="Search services or packages"
                        className="h-10 rounded-lg border-border bg-background pl-10 shadow-none"
                      />
                    </div>

                  <Tabs defaultValue="services" className="w-full">
                    <TabsList className="grid h-10 w-full grid-cols-2 rounded-none border-b border-border bg-transparent p-0">
                      <TabsTrigger value="services" className="h-10 rounded-none border-b-2 border-transparent bg-transparent shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                        Services <span className="ml-1 tabular-nums text-muted-foreground">{selectedServiceIds.length}</span>
                      </TabsTrigger>
                      <TabsTrigger value="packages" className="h-10 rounded-none border-b-2 border-transparent bg-transparent shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                        Packages <span className="ml-1 tabular-nums text-muted-foreground">{selectedPackageIds.length}</span>
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="services" className="mt-0">
                      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-1">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={
                              servicesAllSelected
                                ? true
                                : servicesPartiallySelected
                                  ? "indeterminate"
                                  : false
                            }
                            disabled={allServiceIds.length === 0}
                            onCheckedChange={(checked) =>
                              setManyNumbers("service", allServiceIds, checked === true)
                            }
                          />
                          Select all services
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedServiceIds([])}
                          disabled={selectedServiceIds.length === 0}
                        >
                          Clear
                        </Button>
                      </div>

                      {filteredServicesByCategory.length === 0 ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-zinc-500">
                          {scopeSearch ? "No services match your search." : "No services available yet."}
                        </p>
                      ) : (
                        filteredServicesByCategory.map(({ category, services }) => {
                          const categoryServiceIds = services.map((service) => service.id);
                          const categoryAllSelected = isAllSelected(
                            selectedServiceIds,
                            categoryServiceIds,
                          );
                          const categoryPartiallySelected =
                            !categoryAllSelected &&
                            isPartiallySelected(selectedServiceIds, categoryServiceIds);

                          return (
                            <section key={category} className="border-b border-border py-3 last:border-b-0">
                              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
                                <div>
                                  <p className="text-sm font-medium text-zinc-800">
                                    {category}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {categoryServiceIds.filter((id) =>
                                      selectedServiceIds.includes(id),
                                    ).length}
                                    /{categoryServiceIds.length} selected
                                  </p>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                                  <Checkbox
                                    checked={
                                      categoryAllSelected
                                        ? true
                                        : categoryPartiallySelected
                                          ? "indeterminate"
                                          : false
                                    }
                                    onCheckedChange={(checked) =>
                                      setManyNumbers(
                                        "service",
                                        categoryServiceIds,
                                        checked === true,
                                      )
                                    }
                                  />
                                  Select category
                                </label>
                              </div>

                              <div className="grid gap-x-5 sm:grid-cols-2">
                                {services.map((service) => (
                                  <label
                                    key={service.id}
                                    className="flex min-h-9 cursor-pointer items-center gap-2 px-1 text-sm text-foreground transition-colors hover:bg-muted/40"
                                  >
                                    <Checkbox
                                      checked={selectedServiceIds.includes(service.id)}
                                      onCheckedChange={(checked) =>
                                        toggleNumber("service", service.id, checked === true)
                                      }
                                    />
                                    {service.name}
                                  </label>
                                ))}
                              </div>
                            </section>
                          );
                        })
                      )}
                    </TabsContent>

                    <TabsContent value="packages" className="mt-0">
                      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-1">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={
                              packagesAllSelected
                                ? true
                                : packagesPartiallySelected
                                  ? "indeterminate"
                                  : false
                            }
                            disabled={allPackageIds.length === 0}
                            onCheckedChange={(checked) =>
                              setManyNumbers("package", allPackageIds, checked === true)
                            }
                          />
                          Select all packages
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedPackageIds([])}
                          disabled={selectedPackageIds.length === 0}
                        >
                          Clear
                        </Button>
                      </div>

                      {filteredPackages.length === 0 ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-zinc-500">
                          {scopeSearch ? "No packages match your search." : "No packages available yet."}
                        </p>
                      ) : (
                        <div className="grid gap-x-5 py-2 sm:grid-cols-2">
                          {filteredPackages.map((pkg) => (
                            <label
                              key={pkg.id}
                              className="flex min-h-9 cursor-pointer items-center gap-2 px-1 text-sm text-foreground transition-colors hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={selectedPackageIds.includes(pkg.id)}
                                onCheckedChange={(checked) =>
                                  toggleNumber("package", pkg.id, checked === true)
                                }
                              />
                              {pkg.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                  </div>
                  ) : (
                  <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-foreground">Offer &amp; timing</p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-700">
                          Discount %
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={80}
                          value={customDiscount}
                          onChange={(e) => setCustomDiscount(e.target.value)}
                          placeholder="e.g. 15"
                          className="h-9 text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-700">
                          Slot Limit{" "}
                          <span className="font-normal text-zinc-400">(optional)</span>
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={customSlotLimit}
                          onChange={(e) => setCustomSlotLimit(e.target.value)}
                          placeholder="Leave empty for unlimited"
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-zinc-700">Sale Window</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-0.5">
                          <label className="text-[11px] text-zinc-500">Start</label>
                          <Input
                            type="datetime-local"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[11px] text-zinc-500">End</label>
                          <Input
                            type="datetime-local"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Voice & visuals — owner-overridable. Defaults come from
                        recommendCampaignStyling based on the opportunity type
                        and the dominant service category. */}
                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">
                           Creative style
                        </p>
                        {stylingRecommendation && (
                          <span
                            className="text-[11px] font-medium text-primary"
                            title={stylingRecommendation.rationale}
                          >
                            Recommended defaults applied
                          </span>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-zinc-700">
                            Caption voice
                          </label>
                          <Select
                            value={captionTone}
                            onValueChange={(value) =>
                              setCaptionTone(value as CaptionTone)
                            }
                          >
                            <SelectTrigger className="h-10 rounded-lg bg-background text-sm shadow-none">
                              <SelectValue>
                                {CAPTION_TONE_OPTIONS.find((option) => option.value === captionTone)?.label ?? "Recommended"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {CAPTION_TONE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-zinc-700">
                            Image style
                          </label>
                          <Select
                            value={imageProfile}
                            onValueChange={(value) =>
                              setImageProfile(value as SocialImageProfile | "AUTO")
                            }
                          >
                            <SelectTrigger className="h-10 rounded-lg bg-background text-sm shadow-none">
                              <SelectValue>
                                {imageProfile === "AUTO"
                                  ? "Recommended"
                                  : SOCIAL_IMAGE_PROFILE_OPTIONS.find((option) => option.value === imageProfile)?.label}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AUTO">Recommended</SelectItem>
                              {SOCIAL_IMAGE_PROFILE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <details className="group border-t border-border pt-3">
                        <summary className="w-fit cursor-pointer select-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                          Add creative direction <span className="font-normal">(optional)</span>
                        </summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground">Caption notes</label>
                            <Textarea
                              value={ownerCaptionDirection}
                              onChange={(e) => setOwnerCaptionDirection(e.target.value)}
                              placeholder="Tone, angle, or message to mention"
                              rows={2}
                              className="resize-none text-sm"
                              maxLength={400}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground">Image notes</label>
                            <Textarea
                              value={ownerImageDirection}
                              onChange={(e) => setOwnerImageDirection(e.target.value)}
                              placeholder="Subject, setting, or visual detail"
                              rows={2}
                              className="resize-none text-sm"
                              maxLength={400}
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                  <aside className="order-first border-b border-border pb-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                      <span><span className="text-muted-foreground">Scope:</span> <strong className="font-medium">{selectedScopeCount === 0 ? "AI best fit" : `${selectedServiceIds.length} services, ${selectedPackageIds.length} packages`}</strong></span>
                      <span><span className="text-muted-foreground">Offer:</span> <strong className="font-medium">{customDiscount || "—"}% off</strong></span>
                      <span><span className="text-muted-foreground">Slots:</span> <strong className="font-medium">{customSlotLimit || "Unlimited"}</strong></span>
                    </div>
                  </aside>
                  </div>
                  )}
                  </div>

                  <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t border-border bg-background px-4 py-4 sm:px-7">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDialogOpen(false)}
                      className="h-11 rounded-xl px-4"
                    >
                      Cancel
                    </Button>
                    <div className="ml-auto flex items-center gap-2">
                    {draftStep === 2 ? <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setDraftStep(1)}><ArrowLeft className="mr-2 size-4" />Back</Button> : null}
                    {draftStep === 1 ? <Button type="button" className="h-11 rounded-xl" onClick={() => setDraftStep(2)}>Continue<ArrowRight className="ml-2 size-4" /></Button> : <Button
                      type="button"
                      className="h-11 rounded-xl bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                      disabled={isGenerating}
                      onClick={() => {
                        void generateDraft();
                      }}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Create Draft Event + Post
                    </Button>}
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                AI draft generation is available on Pro.
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowSchedule((value) => !value)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              <CalendarClock className="size-3" />
              Best times
            </button>
          </div>

          {generatedDraft && step3Href ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
              <p className="text-xs font-semibold text-blue-900">
                Draft event and post created.
              </p>
              <p className="mt-1 text-xs text-blue-800">
                Continue to Step 3 to review content and publish when ready.
              </p>
              <Link
                href={step3Href}
                className="mt-2 inline-flex rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
              >
                Continue to Step 3: Review Social Post
              </Link>
            </div>
          ) : null}

          {showSchedule ? (
            <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              {opportunity.suggestedPostTimes.length === 0 ? (
                <p className="text-xs text-zinc-600">
                  No future timestamps available for this window.
                </p>
              ) : (
                opportunity.suggestedPostTimes.map((entry) => (
                  <p key={entry} className="text-xs text-zinc-700">
                    <CalendarClock className="mr-1 inline size-3 text-zinc-500" />
                    {formatDateTime(entry)}
                  </p>
                ))
              )}
            </div>
          ) : null}
        </>
      )}
      </article>

      {isGenerating ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50">
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-lg">
            <Loader2 className="mt-0.5 size-4 animate-spin text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-900">
                Creating draft event + post
              </p>
              <p className="text-[11px] text-zinc-600">
                You can keep working. We&apos;ll notify you when it&apos;s ready.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
