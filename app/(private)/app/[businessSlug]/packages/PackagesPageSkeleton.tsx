import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PackagesPageSkeleton() {
  return (
    <div className="flex flex-col p-4 md:p-8 bg-background min-h-screen">
      <section className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>

        {/* Search & Filter Skeleton */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-1 max-w-2xl">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-full sm:w-[180px] rounded-xl" />
          </div>
          <Skeleton className="h-10 w-24 rounded-xl hidden md:block" />
        </div>

        {/* Content Skeleton */}
        <div className="flex-1">
          {/* Mobile Card Skeleton */}
          <div className="md:hidden grid grid-cols-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex flex-col gap-3"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-50 mt-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Skeleton */}
          <div className="hidden md:block rounded-3xl border border-zinc-100 overflow-hidden shadow-sm bg-white">
            <Table>
              <TableHeader className="bg-zinc-50/80">
                <TableRow>
                  <TableHead className="w-[300px] pl-6">
                    <Skeleton className="h-4 w-24" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-32" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-16" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Skeleton className="h-4 w-16 ml-auto" />
                  </TableHead>
                  <TableHead className="text-right pr-6">
                    <Skeleton className="h-4 w-8 ml-auto" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6 py-4">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex gap-1">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-5 w-16" />
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <Skeleton className="h-5 w-20 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right pr-6 py-4">
                      <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}
