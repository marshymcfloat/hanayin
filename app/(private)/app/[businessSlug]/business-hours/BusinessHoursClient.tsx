"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractClientErrorMessage } from "@/lib/utils/error-message";
import { Loader2, Save, Copy, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  updateBusinessHours,
  BusinessHourInput,
} from "@/lib/server actions/business-hours";
import { updateBookingPolicy } from "@/lib/server actions/booking-policy";
import { BookingPolicy } from "@/lib/types/booking-policy";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface BusinessHoursClientProps {
  initialHours: BusinessHourInput[];
  categories: string[];
  initialPolicy: BookingPolicy;
  businessSlug: string;
}

const DEFAULT_HOURS = Array.from({ length: 7 }).map((_, i) => ({
  day_of_week: i,
  open_time: "09:00",
  close_time: "18:00",
  is_closed: i === 0 || i === 6 ? true : false,
  category: "GENERAL",
}));

export function BusinessHoursClient({
  initialHours,
  categories,
  initialPolicy,
  businessSlug,
}: BusinessHoursClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState("GENERAL");
  const [policy, setPolicy] = useState<BookingPolicy>(initialPolicy);

  const [hours, setHours] = useState<BusinessHourInput[]>(() => {
    if (initialHours.length === 0) return DEFAULT_HOURS;
    return initialHours.map((h) => ({
      day_of_week: h.day_of_week,
      open_time: h.open_time,
      close_time: h.close_time,
      is_closed: h.is_closed,
      category: h.category,
    }));
  });

  const handleTimeChange = (
    day: number,
    field: "open_time" | "close_time",
    value: string,
  ) => {
    setHours((prev) => {
      const existing = prev.find(
        (h) => h.day_of_week === day && h.category === activeCategory,
      );
      if (existing) {
        return prev.map((h) =>
          h.day_of_week === day && h.category === activeCategory
            ? { ...h, [field]: value }
            : h,
        );
      } else {
        return [
          ...prev,
          {
            day_of_week: day,
            open_time: field === "open_time" ? value : "18:00",
            close_time: field === "close_time" ? value : "09:00",
            is_closed: false,
            category: activeCategory,
          },
        ];
      }
    });
  };

  const toggleClosed = (day: number) => {
    setHours((prev) => {
      const existing = prev.find(
        (h) => h.day_of_week === day && h.category === activeCategory,
      );
      if (existing) {
        return prev.map((h) =>
          h.day_of_week === day && h.category === activeCategory
            ? { ...h, is_closed: !h.is_closed }
            : h,
        );
      } else {
        return [
          ...prev,
          {
            day_of_week: day,
            open_time: "09:00",
            close_time: "18:00",
            is_closed: true,
            category: activeCategory,
          },
        ];
      }
    });
  };

  const copyToAllDays = (sourceDay: number) => {
    const source = hours.find(
      (h) => h.day_of_week === sourceDay && h.category === activeCategory,
    );
    if (!source) return;

    setHours((prev) => {
      const others = prev.filter((h) => h.category !== activeCategory);
      const newEntries = Array.from({ length: 7 }).map((_, i) => ({
        ...source,
        day_of_week: i,
      }));
      return [...others, ...newEntries];
    });
    toast.success("Schedule copied to all days");
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        updateBusinessHours(businessSlug, hours),
        updateBookingPolicy(businessSlug, policy),
      ]);
      toast.success("Business hours and booking policy saved");
      router.refresh();
    } catch (err) {
      toast.error(extractClientErrorMessage(err, "Failed to save changes"));
    } finally {
      setIsSaving(false);
    }
  };

  const getHourForDay = (day: number) => {
    return (
      hours.find(
        (h) => h.day_of_week === day && h.category === activeCategory,
      ) || {
        day_of_week: day,
        open_time: "09:00",
        close_time: "18:00",
        is_closed: true,
        category: activeCategory,
      }
    );
  };

  const displayCategories = [
    "GENERAL",
    ...categories.filter((c) => c !== "GENERAL"),
  ];

  const updateNumericPolicy = (
    key:
      | "bookingHorizonDays"
      | "minLeadMinutes"
      | "slotIntervalMinutes",
    value: string,
  ) => {
    const parsed = Number.parseInt(value, 10);
    setPolicy((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : prev[key],
    }));
  };

  return (
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Clock className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Business Hours</h1>
              <p className="text-xs text-muted-foreground">
                Configure operating hours for different service categories.
              </p>
            </div>
            <div className="ml-auto">
              <Button
                onClick={saveChanges}
                disabled={isSaving}
                className="min-w-[130px] bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto w-full">
          <Tabs
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="w-full"
          >
            <Card className="rounded-3xl border-border bg-card shadow-sm overflow-hidden mb-6">
              <CardHeader className="bg-card border-b border-border">
                <CardTitle className="text-xl font-bold text-foreground">
                  Booking Policy
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Control how far ahead customers can book and what payment options
                  are available publicly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="booking-horizon-days">Booking Horizon (days)</Label>
                    <Input
                      id="booking-horizon-days"
                      type="number"
                      min={1}
                      max={90}
                      className="rounded-xl"
                      value={policy.bookingHorizonDays}
                      onChange={(event) =>
                        updateNumericPolicy("bookingHorizonDays", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="booking-min-lead">Min Lead (minutes)</Label>
                    <Input
                      id="booking-min-lead"
                      type="number"
                      min={0}
                      max={720}
                      className="rounded-xl"
                      value={policy.minLeadMinutes}
                      onChange={(event) =>
                        updateNumericPolicy("minLeadMinutes", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="booking-slot-interval">Slot Interval (minutes)</Label>
                    <Input
                      id="booking-slot-interval"
                      type="number"
                      min={5}
                      max={120}
                      className="rounded-xl"
                      value={policy.slotIntervalMinutes}
                      onChange={(event) =>
                        updateNumericPolicy("slotIntervalMinutes", event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">Allow Full Payment (Public)</p>
                      <p className="text-xs text-muted-foreground">
                        Customers can choose full payment online.
                      </p>
                    </div>
                    <Switch
                      checked={policy.allowPublicFullPayment}
                      onCheckedChange={(checked) =>
                        setPolicy((prev) => ({
                          ...prev,
                          allowPublicFullPayment: checked,
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">
                        Allow Downpayment (Public)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Customers can choose 50% downpayment.
                      </p>
                    </div>
                    <Switch
                      checked={policy.allowPublicDownpayment}
                      onCheckedChange={(checked) =>
                        setPolicy((prev) => ({
                          ...prev,
                          allowPublicDownpayment: checked,
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors sm:col-span-2">
                    <div>
                      <p className="text-sm font-medium">Enable Booking V2</p>
                      <p className="text-xs text-muted-foreground">
                        Turns on future-date slot generation using roster mode.
                      </p>
                    </div>
                    <Switch
                      checked={policy.bookingV2Enabled}
                      onCheckedChange={(checked) =>
                        setPolicy((prev) => ({
                          ...prev,
                          bookingV2Enabled: checked,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="default-public-payment">Default Public Payment Type</Label>
                  <Select
                    value={policy.defaultPublicPaymentType}
                    onValueChange={(value: "FULL" | "DOWNPAYMENT") =>
                      setPolicy((prev) => ({
                        ...prev,
                        defaultPublicPaymentType: value,
                      }))
                    }
                  >
                    <SelectTrigger id="default-public-payment" className="w-full max-w-sm rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="FULL">Full Payment</SelectItem>
                      <SelectItem value="DOWNPAYMENT">Downpayment (50%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-2 bg-transparent p-0 mb-6">
              {displayCategories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border border-border bg-card text-foreground hover:bg-accent/30 px-6 py-2.5 rounded-full transition-all cursor-pointer"
                >
                  {category === "GENERAL" ? "General Hours" : category}
                </TabsTrigger>
              ))}
            </TabsList>

            {displayCategories.map((category) => (
              <TabsContent key={category} value={category} className="mt-0">
                <Card className="rounded-3xl border-border bg-card shadow-sm overflow-hidden">
                  <CardHeader className="bg-card border-b border-border">
                    <CardTitle className="text-xl font-bold text-foreground">
                      {category === "GENERAL"
                        ? "General Operating Hours"
                        : `${category} Hours`}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Set the weekly schedule for{" "}
                      {category === "GENERAL" ? "general services" : category}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 p-6">
                    {DAYS.map((dayName, index) => {
                      const hour = getHourForDay(index);
                      return (
                        <div
                          key={index}
                          className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border transition-all ${
                            hour.is_closed
                              ? "bg-muted/30 border-border"
                              : "bg-card border-border hover:border-primary/20"
                          }`}
                        >
                          <div className="w-40 flex items-center gap-3">
                            <Switch
                              checked={!hour.is_closed}
                              onCheckedChange={() => toggleClosed(index)}
                            />
                            <span
                              className={`font-medium ${
                                hour.is_closed ? "text-muted-foreground" : "text-foreground"
                              }`}
                            >
                              {dayName}
                            </span>
                          </div>

                          <div className="flex-1 flex items-center gap-4">
                            {hour.is_closed ? (
                              <div className="text-sm text-muted-foreground italic px-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span>
                                Closed
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3">
                                  <Select
                                    value={hour.open_time}
                                    onValueChange={(v) =>
                                      handleTimeChange(index, "open_time", v)
                                    }
                                  >
                                    <SelectTrigger className="w-[110px] rounded-xl border-border">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="popper">
                                      {generateTimeOptions().map((t) => (
                                        <SelectItem key={t} value={t}>
                                          {t}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-muted-foreground font-medium">
                                    -
                                  </span>
                                  <Select
                                    value={hour.close_time}
                                    onValueChange={(v) =>
                                      handleTimeChange(index, "close_time", v)
                                    }
                                  >
                                    <SelectTrigger className="w-[110px] rounded-xl border-border">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="popper">
                                      {generateTimeOptions().map((t) => (
                                        <SelectItem key={t} value={t}>
                                          {t}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                  onClick={() => copyToAllDays(index)}
                                  title="Copy to all days"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function generateTimeOptions() {
  const times = [];
  for (let i = 0; i < 24; i++) {
    const hour = i.toString().padStart(2, "0");
    times.push(`${hour}:00`);
    times.push(`${hour}:30`);
  }
  return times;
}
