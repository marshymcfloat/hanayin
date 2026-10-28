import DashboardDispatcher from "@/components/dashboard/DashboardDispatcher";
import EmployeeDashboardSkeleton from "@/components/skeletons/EmployeeDashboardSkeleton";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<EmployeeDashboardSkeleton />}>
      <DashboardDispatcher />
    </Suspense>
  );
}
