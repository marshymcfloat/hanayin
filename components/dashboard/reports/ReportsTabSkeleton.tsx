import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-muted/60", className)} />
  );
}

export function ReportsTabSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Shimmer className="h-[100px] rounded-2xl" />
        <Shimmer className="h-[100px] rounded-2xl" />
        <Shimmer className="h-[100px] rounded-2xl hidden sm:block" />
        <Shimmer className="h-[100px] rounded-2xl hidden xl:block" />
      </div>

      {/* Supporting KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Shimmer key={i} className="h-[76px]" />
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Shimmer className="h-4 w-36 rounded-lg" />
        <Shimmer className="h-[200px] rounded-lg" />
      </div>

      {/* Tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Shimmer className="h-4 w-44 rounded-lg" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <Shimmer key={j} className="h-9 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
