import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function GiftCardsPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50/50 p-4 md:p-8">
      <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>

        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          <Skeleton className="hidden h-10 w-24 rounded-xl md:block" />
        </div>

        <div className="flex-1">
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-36 rounded-lg" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-zinc-50 pt-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <Table>
              <TableHeader className="bg-zinc-50/80">
                <TableRow>
                  <TableHead className="pl-6">
                    <Skeleton className="h-4 w-28" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-16" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-4 w-16" />
                  </TableHead>
                  <TableHead className="pr-6 text-right">
                    <Skeleton className="ml-auto h-4 w-12" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-4 pl-6">
                      <Skeleton className="h-7 w-32 rounded-lg" />
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="space-y-1">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex gap-1">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="py-4 pr-6 text-right">
                      <Skeleton className="ml-auto h-8 w-8 rounded-md" />
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
