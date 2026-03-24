"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarClock, Loader2, Megaphone, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import {
  generateGrowthCampaignAction,
  getTodayGrowthOpportunitiesAction,
  refreshGrowthContextAction,
  refreshGrowthOpportunitiesAction,
} from "@/lib/server actions/growth";
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
import {
  buildGrowthFlowQuery,
  type GrowthFlowContext,
} from "../growth/types";

type ServiceOption = { id: number; name: string; category: string };

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
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  const [generatedDraft, setGeneratedDraft] = useState<{
    saleEventId: number | null;
    socialPostId: string;
  } | null>(null);

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

    const result = await generateGrowthCampaignAction({
      businessSlug: props.businessSlug,
      opportunityId: opportunity.id,
      selectedServiceIds,
      selectedPackageIds,
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
      <article className="rounded-[24px] border border-zinc-100 bg-white p-4 sm:p-5">
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
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
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
          <p className="mt-3 text-sm font-medium text-zinc-900">{opportunity.reason}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {opportunity.type.replaceAll("_", " ")} | Score{" "}
            {(opportunity.score * 100).toFixed(0)}% | Confidence{" "}
            {(opportunity.confidence * 100).toFixed(0)}%
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Window: {formatDateTime(opportunity.timeWindowStart)} to{" "}
            {formatDateTime(opportunity.timeWindowEnd)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Suggested offer:{" "}
            {opportunity.recommendedOfferTypes.join(", ").replaceAll("_", " ")}
          </p>

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
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="h-8 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {isGenerating ? "Generating Draft..." : "Create Draft Event + Post"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Create Draft Event + Post</DialogTitle>
                    <DialogDescription>
                      Select service/package scope, then create a draft campaign.
                      Leave both tabs unselected to auto-pick best-fit services.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-700">
                    <p className="font-semibold text-zinc-900">What will happen</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>A draft sale event is created.</li>
                      <li>A social post draft is created.</li>
                      <li>Nothing is published automatically.</li>
                    </ul>
                  </div>

                  <Tabs defaultValue="services" className="rounded-md border p-3">
                    <TabsList className="grid h-10 w-full grid-cols-2">
                      <TabsTrigger value="services">
                        Services ({selectedServiceIds.length})
                      </TabsTrigger>
                      <TabsTrigger value="packages">
                        Packages ({selectedPackageIds.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="services" className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
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

                      {servicesByCategory.length === 0 ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-zinc-500">
                          No services available yet.
                        </p>
                      ) : (
                        servicesByCategory.map(({ category, services }) => {
                          const categoryServiceIds = services.map((service) => service.id);
                          const categoryAllSelected = isAllSelected(
                            selectedServiceIds,
                            categoryServiceIds,
                          );
                          const categoryPartiallySelected =
                            !categoryAllSelected &&
                            isPartiallySelected(selectedServiceIds, categoryServiceIds);

                          return (
                            <div key={category} className="rounded-md border p-3">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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

                              <div className="grid gap-2 sm:grid-cols-2">
                                {services.map((service) => (
                                  <label
                                    key={service.id}
                                    className="flex min-h-10 items-center gap-2 text-sm text-zinc-700"
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
                            </div>
                          );
                        })
                      )}
                    </TabsContent>

                    <TabsContent value="packages" className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
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

                      {props.packages.length === 0 ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-zinc-500">
                          No packages available yet.
                        </p>
                      ) : (
                        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                          {props.packages.map((pkg) => (
                            <label
                              key={pkg.id}
                              className="flex min-h-10 items-center gap-2 text-sm text-zinc-700"
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

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={isGenerating}
                      onClick={() => {
                        void generateDraft();
                      }}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Create Draft Event + Post
                    </Button>
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
