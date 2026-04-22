import React from "react";
import { LucideIcon } from "lucide-react";
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
        "relative overflow-hidden rounded-2xl p-5 transition-all duration-200",
        variant === "filled"
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border hover:border-primary/30 hover:shadow-md hover:shadow-primary/5",
      )}
    >
      {/* Decorative orb for filled variant */}
      {variant === "filled" && (
        <>
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5" />
        </>
      )}

      <div className="relative z-10 flex flex-col gap-4">
        {/* Icon */}
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            variant === "filled"
              ? "bg-white/20"
              : "bg-primary/10",
          )}
        >
          {Icon && (
            <Icon
              className={cn(
                "h-4.5 w-4.5",
                variant === "filled" ? "text-primary-foreground" : "text-primary",
              )}
              strokeWidth={2}
            />
          )}
        </div>

        {/* Value */}
        <div className="space-y-0.5">
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              variant === "filled"
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "text-2xl font-bold tracking-tight",
              variant === "filled" ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {typeof count === "number" ? count.toLocaleString() : count}
          </p>
          <p
            className={cn(
              "text-xs font-medium",
              variant === "filled"
                ? "text-primary-foreground/60"
                : "text-primary",
            )}
          >
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
