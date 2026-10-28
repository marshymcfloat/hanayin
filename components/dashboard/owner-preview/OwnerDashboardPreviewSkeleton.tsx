export function OwnerDashboardPreviewSkeleton() {
  return (
    <main className="min-h-dvh bg-[#F5F6F3] p-5 md:pl-32 md:pt-10" aria-busy="true" aria-label="Loading owner dashboard preview">
      <div className="mx-auto max-w-[1680px] animate-pulse space-y-5">
        <div className="h-20 max-w-xl rounded-3xl bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 rounded-[28px] bg-white" />)}
        </div>
        <div className="h-[520px] rounded-[32px] bg-white" />
      </div>
    </main>
  );
}
