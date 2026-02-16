import React from "react";
import { LucideIcon, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  count: number | string;
  description: string;
  Icon?: LucideIcon;
  variant?: "filled" | "light";
}

export default function DashboardCard({
  title,
  count,
  description,
  variant = "light",
  Icon,
}: DashboardCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] p-6 transition-all duration-300",
        variant === "filled"
          ? "bg-linear-to-br from-emerald-900 to-emerald-950 text-white shadow-xl shadow-emerald-900/20"
          : "bg-white text-zinc-900 shadow-lg shadow-zinc-200/50 hover:shadow-xl hover:shadow-zinc-200/60 border border-zinc-100",
      )}
    >
      {/* Decorative background for filled variant */}
      {variant === "filled" && (
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      )}

      <div className="relative z-10 flex flex-col justify-between h-full min-h-[140px]">
        <div className="flex justify-between items-start">
          <div
            className={cn(
              "p-2.5 rounded-2xl transition-transform hover:scale-110",
              variant === "filled"
                ? "bg-emerald-500/20 text-emerald-100"
                : "bg-zinc-50 text-zinc-600 border border-zinc-100",
            )}
          >
            {Icon ? (
              <Icon size={20} strokeWidth={2} />
            ) : (
              <ArrowUpRight size={20} />
            )}
          </div>
        </div>

        <div className="space-y-1 mt-4 min-w-0">
          <h3
            className={cn(
              "text-sm font-medium tracking-wide truncate pr-2",
              variant === "filled" ? "text-emerald-200/80" : "text-zinc-500",
            )}
            title={title}
          >
            {title}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl lg:text-4xl font-bold tracking-tight truncate w-full"
              title={typeof count === "string" ? count : count.toLocaleString()}
            >
              {typeof count === "number" ? count.toLocaleString() : count}
            </span>
          </div>
          <p
            className={cn(
              "text-xs font-medium pt-1 flex items-center gap-1 truncate",
              variant === "filled" ? "text-emerald-400" : "text-emerald-600",
            )}
            title={description}
          >
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
