import { cn } from "@/lib/utils";

export function StatPill({
  icon: Icon,
  label,
  value,
  accent = false,
  flat = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Highlight with primary color (use for the most important metric). */
  accent?: boolean;
  /**
   * Drop the per-pill border & rounded corners. Use when StatPills are
   * placed inside a single bordered shell that already provides the
   * card surface (e.g. a hairline-divided strip), to avoid a
   * card-in-card look.
   */
  flat?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 min-w-0",
        flat
          ? accent
            ? "bg-primary/5"
            : "bg-card"
          : accent
            ? "bg-primary text-primary-foreground rounded-2xl"
            : "bg-card border border-border rounded-2xl",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          accent
            ? flat
              ? "bg-primary/15"
              : "bg-white/20"
            : "bg-primary/10",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            accent
              ? flat
                ? "text-primary"
                : "text-primary-foreground"
              : "text-primary",
          )}
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider truncate",
            accent
              ? flat
                ? "text-primary/80"
                : "text-primary-foreground/70"
              : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "text-xl font-bold leading-tight tabular-nums",
            accent
              ? flat
                ? "text-primary"
                : "text-primary-foreground"
              : "text-foreground",
          )}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}
