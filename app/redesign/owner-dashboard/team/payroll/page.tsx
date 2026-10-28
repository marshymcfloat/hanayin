import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerTeamWorkspace from "@/components/dashboard/design-study/OwnerTeamWorkspace";
import { OwnerPayrollPreviewRoute } from "@/components/dashboard/owner-preview/OwnerPayrollPreviewQuery";

export const metadata: Metadata = { title: { absolute: "Payroll — HANAYIN" }, description: "Review team earnings and confirmed payouts.", robots: { index: false, follow: false } };
export default function PayrollPage() {
  return <OwnerTeamWorkspace page="payroll" fontClassName={redesignBodyFont.variable}><OwnerPayrollPreviewRoute redesign fontClassName={redesignBodyFont.variable} /></OwnerTeamWorkspace>;
}
