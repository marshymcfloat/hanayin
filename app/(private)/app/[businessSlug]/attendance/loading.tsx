import { AttendanceSkeleton } from "@/components/dashboard/attendance/AttendanceSkeleton";
import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";

export default function Loading() {
  return <OwnerRouteLoading section="attendance" staffFallback={<AttendanceSkeleton />} />;
}
