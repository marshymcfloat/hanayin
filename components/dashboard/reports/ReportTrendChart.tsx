"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesItem = {
  dataKey: string;
  label: string;
  color: string;
};

function formatValue(value: number, mode: string): string {
  if (mode === "currency") {
    if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}k`;
    return `₱${value.toLocaleString("en-PH")}`;
  }
  if (mode === "percent") return `${value.toFixed(1)}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-PH");
}

function formatValueFull(value: number, mode: string): string {
  if (mode === "currency") {
    return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (mode === "percent") return `${value.toFixed(2)}%`;
  return value.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function CustomLegend({ series }: { series: SeriesItem[] }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 20, paddingTop: 12, flexWrap: "wrap" }}>
      {series.map((item) => (
        <div key={item.dataKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 24,
              height: 3,
              borderRadius: 2,
              background: item.color,
            }}
          />
          <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReportTrendChart<TData extends { label: string }>({
  data,
  series,
  mode = "number",
}: {
  data: TData[];
  series: Array<{
    dataKey: Extract<keyof TData, string>;
    label: string;
    color: string;
  }>;
  mode?: "number" | "currency" | "percent";
}) {
  if (!data.length) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
        No trend data for this date range.
      </div>
    );
  }

  const seriesTyped = series as SeriesItem[];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {seriesTyped.map((item) => (
              <linearGradient key={item.dataKey} id={`gradient-${item.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={item.color} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="4 4"
            stroke="var(--border)"
            strokeOpacity={0.6}
            vertical={false}
          />

          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            dy={6}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => formatValue(Number(value), mode)}
            width={58}
          />

          <Tooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "10px 14px",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
                    minWidth: 160,
                  }}
                >
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8, fontWeight: 500 }}>
                    {label}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {payload.map((entry) => {
                      const s = seriesTyped.find((s) => s.dataKey === entry.dataKey);
                      const numVal = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
                      return (
                        <div key={String(entry.dataKey)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: s?.color ?? String(entry.color ?? "#888"),
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                            {s?.label ?? entry.name}:
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginLeft: "auto", paddingLeft: 8 }}>
                            {formatValueFull(numVal, mode)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />

          {seriesTyped.map((item) => (
            <Area
              key={item.dataKey}
              type="monotone"
              dataKey={item.dataKey}
              name={item.label}
              stroke={item.color}
              strokeWidth={2.5}
              fill={`url(#gradient-${item.dataKey})`}
              dot={false}
              activeDot={{
                r: 5,
                fill: item.color,
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <CustomLegend series={seriesTyped} />
    </div>
  );
}
