"use client";

import * as React from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ImageUpload } from "@/components/ui/image-upload";
import LocationInputGroup from "@/components/business/LocationInputGroup";
import { updateBusinessAction } from "@/lib/server actions/business-settings";
import { disconnectSocialConnectionAction } from "@/lib/server actions/social";
import {
  Loader2,
  Link as LinkIcon,
  RefreshCw,
  Unplug,
  AlertCircle,
  Check,
  ChevronsUpDown,
  Globe,
} from "lucide-react";
import {
  BusinessType,
  BusinessStructure,
  SocialConnectionStatus,
  SocialPlatform,
} from "@/prisma/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { BUSINESS_STRUCTURE_TEMPLATES } from "@/lib/business-structure";
import {
  GROWTH_TONE_PROFILE_OPTIONS,
  normalizeGrowthToneProfile,
} from "@/lib/services/growth/tone-profiles";

interface BusinessSettingsFormProps {
  business: {
    slug: string;
    name: string;
    initials: string | null;
    description: string | null;
    imageUrl: string | null;
    latitude: number | null;
    longitude: number | null;
    structure: BusinessStructure;
    allow_employee_self_booking: boolean;
    manager_can_serve: boolean;
    timezone: string;
    formal_schedule_enabled: boolean;
    growth_settings: {
      business_type: BusinessType;
      max_discount_percent: number;
      enable_student_promo: boolean;
      avoid_cheap_wording: boolean;
      weather_hooks_enabled: boolean;
      tone_profile: string;
    } | null;
    social_connections: {
      id: string;
      platform: SocialPlatform;
      display_name: string;
      username: string | null;
      status: SocialConnectionStatus;
      token_expires_at: Date | null;
    }[];
  };
  socialEntitled: boolean;
  socialPublishingEnabled: boolean;
}

export function BusinessSettingsForm({
  business,
  socialEntitled,
  socialPublishingEnabled,
}: BusinessSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [disconnectingId, setDisconnectingId] = useTransition();
  const [timezone, setTimezone] = useState(business.timezone);
  const [formalSchedule, setFormalSchedule] = useState(
    business.formal_schedule_enabled,
  );
  const [tzPickerOpen, setTzPickerOpen] = useState(false);

  // Full IANA list. `Intl.supportedValuesOf` is in Node 18+ and all modern
  // browsers; we defensively fall back to a curated short list so the
  // combobox still renders on environments missing the API.
  const timezoneOptions = useMemo(() => {
    try {
      const supported = (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf?.("timeZone");
      if (supported && supported.length > 0) return supported;
    } catch {
      // fall through
    }
    return [
      "Asia/Manila",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Asia/Hong_Kong",
      "Asia/Jakarta",
      "Australia/Sydney",
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "Europe/London",
      "Europe/Berlin",
      "UTC",
    ];
  }, []);

  const connectionMap = useMemo(
    () =>
      new Map(
        business.social_connections.map((connection) => [
          connection.platform,
          connection,
        ]),
      ),
    [business.social_connections],
  );

  const facebookConnection = connectionMap.get("FACEBOOK_PAGE");
  const instagramConnection = connectionMap.get("INSTAGRAM_BUSINESS");
  const selectedGrowthToneProfile = normalizeGrowthToneProfile(
    business.growth_settings?.tone_profile,
  );

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateBusinessAction(business.slug, formData);
      if (result.success) {
        toast.success("Business settings saved successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Something went wrong");
      }
    });
  }

  async function disconnectConnection(connectionId: string) {
    setDisconnectingId(async () => {
      const result = await disconnectSocialConnectionAction({
        businessSlug: business.slug,
        connectionId,
      });

      if (result.success) {
        toast.success("Social channel disconnected.");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to disconnect channel.");
      }
    });
  }

  const connectHref = `/api/social/meta/connect?businessSlug=${encodeURIComponent(
    business.slug,
  )}`;
  const socialActionsDisabled = !socialEntitled || !socialPublishingEnabled;

  return (
    <form action={onSubmit} className="space-y-6">
      <Card className="rounded-3xl border-zinc-200/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <CardTitle className="text-xl font-bold text-foreground">
            General Information
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Basic details about your business.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6 bg-white">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-700">
                Business Name
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={business.name}
                placeholder="e.g. BeautyFeel"
                className="rounded-xl border-zinc-200 focus-visible:ring-emerald-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initials" className="text-zinc-700">
                Business Initials
              </Label>
              <Input
                id="initials"
                name="initials"
                defaultValue={business.initials || ""}
                placeholder="e.g. BF"
                maxLength={2}
                required
                className="rounded-xl border-zinc-200 focus-visible:ring-emerald-500"
              />
              <p className="text-[0.8rem] text-muted-foreground">
                Used as prefix for voucher codes (e.g. BF-123456)
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-zinc-700">Business Image</Label>
            <div className="space-y-2">
              <input
                type="hidden"
                name="existingImageUrl"
                defaultValue={business.imageUrl || ""}
              />
              <ImageUpload name="imageFile" defaultValue={business.imageUrl} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-700">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={business.description || ""}
              placeholder="Tell customers about your business..."
              className="rounded-xl border-zinc-200 focus-visible:ring-emerald-500 min-h-[120px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug" className="text-zinc-700">
              Business Slug
            </Label>
            <Input
              disabled
              defaultValue={business.slug}
              className="bg-zinc-50 border-zinc-200 rounded-xl text-zinc-500"
            />
            <p className="text-[0.8rem] text-muted-foreground">
              This is your unique identifier used in the URL. Only admins can
              change this.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-zinc-200/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <CardTitle className="text-xl font-bold text-foreground">
            Location
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Pin your business location on the map. This helps customers find
            you.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6 bg-white">
            <LocationInputGroup
              initialLat={business.latitude}
              initialLng={business.longitude}
              businessSlug={business.slug}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-zinc-200/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <CardTitle className="text-xl font-bold text-foreground">
            Operations Structure
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure who books, who handles queue operations, and manager service mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white space-y-4">
          <div className="space-y-2">
            <Label htmlFor="structure">Structure</Label>
            <select
              id="structure"
              name="structure"
              defaultValue={business.structure}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {BUSINESS_STRUCTURE_TEMPLATES.map((template) => (
                <option key={template.value} value={template.value}>
                  {template.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="allowEmployeeSelfBooking">
                Allow Staff Self-booking
              </Label>
              <select
                id="allowEmployeeSelfBooking"
                name="allowEmployeeSelfBooking"
                defaultValue={
                  business.allow_employee_self_booking ? "true" : "false"
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="managerCanServe">Manager Can Serve</Label>
              <select
                id="managerCanServe"
                name="managerCanServe"
                defaultValue={business.manager_can_serve ? "true" : "false"}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-zinc-200/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <CardTitle className="text-xl font-bold text-foreground">
            Scheduling &amp; Timezone
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Controls how booking slots and employee shifts are interpreted.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white space-y-6">
          <div className="space-y-2">
            <Label htmlFor="timezoneTrigger" className="text-zinc-700">
              Business Timezone
            </Label>
            <input type="hidden" name="timezone" value={timezone} />
            <Popover open={tzPickerOpen} onOpenChange={setTzPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="timezoneTrigger"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={tzPickerOpen}
                  className="w-full justify-between rounded-xl border-zinc-200 hover:bg-zinc-50 font-normal cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-zinc-400" />
                    {timezone}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search timezone..." />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No timezone found.</CommandEmpty>
                    <CommandGroup>
                      {timezoneOptions.map((tz) => (
                        <CommandItem
                          key={tz}
                          value={tz}
                          onSelect={(v) => {
                            setTimezone(v);
                            setTzPickerOpen(false);
                          }}
                          className="cursor-pointer"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              timezone === tz ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {tz}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[0.8rem] text-muted-foreground">
              IANA timezone identifier. Slot math is currently locked to
              Asia/Manila; this field is stored for an upcoming refactor.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200/70 bg-zinc-50/40 p-4">
            <div className="space-y-1">
              <Label
                htmlFor="formalScheduleEnabled"
                className="text-sm font-semibold text-zinc-800 cursor-pointer"
              >
                Formal weekly schedules
              </Label>
              <p className="text-[0.8rem] text-muted-foreground max-w-md">
                When on, employees with an EmployeeSchedule are constrained
                to their shift windows. Employees with no schedule rows
                fall back to business hours, so flipping this won&apos;t
                accidentally hide everyone at once.
              </p>
            </div>
            <input
              type="hidden"
              name="formalScheduleEnabled"
              value={formalSchedule ? "true" : "false"}
            />
            <Switch
              id="formalScheduleEnabled"
              checked={formalSchedule}
              onCheckedChange={setFormalSchedule}
              className="cursor-pointer"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-zinc-200/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <CardTitle className="text-xl font-bold text-foreground">
            Growth Engine Settings
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure defaults for opportunity and campaign generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="growthBusinessType">Business Type</Label>
              <select
                id="growthBusinessType"
                name="growthBusinessType"
                defaultValue={business.growth_settings?.business_type || "SALON"}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="SALON">Salon</option>
                <option value="SPA">Spa</option>
                <option value="CLINIC">Clinic</option>
                <option value="BARBERSHOP">Barbershop</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="growthMaxDiscountPercent">Max Discount %</Label>
              <Input
                id="growthMaxDiscountPercent"
                name="growthMaxDiscountPercent"
                type="number"
                min={1}
                max={80}
                step="1"
                defaultValue={business.growth_settings?.max_discount_percent ?? 20}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="growthEnableStudentPromo"
                defaultChecked={business.growth_settings?.enable_student_promo || false}
              />
              Enable student promo templates
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="growthAvoidCheapWording"
                defaultChecked={business.growth_settings?.avoid_cheap_wording || false}
              />
              Avoid “cheap” wording
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="growthWeatherHooksEnabled"
                defaultChecked={business.growth_settings?.weather_hooks_enabled || false}
              />
              Enable weather hooks (optional)
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="growthToneProfile">Tone Profile</Label>
            <select
              id="growthToneProfile"
              name="growthToneProfile"
              defaultValue={selectedGrowthToneProfile}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {GROWTH_TONE_PROFILE_OPTIONS.map((tone) => (
                <option key={tone.value} value={tone.value}>
                  {tone.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-zinc-200/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <CardTitle className="text-xl font-bold text-foreground">
            Social Channels
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Connect your Facebook Page and linked Instagram business account for
            sale-event publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white space-y-4">
          {!socialEntitled ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              Social publishing is available on the Pro plan.
            </div>
          ) : !socialPublishingEnabled ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              Social publishing is currently limited to pilot businesses.
            </div>
          ) : null}

          {[facebookConnection, instagramConnection].map((connection, index) => {
            const platform = index === 0 ? "FACEBOOK_PAGE" : "INSTAGRAM_BUSINESS";
            const label = platform === "FACEBOOK_PAGE" ? "Facebook Page" : "Instagram Business";

            return (
              <div
                key={platform}
                className="rounded-2xl border border-zinc-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  {connection ? (
                    <div className="space-y-1 mt-1">
                      <p className="text-sm text-zinc-600">
                        {connection.display_name}
                        {connection.username ? ` (@${connection.username})` : ""}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          connection.status === "CONNECTED"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-zinc-100 text-zinc-700 border-zinc-200"
                        }
                      >
                        {connection.status}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 mt-1">
                      Not connected yet.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    asChild
                    disabled={socialActionsDisabled}
                  >
                    <Link href={connectHref}>
                      {connection ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Reconnect
                        </>
                      ) : (
                        <>
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Connect
                        </>
                      )}
                    </Link>
                  </Button>
                  {connection && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      disabled={socialActionsDisabled}
                      onClick={() => disconnectConnection(connection.id)}
                    >
                      {disconnectingId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Unplug className="mr-2 h-4 w-4" />
                          Disconnect
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          size="lg"
          disabled={isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/15 px-8 min-w-[140px]"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </form>
  );
}
