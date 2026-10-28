export function OwnerPreviewContentSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading owner dashboard preview" className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]">
      <div className="mx-auto max-w-[1680px] animate-pulse space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
        <div className="h-40 max-w-2xl rounded-[24px] bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 rounded-[26px] bg-white" />)}</div>
        <div className="h-[560px] rounded-[30px] bg-white" />
      </div>
    </main>
  );
}
