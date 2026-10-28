import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerTeamWorkspace from "@/components/dashboard/design-study/OwnerTeamWorkspace";
import { OwnerEmployeesPreviewRoute } from "@/components/dashboard/owner-preview/OwnerEmployeesPreview";

export const metadata: Metadata = { title: { absolute: "Employees — HANAYIN" }, description: "Manage your team, roles, specialties, and schedules.", robots: { index: false, follow: false } };
export default function EmployeesPage() {
  return <OwnerTeamWorkspace page="employees" fontClassName={redesignBodyFont.variable}><OwnerEmployeesPreviewRoute redesign fontClassName={redesignBodyFont.variable} /></OwnerTeamWorkspace>;
}
