export function OwnerCatalogPreviewSkeleton({ label }: { label: string }) {
  return (
    <main
      aria-busy="true"
      aria-label={`Loading ${label}`}
      className="min-h-dvh bg-[#F5F6F3] pb-24 md:pl-[128px]"
    >
      <div className="mx-auto max-w-[1680px] animate-pulse space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
        <div className="h-44 max-w-2xl rounded-[24px] bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-40 rounded-[26px] bg-white" />
          ))}
        </div>
        <div className="h-[560px] rounded-[24px] bg-white sm:rounded-[30px]" />
      </div>
    </main>
  );
}
