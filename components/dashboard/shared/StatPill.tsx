import { cn } from "@/lib/utils";

export function StatPill({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 min-w-0",
        accent
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          accent ? "bg-white/20" : "bg-primary/10",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            accent ? "text-primary-foreground" : "text-primary",
          )}
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider truncate",
            accent ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "text-xl font-bold leading-tight tabular-nums",
            accent ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}
