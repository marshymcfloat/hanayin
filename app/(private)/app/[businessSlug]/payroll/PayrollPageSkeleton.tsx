import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PayrollPageSkeleton() {
  return (
    <div className="flex flex-col p-4 md:p-8 bg-background min-h-screen">
      <section className="flex-1 flex flex-col w-full max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-48 mb-2 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded-lg" />
          </div>
          <div className="relative w-full md:w-96">
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="lg:hidden grid grid-cols-1 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex flex-col gap-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-32 rounded-md" />
                    <Skeleton className="h-3 w-40 rounded-md" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-50">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>

          <div className="hidden lg:block rounded-3xl border border-zinc-100 overflow-hidden shadow-sm bg-white">
            <Card className="shadow-none border-0">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-zinc-50/80">
                    <TableRow className="hover:bg-transparent border-zinc-100">
                      <TableHead className="pl-6 h-12 w-[300px]">
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                      <TableHead className="h-12">
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                      <TableHead className="h-12">
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                      <TableHead className="h-12">
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                      <TableHead className="text-right pr-6 h-12 w-[180px]">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-zinc-100">
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-full" />
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
                          <div className="flex flex-col gap-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4">
                          <Skeleton className="h-9 w-28 ml-auto rounded-md" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
