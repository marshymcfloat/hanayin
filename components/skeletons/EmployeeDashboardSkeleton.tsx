import { Skeleton } from "@/components/ui/skeleton";

export default function EmployeeDashboardSkeleton() {
  return (
    <div className="min-h-full bg-[#F5F6F3] text-[#20211F]" aria-label="Loading staff workspace">
      <div className="border-b border-[#E7E9E4] bg-white">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full bg-[#EFF9E8]" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-7 w-44 rounded-lg sm:w-56" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-full bg-[#EFF9E8]" />
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] space-y-5 px-4 pb-10 pt-5 sm:px-6 lg:space-y-6 lg:px-8 lg:pt-7">
        <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-3">
          <div className="col-span-2 rounded-[28px] bg-[#20211F] p-5 shadow-[0_18px_45px_rgba(32,33,31,0.13)] sm:p-6 xl:col-span-1">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-3 w-32 rounded-full bg-white/15" />
              <Skeleton className="size-9 rounded-xl bg-[#B9F379]" />
            </div>
            <Skeleton className="mt-5 h-9 w-44 max-w-full rounded-lg bg-white/20" />
            <Skeleton className="mt-3 h-3 w-40 max-w-full rounded-full bg-white/15" />
          </div>
          {[0, 1].map((item) => (
            <div key={item} className="rounded-[28px] border border-[#E7E9E4] bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="size-9 rounded-xl bg-[#EFF9E8]" />
              </div>
              <Skeleton className="mt-5 h-9 w-16 rounded-lg" />
              <Skeleton className="mt-3 h-3 w-28 max-w-full rounded-full" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-5 xl:grid-cols-12">
          <section className="rounded-[28px] border border-[#E7E9E4] bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6 md:col-span-2 xl:col-span-4">
            <CardHeading />
            <Skeleton className="mt-5 h-4 w-40 max-w-full" />
            <Skeleton className="mt-3 h-3 w-28 max-w-full rounded-full" />
            <Skeleton className="mt-6 h-12 w-full rounded-xl bg-[#EFF9E8]" />
            <Skeleton className="mt-4 h-3 w-32 max-w-full rounded-full" />
          </section>
          <section className="rounded-[28px] border border-[#E7E9E4] bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-6 md:col-span-2 xl:col-span-8">
            <CardHeading />
            <div className="mt-5 grid min-h-11 grid-cols-3 gap-2 rounded-2xl bg-[#F5F6F3] p-1">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 rounded-xl" />)}
            </div>
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full rounded-2xl" />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CardHeading() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 shrink-0 rounded-[14px] bg-[#B9F379]" />
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-20 rounded-full" />
        <Skeleton className="h-5 w-36 max-w-full rounded-lg" />
      </div>
    </div>
  );
}
