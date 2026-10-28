import { ArrowRight, Calendar, Sparkles, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ownerStyles from "@/components/bookings/OwnerBookingForm.module.css";

export function OwnerBookingCatalogSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading service catalog"
      className="min-w-0 w-full overflow-hidden rounded-[20px] border border-[#E7E9E4] bg-[#FAFBF8] p-3 sm:p-4"
    >
      <span className="sr-only">Loading services and packages.</span>
      <div aria-hidden="true" className="space-y-3 animate-pulse motion-reduce:animate-none">
        <div className="grid h-12 grid-cols-2 gap-2 rounded-xl bg-[#F5F6F3] p-1">
          <div className="rounded-lg bg-[#E4E8DF]" />
          <div className="rounded-lg bg-[#E9ECE6]" />
        </div>
        <div className="h-11 rounded-xl border border-[#DDE0D9] bg-[#F5F6F3]" />
        <div className="flex flex-wrap gap-2 border-y border-[#E7E9E4] py-3">
          {[44, 104, 176, 152, 96, 128].map((width) => <div key={width} style={{ width }} className="h-8 max-w-full rounded-full bg-[#E9ECE6]" />)}
        </div>
        <div className="max-h-[min(56dvh,560px)] space-y-2 overflow-hidden">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex min-h-[72px] items-center gap-3 rounded-[18px] border border-[#E7E9E4] bg-white p-3.5">
              <div className="size-10 shrink-0 rounded-[13px] bg-[#E9ECE6]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-3/5 rounded bg-[#E4E8DF]" />
                <div className="h-2.5 w-4/5 rounded bg-[#E9ECE6]" />
              </div>
              <div className="h-3 w-12 shrink-0 rounded bg-[#E4E8DF]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OwnerBookingFormLoading() {
  return (
    <div className={cn("relative flex flex-col gap-4 lg:flex-row lg:gap-6", ownerStyles.form)}>
      <div className="min-w-0 flex flex-1 flex-col gap-4 pb-2 sm:gap-5 sm:pb-4">
        <div className="sticky top-0 z-20 rounded-[16px] border border-[#E7E9E4] bg-[#FAFBF8] px-2 py-1.5 sm:px-3 sm:py-2">
          <div role="list" aria-label="Booking progress" className="grid grid-cols-4 gap-1.5">
            {["Services", "Schedule", "Customer", "Review"].map((label, index) => (
              <button key={label} type="button" disabled aria-current={index === 0 ? "step" : undefined} className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center rounded-lg px-0.5 py-0.5", index === 0 && "bg-[#EFF9E8]")}>
                <span className={cn("mb-0.5 grid size-5 place-items-center rounded-full border text-[10px] font-bold", index === 0 ? "border-[#20211F] bg-[#20211F] text-[#B9F379]" : "border-[#E7E9E4] bg-white text-[#696C67]")}>{index + 1}</span>
                <span className="block max-w-full truncate text-[9px] font-semibold leading-3 text-[#343633] sm:text-[10px]">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4 py-1 sm:py-2">
          <div className="mb-2 flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#EFF9E8] text-[#315E18]"><Sparkles className="size-4" aria-hidden="true" /></span>
            <h3 className="mt-0.5 text-lg font-bold tracking-[-0.025em] text-[#20211F] sm:text-xl">Choose services</h3>
          </div>
          <OwnerBookingCatalogSkeleton />
        </div>
        <div className="sticky bottom-0 z-20 hidden items-end justify-end border-t border-[#E7E9E4] bg-white/95 pt-5 pb-2 lg:flex">
          <button type="button" disabled className="inline-flex h-11 min-w-40 items-center justify-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-semibold text-white opacity-50">Continue<ArrowRight className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
      <aside aria-label="Booking summary" className="hidden min-w-0 lg:block lg:w-[272px] lg:shrink-0 xl:w-[300px]">
        <div className="sticky top-3 overflow-hidden rounded-[20px] border border-[#DDE2D7] bg-[#F7F8F4] shadow-[0_10px_28px_rgba(32,33,31,0.06)]">
          <div className="flex items-center gap-2.5 bg-[#20211F] px-3.5 py-3 text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-[#B9F379] text-[#20211F]"><Sparkles className="size-4" aria-hidden="true" /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">In progress</p><h3 className="text-base font-bold tracking-[-0.025em]">Booking summary</h3></div>
          </div>
          <div className="space-y-3 p-3">
            <section><p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#343633]"><Sparkles className="size-3.5 text-[#4D842D]" aria-hidden="true" />Treatments</p><p className="rounded-xl border border-dashed border-[#DDE0D9] bg-white px-3 py-3 text-xs text-[#696C67]">Choose a treatment to begin.</p></section>
            <section className="border-t border-[#E1E5DC] pt-2.5"><p className="flex items-center gap-1.5 text-xs font-bold text-[#343633]"><Calendar className="size-3.5 text-[#4D842D]" aria-hidden="true" />Schedule</p><p className="mt-1 text-xs text-[#5E625B]">Schedule not selected</p></section>
            <section className="border-t border-[#E1E5DC] pt-2.5"><p className="flex items-center gap-1.5 text-xs font-bold text-[#343633]"><User2 className="size-3.5 text-[#4D842D]" aria-hidden="true" />Customer</p><p className="mt-1 text-xs text-[#5E625B]">Add customer details</p></section>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-[#D5E5C9] bg-[#EEF7E7] px-3.5 py-3"><span className="text-xs font-semibold">Estimated total</span><strong className="font-mono text-lg tabular-nums">₱0.00</strong></div>
        </div>
      </aside>
      <div className="sticky bottom-0 z-40 -mx-5 rounded-t-[18px] border-t border-[#E7E9E4] bg-[#FAFBF8] px-5 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-wide text-[#696C67]">0 treatment units</p><p className="truncate text-base font-bold tabular-nums">₱0.00</p></div>
          <button type="button" disabled className="inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-semibold text-white opacity-50">Continue<ArrowRight className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
