import type { PortalShellProps } from "@/components/portal/PortalShell";
import { cn } from "@/lib/utils";

export type EmployeePortalShellProps = PortalShellProps;

export function EmployeePortalShell({
  greeting,
  heroKpi,
  children,
  manager,
  managerLabel = "Floor operations",
  className,
}: EmployeePortalShellProps) {
  return (
    <div className={cn("min-h-full bg-[#F5F6F3] text-[#20211F]", className)}>
      {greeting}
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <div className="space-y-5 lg:space-y-6">
          {heroKpi}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-5 xl:grid-cols-12">
            {children}
          </div>
          {manager ? (
            <section className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#696C67]">
                  {managerLabel}
                </h2>
                <span className="h-px flex-1 bg-[#E7E9E4]" aria-hidden="true" />
              </div>
              {manager}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
