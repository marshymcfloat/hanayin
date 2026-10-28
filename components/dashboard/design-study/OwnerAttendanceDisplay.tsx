import ui from "@/components/dashboard/design-study/owner-attendance.module.css";

export const attendanceLabels = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", OFF: "Off", LEAVE: "On leave", UNRECORDED: "Not recorded", PENDING: "Pending", APPROVED: "Approved", REJECTED: "Declined" };
const dateFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
export const attendanceDateLabel = (date: string | Date) => dateFormat.format(typeof date === "string" ? new Date(date.length === 10 ? `${date}T12:00:00+08:00` : date) : date);
export const attendanceTimeLabel = (date: string | Date | null) => date ? timeFormat.format(new Date(date)) : "Not recorded";
export function AttendanceStatusLabel({ status }: { status: keyof typeof attendanceLabels }) {
  const tone = status === "PRESENT" || status === "APPROVED" ? "positive" : status === "LATE" || status === "PENDING" ? "warning" : status === "ABSENT" || status === "REJECTED" ? "negative" : "neutral";
  return <span className={ui.status} data-tone={tone}>{attendanceLabels[status]}</span>;
}
