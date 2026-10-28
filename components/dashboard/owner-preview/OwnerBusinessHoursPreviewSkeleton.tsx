export function OwnerBusinessHoursPreviewSkeleton() {
  return <main aria-busy="true" aria-label="Loading business hours preview" className="min-h-dvh bg-[#F5F6F3] pb-24 md:pl-[128px]">
    <div className="mx-auto max-w-[1680px] animate-pulse space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
      <div className="h-40 max-w-2xl rounded-[24px] bg-white" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 rounded-[26px] bg-white" />)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]"><div className="h-[690px] rounded-[30px] bg-white" /><div className="h-[580px] rounded-[30px] bg-white" /></div>
    </div>
  </main>;
}
