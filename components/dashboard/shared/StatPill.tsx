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
        "flex min-h-[104px] min-w-0 items-center gap-3 px-4 py-4 sm:px-5",
        flat
          ? accent
            ? "bg-[#EFF9E8]"
            : "bg-white"
          : accent
            ? "rounded-[24px] bg-[#20211F] text-white shadow-[0_18px_45px_rgba(32,33,31,0.13)]"
            : "rounded-[24px] border border-[#E7E9E4] bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)]",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[14px]",
          accent
            ? flat
              ? "bg-[#B9F379]"
              : "bg-[#B9F379]"
            : "bg-[#EFF9E8]",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 text-[#20211F]",
          )}
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-[10px] font-bold uppercase tracking-[0.14em]",
            accent
              ? flat
                ? "text-[#696C67]"
                : "text-white/70"
              : "text-[#696C67]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "font-mono text-2xl font-semibold leading-tight tabular-nums",
            accent
              ? flat
                ? "text-[#20211F]"
                : "text-white"
              : "text-[#20211F]",
          )}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}
