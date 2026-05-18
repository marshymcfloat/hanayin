import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col p-4 md:p-8 bg-background min-h-screen">
      <section className="flex-1 flex flex-col w-full max-w-7xl mx-auto space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-48 mb-2 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        <div className="flex-1">
          <div className="space-y-6">
            {/* Mobile Card Skeleton */}
            <div className="lg:hidden grid grid-cols-1 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-5 w-32 rounded-md" />
                        <Skeleton className="h-3 w-40 rounded-md" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 pt-2 border-t border-zinc-50">
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Skeleton */}
            <div className="hidden lg:block rounded-3xl border border-zinc-100 overflow-hidden shadow-sm bg-white">
              <div className="p-0">
                <div className="bg-zinc-50/80 border-b border-zinc-100 flex items-center h-12 px-6">
                  <Skeleton className="h-4 w-24 mr-auto" />
                  <Skeleton className="h-4 w-20 ml-auto mr-12" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
                <div className="divide-y divide-zinc-100">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center py-4 px-6">
                      <div className="flex items-center gap-3 mr-auto min-w-[300px]">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Skeleton className="h-3 w-3" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <div className="ml-auto w-[80px] flex justify-end">
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
