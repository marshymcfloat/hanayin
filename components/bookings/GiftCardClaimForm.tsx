"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, Clock, Gift, Loader2, Mail, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import DatePicker from "@/components/bookings/DatePicker";
import TimeSlotPicker from "@/components/bookings/TimeSlotPicker";
import { getAvailableSlots } from "@/features/bookings/actions/availability";
import {
  claimGiftCardBookingAction,
  previewGiftCardClaimAction,
  type GiftCardClaimPreviewData,
} from "@/features/gift-cards/actions/gift-cards";

interface GiftCardClaimFormProps {
  businessSlug: string;
  mode?: "public" | "staff";
  onSuccess?: (bookingId: number) => void;
}

export default function GiftCardClaimForm({
  businessSlug,
  mode = "public",
  onSuccess,
}: GiftCardClaimFormProps) {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<Date | undefined>();
  const [previewData, setPreviewData] = useState<GiftCardClaimPreviewData | null>(
    null,
  );
  const [timingMode, setTimingMode] = useState<"SCHEDULED" | "WALK_IN">(
    "SCHEDULED",
  );

  const normalizedCode = code.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();
  const slotServices = useMemo(
    () => previewData?.slotServices ?? [],
    [previewData],
  );

  const isStaffMode = mode === "staff";
  const isWalkIn = isStaffMode && timingMode === "WALK_IN";

  const slotServicesKey = useMemo(
    () =>
      slotServices
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((item) => `${item.id}:${item.quantity}`)
        .join("|"),
    [slotServices],
  );

  const previewMutation = useMutation({
    mutationFn: () =>
      previewGiftCardClaimAction({
        businessSlug,
        code: normalizedCode,
        email: normalizedEmail,
      }),
    onSuccess: (result) => {
      if (!result.success) {
        setPreviewData(null);
        setSelectedDate(undefined);
        setSelectedTime(undefined);
        toast.error(result.error);
        return;
      }

      setPreviewData(result.data);
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      toast.success("Gift card verified.");
    },
    onError: () => {
      toast.error("Unable to verify gift card.");
    },
  });

  const { data: timeSlots = [], isLoading: isLoadingSlots } = useQuery({
    queryKey: [
      "gift-card-claim-slots",
      businessSlug,
      previewData?.code,
      selectedDate?.toISOString(),
      slotServicesKey,
    ],
    queryFn: async () => {
      if (
        !selectedDate ||
        !previewData ||
        slotServices.length === 0 ||
        isWalkIn
      ) {
        return [];
      }

      return getAvailableSlots({
        businessSlug,
        date: selectedDate,
        services: slotServices,
      });
    },
    enabled:
      !!previewData && !!selectedDate && slotServices.length > 0 && !isWalkIn,
  });

  const claimMutation = useMutation({
    mutationFn: () => {
      if (!previewData) {
        throw new Error("Please verify the gift card first.");
      }

      if (!isWalkIn && !selectedTime) {
        throw new Error("Please select a date and time.");
      }

      return claimGiftCardBookingAction({
        businessSlug,
        code: previewData.code,
        email: normalizedEmail,
        scheduledAt: isWalkIn ? new Date() : (selectedTime as Date),
        isWalkIn,
      });
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (isStaffMode) {
        toast.success("Gift card claimed and booking created.");
        setCode("");
        setEmail("");
        setSelectedDate(undefined);
        setSelectedTime(undefined);
        setPreviewData(null);
        setTimingMode("SCHEDULED");
        onSuccess?.(result.data.bookingId);
        return;
      }

      const successUrl = `/${businessSlug}/booking/success?bookingId=${result.data.bookingId}&token=${encodeURIComponent(result.data.successToken)}`;
      window.location.href = successUrl;
    },
    onError: () => {
      toast.error("Unable to claim gift card.");
    },
  });

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase());
    setPreviewData(null);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setTimingMode("SCHEDULED");
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setPreviewData(null);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setTimingMode("SCHEDULED");
  };

  const canVerify = normalizedCode.length > 0 && normalizedEmail.length > 0;
  const canClaim =
    !!previewData && (isWalkIn || !!selectedTime) && !claimMutation.isPending;

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            1
          </span>
          <h3 className="text-base font-semibold">Verify Gift Card</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gift-card-code">Gift card code</Label>
            <Input
              id="gift-card-code"
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              placeholder="AB-G7K2D"
              autoCapitalize="characters"
              className="uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gift-card-email">Email used for gift card</Label>
            <Input
              id="gift-card-email"
              type="email"
              value={email}
              onChange={(event) => handleEmailChange(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <Button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={!canVerify || previewMutation.isPending}
          className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
        >
          {previewMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Verify gift card
        </Button>

        <p className="text-xs text-muted-foreground">
          Use the code and recipient email exactly as sent by the business.
        </p>
      </section>

      {previewData && (
        <>
          <section className="space-y-5 border-t border-border pt-5 sm:pt-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Gift card verified
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Code
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{previewData.code}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Recipient
                </p>
                <p className="mt-1 text-sm font-semibold">{previewData.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Expires
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {format(new Date(previewData.expiresAt), "MMM d, yyyy")}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Included services</h4>
                <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/[0.06] text-[10px] font-medium text-primary">
                  {previewData.totalDuration} mins total
                </Badge>
              </div>
              <ul className="-mx-2 divide-y divide-border">
                {previewData.lineItems.map((item, index) => (
                  <li
                    key={`${item.serviceId}-${item.packageId || "single"}-${index}`}
                    className="flex items-center justify-between gap-3 px-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.serviceName}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/[0.06] px-2 text-[10px] capitalize text-primary">
                          {item.category}
                        </Badge>
                        {item.packageName && (
                          <Badge variant="outline" className="rounded-full border-black/[0.08] bg-foreground/[0.04] px-2 text-[10px] text-muted-foreground">
                            {item.packageName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {item.duration} mins
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {isStaffMode && (
            <section className="space-y-4 border-t border-border pt-5 sm:pt-6">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                <h3 className="text-base font-semibold">Booking Type</h3>
              </div>
              <SegmentedToggle
                options={[
                  { value: "SCHEDULED", label: "Scheduled" },
                  { value: "WALK_IN", label: "Walk-in" },
                ]}
                value={timingMode}
                onChange={(value) => {
                  setTimingMode(value);
                  if (value === "WALK_IN") {
                    setSelectedDate(undefined);
                    setSelectedTime(undefined);
                  }
                }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Scheduled keeps slot availability checks. Walk-in creates an
                immediate booking using the current time.
              </p>
            </section>
          )}

          <section className="space-y-4 border-t border-border pt-5 sm:pt-6">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {isStaffMode ? "3" : "2"}
              </span>
              <h3 className="text-base font-semibold">Pick Date & Time</h3>
            </div>

            {!isWalkIn && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Date
                </Label>
                <DatePicker
                  value={selectedDate}
                  onChange={(date) => {
                    setSelectedDate(date);
                    setSelectedTime(undefined);
                  }}
                  placeholder="Select a booking date"
                />
              </div>
            )}

            {!isWalkIn && selectedDate && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Available slots
                </Label>
                <TimeSlotPicker
                  slots={timeSlots}
                  value={selectedTime}
                  onChange={(time) => setSelectedTime(time)}
                  isLoading={isLoadingSlots}
                />
              </div>
            )}

            {isWalkIn && (
              <div className="rounded-xl bg-primary/[0.04] px-3 py-2.5 text-xs text-foreground/70">
                This claim will be booked immediately as walk-in at the current
                time.
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-xl bg-foreground/[0.02] px-3 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-primary" />
                Covered by gift card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Receipt email: {normalizedEmail}
              </span>
            </div>
          </section>

          <Button
            type="button"
            onClick={() => claimMutation.mutate()}
            disabled={!canClaim}
            size="lg"
            className="w-full rounded-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {claimMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calendar className="mr-2 h-4 w-4" />
            )}
            {isWalkIn
              ? "Claim gift card as walk-in"
              : "Claim gift card and book this slot"}
          </Button>

          {!isWalkIn && !selectedTime && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Select an available slot to continue.
            </p>
          )}
        </>
      )}
    </div>
  );
}
