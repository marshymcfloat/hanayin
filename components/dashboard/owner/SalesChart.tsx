"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

// Re-defining locally to avoid circular dependencies or large imports if not needed
interface Booking {
  id: number;
  created_at: Date;
  grand_total: number;
}

interface BookingWithDetails extends Booking {
  availed_services: {
    price: number;
    service: {
      category: string;
      name: string;
    };
  }[];
}

interface PayrollRecord {
  id: number;
  total_salary: number;
  ending_date: Date;
}

type ChartRange = "daily" | "weekly" | "monthly" | "yearly";

type ChartBucket = {
  name: string;
  total: number;
  expenses: number;
  net: number;
  originalIndex?: number;
  [key: string]: number | string | undefined;
};

function toPhYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildRevenueReportHref({
  businessSlug,
  range,
}: {
  businessSlug: string;
  range: ChartRange;
}) {
  const params = new URLSearchParams();
  params.set("tab", "revenue");

  if (range === "daily") {
    params.set("preset", "today");
    params.set("groupBy", "day");
  } else if (range === "weekly") {
    params.set("preset", "7d");
    params.set("groupBy", "day");
  } else if (range === "monthly") {
    params.set("preset", "mtd");
    params.set("groupBy", "day");
  } else {
    const now = new Date();
    const year = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
    }).format(now);

    params.set("preset", "custom");
    params.set("groupBy", "month");
    params.set("start", `${year}-01-01`);
    params.set("end", toPhYmd(now));
  }

  return `/app/${businessSlug}/reports?${params.toString()}`;
}

export function SalesChart({
  bookings,
  allBookings = [],
  payroll = [],
  businessSlug,
  reportsEnabled = false,
  className,
  variant = "card",
}: {
  bookings: Booking[];
  allBookings?: BookingWithDetails[];
  payroll?: PayrollRecord[];
  businessSlug?: string;
  reportsEnabled?: boolean;
  className?: string;
  variant?: "card" | "embedded";
}) {
  const [range, setRange] = useState<ChartRange>("monthly");
  const isClient = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const {
    data,
    totalRevenue,
    totalPayroll,
    netRevenue,
    averageOrderValue,
  } = useMemo(() => {
    const now = new Date();
    const getPHParts = (date: Date) => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const get = (type: string) =>
        parseInt(parts.find((p) => p.type === type)?.value || "0");
      return {
        year: get("year"),
        month: get("month") - 1,
        day: get("day"),
        hour: get("hour"),
      };
    };

    const currentPH = getPHParts(now);

    // Initial Filter
    // Use allBookings if available for detailed data, else fallback to bookings but cast it
    // The previous implementation logic suggests we should prefer allBookings if we want category data.
    // If allBookings is empty (not passed), we can't do category breakdown effectively if bookings doesn't have it.
    // However, if allBookings is passed, we use it.
    let filteredBookings: BookingWithDetails[] = [];

    if (allBookings.length > 0) {
      filteredBookings = allBookings;
    } else {
      // Fallback or just map existing bookings to have empty availed_services if needed,
      // but bookings only has id, created_at, grand_total.
      // We'll proceed with what we have.
      filteredBookings = bookings.map((b) => ({
        ...b,
        availed_services: [],
      }));
    }

    let filteredPayroll = payroll;

    // Filter logic
    const filterByRange = (date: Date) => {
      const dPH = getPHParts(new Date(date));
      if (range === "daily") {
        return (
          dPH.day === currentPH.day &&
          dPH.month === currentPH.month &&
          dPH.year === currentPH.year
        );
      } else if (range === "weekly") {
        const diffTime = Math.abs(now.getTime() - new Date(date).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      } else if (range === "monthly") {
        return dPH.month === currentPH.month && dPH.year === currentPH.year;
      } else if (range === "yearly") {
        return dPH.year === currentPH.year;
      }
      return false;
    };

    filteredBookings = filteredBookings.filter((b) =>
      filterByRange(b.created_at),
    );
    filteredPayroll = filteredPayroll.filter((p) =>
      filterByRange(p.ending_date),
    );

    // Calculate Totals
    const tRevenue = filteredBookings.reduce(
      (acc, curr) => acc + curr.grand_total,
      0,
    );
    const tPayroll = filteredPayroll.reduce(
      (acc, curr) => acc + curr.total_salary,
      0,
    );
    const nRevenue = tRevenue - tPayroll;
    const tOrders = filteredBookings.length;
    const avgOrder = tOrders > 0 ? tRevenue / tOrders : 0;

    const getBucketKey = (date: Date) => {
      const dPH = getPHParts(new Date(date));
      if (range === "daily") return dPH.hour;
      if (range === "weekly") return new Date(date).getDay(); // 0-6
      if (range === "monthly") return dPH.day; // 1-31
      if (range === "yearly") return dPH.month; // 0-11
      return 0;
    };

    const initBuckets = (): ChartBucket[] => {
      let bucketArray: Array<{
        name: string;
        total: number;
        originalIndex?: number;
      }> = [];
      if (range === "daily")
        bucketArray = Array.from({ length: 24 }, (_, i) => ({
          name: `${i}:00`,
          total: 0,
        }));
      else if (range === "weekly") {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const ordered: Array<{
          name: string;
          total: number;
          originalIndex: number;
        }> = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - (6 - i));
          ordered.push({
            name: days[d.getDay()],
            total: 0,
            originalIndex: d.getDay(),
          });
        }
        bucketArray = ordered;
      } else if (range === "monthly") {
        const daysInMonth = new Date(
          currentPH.year,
          currentPH.month + 1,
          0,
        ).getDate();
        bucketArray = Array.from({ length: daysInMonth }, (_, i) => ({
          name: String(i + 1),
          total: 0,
        }));
      } else if (range === "yearly") {
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        bucketArray = months.map((m) => ({ name: m, total: 0 }));
      }
      // Initialize expenses and net for all buckets
      return bucketArray.map((b) => ({ ...b, expenses: 0, net: 0 }));
    };

    const buckets = initBuckets();

    filteredPayroll.forEach((p) => {
      const pKey = getBucketKey(p.ending_date);
      let bucket;
      if (range === "weekly") {
        const dayIndex = new Date(p.ending_date).getDay();
        bucket = buckets.find((item) => item.originalIndex === dayIndex);
      } else if (range === "daily") {
        bucket = buckets[pKey];
      } else if (range === "monthly") {
        bucket = buckets[pKey - 1];
      } else if (range === "yearly") {
        bucket = buckets[pKey];
      }

      if (bucket) {
        bucket.expenses = (bucket.expenses || 0) + p.total_salary;
      }
    });

    filteredBookings.forEach((b) => {
      const bKey = getBucketKey(b.created_at);
      let bucket;
      if (range === "weekly") {
        const dayIndex = new Date(b.created_at).getDay();
        bucket = buckets.find((item) => item.originalIndex === dayIndex);
      } else if (range === "daily") {
        bucket = buckets[bKey];
      } else if (range === "monthly") {
        bucket = buckets[bKey - 1]; // day is 1-indexed
      } else if (range === "yearly") {
        bucket = buckets[bKey];
      }

      if (bucket) {
        bucket.total += b.grand_total;
        // Add category data to bucket
        if (b.availed_services && b.availed_services.length > 0) {
          b.availed_services.forEach((s) => {
            const cat = s.service.category || "Uncategorized";
            bucket[cat] = (bucket[cat] || 0) + s.price;
          });
        }
      }
    });

    // Calculate Net
    buckets.forEach((b) => {
      b.net = b.total - b.expenses;
    });

    const chartData = buckets;

    return {
      data: chartData,
      totalRevenue: tRevenue,
      totalPayroll: tPayroll,
      netRevenue: nRevenue,
      averageOrderValue: avgOrder,
    };
  }, [bookings, allBookings, payroll, range]);

  const isEmbedded = variant === "embedded";
  const reportsHref =
    reportsEnabled && businessSlug
      ? buildRevenueReportHref({ businessSlug, range })
      : null;

  // Get all unique categories for Stacked Bar colors
  const categories = useMemo(() => {
    const cats = new Set<string>();
    data.forEach((d) => {
      Object.keys(d).forEach((k) => {
        if (
          k !== "name" &&
          k !== "total" &&
          k !== "expenses" &&
          k !== "net" &&
          k !== "originalIndex"
        ) {
          cats.add(k);
        }
      });
    });
    return Array.from(cats);
  }, [data]);

  const colors = [
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#6366f1",
    "#14b8a6",
    "#f43f5e",
  ];

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden min-h-0 min-w-0",
        isEmbedded
          ? "border-0 shadow-none bg-transparent rounded-none"
          : "rounded-[32px] border-none shadow-lg shadow-zinc-200/50 bg-white",
        className,
      )}
    >
      <CardHeader
        className={cn(
          "pb-4 space-y-4",
          isEmbedded ? "px-4 pt-4" : "md:px-8 md:pt-8",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 truncate">
              Financial Overview
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-zinc-500 font-medium truncate">
              Revenue, expenses, and net income
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select
              value={range}
              onValueChange={(value) => setRange(value as ChartRange)}
            >
              <SelectTrigger className="w-[120px] sm:w-[130px] rounded-xl h-9 sm:h-10 border-zinc-200 bg-zinc-50 font-medium text-xs">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="daily">Today</SelectItem>
                <SelectItem value="weekly">Last 7 Days</SelectItem>
                <SelectItem value="monthly">This Month</SelectItem>
                <SelectItem value="yearly">This Year</SelectItem>
              </SelectContent>
            </Select>
            {reportsHref ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="rounded-xl h-10 w-10 border-zinc-200 bg-white"
              >
                <Link href={reportsHref} aria-label="Open revenue reports">
                  <Eye className="h-4 w-4 text-zinc-500" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <div className="space-y-0.5 min-w-0">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider truncate">
              Net Revenue
            </div>
            <div
              className="text-xl lg:text-2xl font-bold text-emerald-900 truncate"
              title={`₱${netRevenue.toLocaleString()}`}
            >
              ₱{netRevenue.toLocaleString()}
            </div>
            <div className="text-[10px] font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full truncate">
              Gross: ₱{totalRevenue.toLocaleString()}
            </div>
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider truncate">
              Expenses
            </div>
            <div
              className="text-xl lg:text-2xl font-bold text-red-700 truncate"
              title={`₱${totalPayroll.toLocaleString()}`}
            >
              ₱{totalPayroll.toLocaleString()}
            </div>
            <div className="text-[10px] font-medium text-zinc-500 truncate">
              Payroll
            </div>
          </div>
          <div className="hidden lg:block space-y-0.5 min-w-0">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider truncate">
              Avg. Order
            </div>
            <div
              className="text-xl lg:text-2xl font-bold text-zinc-900 truncate"
              title={`₱${averageOrderValue.toLocaleString()}`}
            >
              ₱
              {averageOrderValue.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-[10px] font-medium text-zinc-600 truncate">
              Per booking
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          "py-4 flex-1 min-h-[220px] min-w-0 pb-4",
          isEmbedded ? "px-4" : "px-4 md:px-8",
        )}
      >
        {isClient ? (
          <div className="h-full w-full min-h-[220px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={220}
            >
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f4f4f5"
                />
                <XAxis
                  dataKey="name"
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={16}
                  fontWeight={500}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    `₱${value >= 1000 ? `${value / 1000}k` : value}`
                  }
                  width={60}
                  fontWeight={500}
                />
                <Tooltip
                  cursor={{ fill: "#f4f4f5", radius: 8 }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const tooltipItems = payload as Array<{
                        name?: string;
                        color?: string;
                        value?: number | string;
                      }>;
                      const totalValue = tooltipItems.reduce(
                        (acc, curr) => acc + Number(curr.value ?? 0),
                        0,
                      );
                      return (
                        <div className="rounded-xl border-none bg-zinc-900 p-4 shadow-xl text-white ring-1 ring-white/10 min-w-[150px]">
                          <div className="font-bold text-sm mb-2 text-zinc-300">
                            {label}
                          </div>
                          {tooltipItems.map((p) => (
                            <div
                              key={p.name}
                              className="flex items-center justify-between gap-4 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: p.color }}
                                />
                                <span className="text-zinc-400 capitalize">
                                  {p.name}
                                </span>
                              </div>
                              <span className="font-semibold">
                                ₱{Number(p.value ?? 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center">
                            <span className="text-xs font-bold uppercase text-zinc-400">
                              Total
                            </span>
                            <span className="font-bold text-emerald-400">
                              ₱{totalValue.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {categories.length > 0 ? (
                  categories.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="a"
                      fill={colors[i % colors.length]}
                      radius={[0, 0, 0, 0]}
                    />
                  ))
                ) : (
                  <Bar
                    dataKey="total"
                    fill="#10b981"
                    radius={[6, 6, 6, 6]}
                    barSize={range === "daily" ? 24 : 40}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
            Loading chart...
          </div>
        )}
      </CardContent>
    </Card>
  );
}


