import { Skeleton } from "@/components/ui/skeleton";
import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";

export default function Loading() {
  return <OwnerRouteLoading section="sale events" staffFallback={<StaffLoading />} />;
}

function StaffLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-10 w-10 rounded-xl bg-zinc-200" />
              <Skeleton className="h-8 w-48 bg-zinc-200" />
            </div>
            <Skeleton className="h-4 w-96 bg-zinc-100" />
          </div>
          <Skeleton className="h-10 w-40 rounded-full bg-zinc-200" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-3xl border border-zinc-200 bg-white p-6 space-y-4"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-3/4 bg-zinc-200" />
                  <Skeleton className="h-4 w-1/2 bg-zinc-100" />
                </div>
                <Skeleton className="h-8 w-20 rounded-full bg-zinc-100" />
              </div>

              <div className="space-y-2 pt-4 border-t border-zinc-100">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24 bg-zinc-100" />
                  <Skeleton className="h-4 w-16 bg-zinc-100" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20 bg-zinc-100" />
                  <Skeleton className="h-4 w-24 bg-zinc-100" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Skeleton className="h-8 w-8 rounded-lg bg-zinc-100" />
                <Skeleton className="h-8 w-8 rounded-lg bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
