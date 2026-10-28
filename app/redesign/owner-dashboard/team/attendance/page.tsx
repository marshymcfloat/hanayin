import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerTeamWorkspace from "@/components/dashboard/design-study/OwnerTeamWorkspace";
import { OwnerAttendancePreviewRoute } from "@/components/dashboard/owner-preview/OwnerAttendancePreviewQuery";

export const metadata: Metadata = { title: { absolute: "Attendance — HANAYIN" }, description: "Review attendance, recorded hours, and leave requests.", robots: { index: false, follow: false } };
export default function AttendancePage() {
  return <OwnerTeamWorkspace page="attendance" fontClassName={redesignBodyFont.variable}><OwnerAttendancePreviewRoute redesign fontClassName={redesignBodyFont.variable} /></OwnerTeamWorkspace>;
}
