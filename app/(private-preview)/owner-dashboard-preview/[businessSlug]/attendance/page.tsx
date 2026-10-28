import { OwnerAttendancePreviewRoute } from "@/components/dashboard/owner-preview/OwnerAttendancePreviewQuery";

export const metadata = { title: "Attendance Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function AttendancePreviewPage() {
  return <OwnerAttendancePreviewRoute />;
}
