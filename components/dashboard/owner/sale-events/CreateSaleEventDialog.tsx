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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="mr-2 h-4 w-4" />
          Create Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Sale Event</DialogTitle>
          <DialogDescription>
            Create discounts and optionally prepare social drafts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input {...form.register("title")} />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Start</Label>
              <Input type="datetime-local" {...form.register("startDate")} />
            </div>
            <div className="grid gap-2">
              <Label>End</Label>
              <Input type="datetime-local" {...form.register("endDate")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Discount Type</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                {...form.register("discountType")}
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Discount Value</Label>
              <Input type="number" step="0.01" {...form.register("discountValue")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Slot Limit (optional)</Label>
            <Input
              type="number"
              min={1}
              placeholder="Leave empty for unlimited"
              {...form.register("slotLimit")}
            />
            <p className="text-xs text-zinc-500">
              Maximum number of clients who can avail this sale. Leave empty for no limit.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Applies To</Label>
            <Tabs defaultValue="services" className="rounded-md border p-3">
              <TabsList className="grid h-10 w-full grid-cols-2">
                <TabsTrigger value="services">
                  Services ({values.serviceIds.length}/{allServiceIds.length})
                </TabsTrigger>
                <TabsTrigger value="packages">
                  Packages ({values.packageIds.length}/{allPackageIds.length})
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
                        setManyNumbers("serviceIds", allServiceIds, checked === true)
                      }
                    />
                    Select all services
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => clearSelection("serviceIds")}
                    disabled={values.serviceIds.length === 0}
                  >
                    Clear
                  </Button>
                </div>

                {servicesByCategory.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-zinc-500">
                    No services available yet.
                  </p>
                ) : (
                  <div className="space-y-3">
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
                        <div key={category} className="rounded-md border p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{category}</p>
                              <p className="text-xs text-zinc-500">
                                {categoryServiceIds.filter((id) =>
                                  values.serviceIds.includes(id),
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
                                    "serviceIds",
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
                                className="flex min-h-11 items-center gap-2 rounded-sm px-1 py-1 text-sm"
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
                        setManyNumbers("packageIds", allPackageIds, checked === true)
                      }
                    />
                    Select all packages
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => clearSelection("packageIds")}
                    disabled={values.packageIds.length === 0}
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
                        className="flex min-h-11 items-center gap-2 rounded-sm px-1 py-1 text-sm"
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

          <div className="space-y-3 rounded-md border p-3">
            <button
              type="button"
              onClick={() => setShowSocialOptions((previous) => !previous)}
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
            >
              Optional: Social draft and AI helpers
            </button>
            <p className="text-xs text-zinc-500">
              Manual first: leave this closed to create only the sale event.
            </p>
            {showSocialOptions ? (
              <>
                <label className="flex items-center gap-2 text-sm font-medium">
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
                          <label key={platform} className="flex items-center gap-2 text-sm">
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
                      <Textarea {...form.register("socialCaptionOverride")} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Image Upload (optional)</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          setMediaFile(event.target.files?.[0] || null)
                        }
                      />
                      <p className="text-xs text-zinc-500">
                        If no file is uploaded, we will generate one using the selected style.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label>AI Image Style</Label>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        {...form.register("socialImageProfile")}
                      >
                        {SOCIAL_IMAGE_PROFILE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-zinc-500">
                        {
                          SOCIAL_IMAGE_PROFILE_OPTIONS.find(
                            (option) => option.value === values.socialImageProfile,
                          )?.description
                        }
                      </p>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
