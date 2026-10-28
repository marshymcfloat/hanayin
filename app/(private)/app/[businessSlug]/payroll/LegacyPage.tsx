import { Suspense } from "react";
import { PayrollPageSkeleton } from "./PayrollPageSkeleton";
import { PayrollContent } from "./PayrollContent";

export default function PayrollPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={<PayrollPageSkeleton />}>
      <PayrollContent params={params} />
    </Suspense>
  );
}
