"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DiscountType,
  SocialPlatform,
} from "@/prisma/generated/prisma/enums";
import { createSaleEvent } from "@/lib/server actions/sale-event";
import { generateSocialCaptionAction } from "@/lib/server actions/social";
import { uploadImageAction } from "@/lib/server actions/upload";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  SOCIAL_IMAGE_PROFILES,
  SOCIAL_IMAGE_PROFILE_OPTIONS,
} from "@/lib/services/social/image-profiles";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FLAT]),
  discountValue: z.coerce.number<number>().min(0),
  slotLimit: z.coerce.number().int().min(1).optional(),
  serviceIds: z.array(z.number()),
  packageIds: z.array(z.number()),
  createSocialDraft: z.boolean(),
  targetPlatforms: z.array(
    z.enum([SocialPlatform.FACEBOOK_PAGE, SocialPlatform.INSTAGRAM_BUSINESS]),
  ),
  socialCaptionOverride: z.string().optional(),
  socialImageProfile: z.enum(SOCIAL_IMAGE_PROFILES),
  socialImageDirection: z.string().max(200).optional(),
});

type Values = z.infer<typeof schema>;

type Props = {
  businessSlug: string;
  services: { id: number; name: string; category: string }[];
  packages: { id: number; name: string }[];
  connectedPlatforms: SocialPlatform[];
  socialPublishingEnabled: boolean;
};

const defaultStart = new Date().toISOString().slice(0, 16);
const defaultEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 16);

export function CreateSaleEventDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [showSocialOptions, setShowSocialOptions] = useState(false);

  const servicesByCategory = useMemo(() => {
    const grouped = props.services.reduce(
      (acc, service) => {
        const category = service.category.trim() || "Uncategorized";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(service);
        return acc;
      },
      {} as Record<string, Props["services"]>,
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

  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      title: "",
      description: "",
      startDate: defaultStart,
      endDate: defaultEnd,
      discountType: "PERCENTAGE",
      discountValue: 10,
      slotLimit: undefined,
      serviceIds: [],
      packageIds: [],
      createSocialDraft: false,
      targetPlatforms: props.connectedPlatforms,
      socialCaptionOverride: "",
      socialImageProfile: DEFAULT_SOCIAL_IMAGE_PROFILE,
      socialImageDirection: "",
    },
  });

  const values = form.watch();

  const toggleNumber = (key: "serviceIds" | "packageIds", value: number) => {
    const current = form.getValues(key);
    const updated = new Set(current);
    if (updated.has(value)) {
      updated.delete(value);
    } else {
      updated.add(value);
    }
    form.setValue(key, Array.from(updated), { shouldDirty: true });
  };

  const setManyNumbers = (
    key: "serviceIds" | "packageIds",
    values: number[],
    checked: boolean,
  ) => {
    const current = form.getValues(key);
    const updated = new Set(current);

    values.forEach((value) => {
      if (checked) {
        updated.add(value);
      } else {
        updated.delete(value);
      }
    });

    form.setValue(key, Array.from(updated), { shouldDirty: true });
  };

  const isAllSelected = (selectedIds: number[], ids: number[]) =>
    ids.length > 0 && ids.every((id) => selectedIds.includes(id));

  const isPartiallySelected = (selectedIds: number[], ids: number[]) =>
    ids.some((id) => selectedIds.includes(id));

  const servicesAllSelected = isAllSelected(values.serviceIds, allServiceIds);
  const servicesPartiallySelected =
    !servicesAllSelected && isPartiallySelected(values.serviceIds, allServiceIds);
  const packagesAllSelected = isAllSelected(values.packageIds, allPackageIds);
  const packagesPartiallySelected =
    !packagesAllSelected && isPartiallySelected(values.packageIds, allPackageIds);

  const clearSelection = (key: "serviceIds" | "packageIds") => {
    form.setValue(key, [], { shouldDirty: true });
  };

  const togglePlatform = (platform: SocialPlatform) => {
    const current = form.getValues("targetPlatforms");
    if (current.includes(platform)) {
      form.setValue(
        "targetPlatforms",
        current.filter((item) => item !== platform),
      );
    } else {
      form.setValue("targetPlatforms", [...current, platform]);
    }
  };

  const generateCaption = async () => {
    if (!values.title.trim()) {
      toast.error("Add an event title first.");
      return;
    }

    setIsGenerating(true);
    try {
      const serviceNames = props.services
        .filter((service) => values.serviceIds.includes(service.id))
        .map((service) => service.name);
      const serviceCategories = Array.from(
        new Set(
          props.services
            .filter((service) => values.serviceIds.includes(service.id))
            .map((service) => service.category.trim())
            .filter(Boolean),
        ),
      );
      const packageNames = props.packages
        .filter((pkg) => values.packageIds.includes(pkg.id))
        .map((pkg) => pkg.name);
      const result = await generateSocialCaptionAction({
        businessSlug: props.businessSlug,
        saleTitle: values.title,
        saleDescription: values.description,
        discountType: values.discountType,
        discountValue: values.discountValue,
        startDate: new Date(values.startDate),
        endDate: new Date(values.endDate),
        serviceNames,
        serviceCategories,
        packageNames,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to generate caption.");
        return;
      }

      form.setValue(
        "socialCaptionOverride",
        `${result.data.caption}\n\n${result.data.hashtags.join(" ")}`,
      );
      toast.success("Caption generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      let uploadedUrl: string | undefined;
      if (mediaFile) {
        const formData = new FormData();
        formData.set("file", mediaFile);
        uploadedUrl = await uploadImageAction(formData);
      }

      const result = await createSaleEvent({
        businessSlug: props.businessSlug,
        title: data.title,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        discountType: data.discountType,
        discountValue: data.discountValue,
        serviceIds: data.serviceIds,
        packageIds: data.packageIds,
        createSocialDraft: data.createSocialDraft,
        targetPlatforms: data.targetPlatforms,
        slotLimit: typeof data.slotLimit === "number" ? data.slotLimit : null,
        socialCaptionOverride: data.socialCaptionOverride,
        socialMediaUrl: uploadedUrl,
        socialImageProfile: data.socialImageProfile,
        socialImageDirection: data.socialImageDirection?.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to create event.");
        return;
      }

      toast.success("Sale event created.");
      setOpen(false);
      setMediaFile(null);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create event. Please try again.",
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 rounded-xl bg-primary px-3 text-primary-foreground font-semibold shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4">
          <Plus className="h-4 w-4 sm:mr-2" strokeWidth={2.5} />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Create Event</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl rounded-3xl p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold text-foreground">Create Sale Event</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create discounts and optionally prepare social drafts.
          </DialogDescription>
        </DialogHeader>
        <div className="h-px bg-border mx-6" />

        <div className="px-6 py-4 space-y-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input className="h-10 rounded-xl" {...form.register("title")} />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea className="rounded-xl resize-none" {...form.register("description")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Start</Label>
              <Input type="datetime-local" className="h-10 rounded-xl" {...form.register("startDate")} />
            </div>
            <div className="grid gap-2">
              <Label>End</Label>
              <Input type="datetime-local" className="h-10 rounded-xl" {...form.register("endDate")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Discount Type</Label>
              <Select
                value={values.discountType}
                onValueChange={(v) => form.setValue("discountType", v as DiscountType)}
              >
                <SelectTrigger className="h-10 rounded-xl cursor-pointer">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                  <SelectItem value="FLAT">Flat amount (₱)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>
                Discount Value{" "}
                <span className="font-normal text-muted-foreground">
                  {values.discountType === "PERCENTAGE" ? "(%)" : "(₱)"}
                </span>
              </Label>
              <Input type="number" step="0.01" min={0} className="h-10 rounded-xl" {...form.register("discountValue")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Slot Limit <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="number"
              min={1}
              placeholder="Leave empty for unlimited"
              className="h-10 rounded-xl"
              {...form.register("slotLimit")}
            />
            <p className="text-xs text-muted-foreground">
              Max clients who can avail this sale. Empty = no limit.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Applies To</Label>
            <Tabs defaultValue="services" className="rounded-xl border border-border p-3 bg-muted/20">
              <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg">
                <TabsTrigger value="services" className="rounded-md">
                  Services ({values.serviceIds.length}/{allServiceIds.length})
                </TabsTrigger>
                <TabsTrigger value="packages" className="rounded-md">
                  Packages ({values.packageIds.length}/{allPackageIds.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
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
                        setManyNumbers("serviceIds", allServiceIds, checked === true)
                      }
                    />
                    Select all services
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="cursor-pointer"
                    onClick={() => clearSelection("serviceIds")}
                    disabled={values.serviceIds.length === 0}
                  >
                    Clear
                  </Button>
                </div>

                {servicesByCategory.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                    No services available yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {servicesByCategory.map(({ category, services }) => {
                      const categoryServiceIds = services.map((service) => service.id);
                      const categoryAllSelected = isAllSelected(
                        values.serviceIds,
                        categoryServiceIds,
                      );
                      const categoryPartiallySelected =
                        !categoryAllSelected &&
                        isPartiallySelected(values.serviceIds, categoryServiceIds);

                      return (
                        <div key={category} className="rounded-lg border border-border bg-background p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{category}</p>
                              <p className="text-xs text-muted-foreground">
                                {categoryServiceIds.filter((id) =>
                                  values.serviceIds.includes(id),
                                ).length}/{categoryServiceIds.length} selected
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
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
                                    "serviceIds",
                                    categoryServiceIds,
                                    checked === true,
                                  )
                                }
                              />
                              Select all
                            </label>
                          </div>

                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {services.map((service) => (
                              <label
                                key={service.id}
                                className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/30 transition-colors"
                              >
                                <Checkbox
                                  checked={values.serviceIds.includes(service.id)}
                                  onCheckedChange={() =>
                                    toggleNumber("serviceIds", service.id)
                                  }
                                />
                                {service.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="packages" className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
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
                        setManyNumbers("packageIds", allPackageIds, checked === true)
                      }
                    />
                    Select all packages
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="cursor-pointer"
                    onClick={() => clearSelection("packageIds")}
                    disabled={values.packageIds.length === 0}
                  >
                    Clear
                  </Button>
                </div>

                {props.packages.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                    No packages available yet.
                  </p>
                ) : (
                  <div className="grid gap-1.5 rounded-lg border border-border bg-background p-3 sm:grid-cols-2">
                    {props.packages.map((pkg) => (
                      <label
                        key={pkg.id}
                        className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/30 transition-colors"
                      >
                        <Checkbox
                          checked={values.packageIds.includes(pkg.id)}
                          onCheckedChange={() => toggleNumber("packageIds", pkg.id)}
                        />
                        {pkg.name}
                      </label>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
            <button
              type="button"
              onClick={() => setShowSocialOptions((previous) => !previous)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-accent/30 transition-colors cursor-pointer"
            >
              Optional: Social draft and AI helpers
            </button>
            <p className="text-xs text-muted-foreground">
              Leave this closed to create only the sale event.
            </p>
            {showSocialOptions ? (
              <>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={values.createSocialDraft}
                    onCheckedChange={(checked) =>
                      form.setValue("createSocialDraft", checked === true)
                    }
                    disabled={
                      !props.socialPublishingEnabled ||
                      props.connectedPlatforms.length === 0
                    }
                  />
                  Create social draft
                </label>
                {values.createSocialDraft ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[SocialPlatform.FACEBOOK_PAGE, SocialPlatform.INSTAGRAM_BUSINESS].map(
                        (platform) => (
                          <label key={platform} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={values.targetPlatforms.includes(platform)}
                              disabled={!props.connectedPlatforms.includes(platform)}
                              onCheckedChange={() => togglePlatform(platform)}
                            />
                            {platform === "FACEBOOK_PAGE"
                              ? "Facebook Page"
                              : "Instagram Business"}
                          </label>
                        ),
                      )}
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label>Caption Override</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg cursor-pointer"
                          disabled={isGenerating}
                          onClick={generateCaption}
                        >
                          {isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Generate
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea className="rounded-xl resize-none" {...form.register("socialCaptionOverride")} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Image Upload <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input
                        type="file"
                        accept="image/*"
                        className="rounded-xl"
                        onChange={(event) =>
                          setMediaFile(event.target.files?.[0] || null)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        If no file is uploaded, one will be generated using the selected style.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label>AI Image Style</Label>
                      <Select
                        value={values.socialImageProfile}
                        onValueChange={(v) => form.setValue("socialImageProfile", v as typeof values.socialImageProfile)}
                      >
                        <SelectTrigger className="h-10 rounded-xl cursor-pointer">
                          <SelectValue placeholder="Select style" />
                        </SelectTrigger>
                        <SelectContent>
                          {SOCIAL_IMAGE_PROFILE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {SOCIAL_IMAGE_PROFILE_OPTIONS.find((o) => o.value === values.socialImageProfile)?.description}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Image direction <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <Textarea
                        placeholder='Describe the look you want — e.g. "young woman getting a facial, autumn tones, cozy studio"'
                        value={values.socialImageDirection ?? ""}
                        onChange={(e) => form.setValue("socialImageDirection", e.target.value)}
                        rows={2}
                        maxLength={200}
                        className="resize-none text-sm rounded-xl"
                      />
                      <p className="text-xs text-muted-foreground">
                        Guide the AI on what to show in the generated image.
                      </p>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl cursor-pointer" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            onClick={onSubmit}
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Create Event
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
