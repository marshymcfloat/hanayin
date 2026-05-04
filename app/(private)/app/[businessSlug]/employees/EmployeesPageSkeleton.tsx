import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function EmployeesPageSkeleton() {
  return (
    <div className="flex flex-col bg-background min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 pt-5 pb-4 sm:py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 sm:h-7 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            <Skeleton className="hidden sm:block h-10 w-36 rounded-xl" />
          </div>

          {/* KPI strip — flat tiles divided by hairlines */}
          <div className="mt-5 sm:mt-6 -mx-4 sm:mx-0 overflow-hidden">
            <div className="px-4 sm:px-0 grid grid-cols-2 sm:grid-cols-4 gap-y-4 sm:gap-y-0 sm:divide-x sm:divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-0 sm:px-5 sm:first:pl-0 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 flex-1">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          {/* Search / refresh */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            </div>
            <div className="flex items-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-full" />
              ))}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-1 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-card rounded-2xl border border-border overflow-hidden"
              >
                <div className="flex items-start gap-3 p-4 pb-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded-md" />
                </div>
                <div className="px-4 grid grid-cols-2 border-t border-border divide-x divide-border">
                  {Array.from({ length: 2 }).map((_, j) => (
                    <div key={j} className={j === 0 ? "pr-3 py-3" : "pl-3 py-3"}>
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-16 mt-1.5" />
                    </div>
                  ))}
                </div>
                <div className="px-4 grid grid-cols-2 border-t border-border divide-x divide-border">
                  {Array.from({ length: 2 }).map((_, j) => (
                    <div key={j} className={j === 0 ? "pr-3 py-3" : "pl-3 py-3"}>
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-16 mt-1.5" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 border-t border-border bg-muted/30">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="h-11 flex items-center justify-center">
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl border border-border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border bg-muted/40">
                  <TableHead className="w-[300px] pl-6 h-12">
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                  <TableHead className="h-12">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead className="h-12">
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                  <TableHead className="h-12">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead className="h-12">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead className="h-12">
                    <Skeleton className="h-3 w-20" />
                  </TableHead>
                  <TableHead className="text-right pr-6 h-12">
                    <Skeleton className="h-3 w-12 ml-auto" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent border-border/60">
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-6 w-12 rounded-full" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="h-6 w-8 rounded-md" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6 py-4">
                      <Skeleton className="h-9 w-9 rounded-md ml-auto" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
