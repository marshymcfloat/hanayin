import { Suspense } from "react";
import { EmployeesPageSkeleton } from "./EmployeesPageSkeleton";
import { EmployeesContent } from "./EmployeesContent";

export default function EmployeesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={<EmployeesPageSkeleton />}>
      <EmployeesContent params={params} />
    </Suspense>
  );
}
