import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex flex-col p-4 md:p-8 bg-background min-h-screen">
      <section className="flex-1 flex flex-col max-w-4xl mx-auto w-full space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64 bg-zinc-200" />
            <Skeleton className="h-5 w-96 bg-zinc-100" />
          </div>
          <Skeleton className="h-10 w-[140px] rounded-xl bg-zinc-200" />
        </div>

        <div className="w-full space-y-6">
          <div className="flex flex-wrap gap-2">
            {[140, 100, 80, 100].map((w, i) => (
              <Skeleton
                key={i}
                className="h-10 rounded-full bg-zinc-200"
                style={{ width: w }}
              />
            ))}
          </div>

          <Card className="rounded-3xl border-zinc-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-white border-b border-zinc-100 space-y-2">
              <Skeleton className="h-7 w-64 bg-zinc-200" />
              <Skeleton className="h-4 w-80 bg-zinc-100" />
            </CardHeader>
            <CardContent className="space-y-4 p-6 bg-white">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-zinc-200 bg-white"
                >
                  <div className="w-40 flex items-center gap-3">
                    <Skeleton className="h-6 w-10 rounded-full bg-zinc-200" />
                    <Skeleton className="h-5 w-20 bg-zinc-200" />
                  </div>

                  <div className="flex-1 flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-[110px] rounded-lg bg-zinc-100" />
                      <span className="text-zinc-200 font-medium">-</span>
                      <Skeleton className="h-10 w-[110px] rounded-lg bg-zinc-100" />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
