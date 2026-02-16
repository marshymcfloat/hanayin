"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  const valueFormatter = (value: number) => {
    if (mode === "currency") return `PHP ${value.toLocaleString("en-PH")}`;
    if (mode === "percent") return `${value.toFixed(1)}%`;
    return value.toLocaleString("en-PH");
  };

  if (!data.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        No trend data for this date range.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              mode === "currency"
                ? `PHP ${Number(value).toLocaleString("en-PH", {
                    maximumFractionDigits: 0,
                  })}`
                : mode === "percent"
                  ? `${Number(value).toFixed(0)}%`
                  : Number(value).toLocaleString("en-PH")
            }
          />
          <Tooltip
            formatter={(value) =>
              valueFormatter(
                typeof value === "number" ? value : Number.parseFloat(String(value)),
              )
            }
          />
          <Legend />
          {series.map((item) => (
            <Line
              key={item.dataKey}
              type="monotone"
              dataKey={item.dataKey}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
