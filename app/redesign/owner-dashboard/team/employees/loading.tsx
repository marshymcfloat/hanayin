import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import { OwnerEmployeesLoading } from "@/components/dashboard/design-study/OwnerEmployeesLoading";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";

export default function Loading() { return <OwnerDashboardShell activePage="employees" fontClassName={redesignBodyFont.variable}><OwnerEmployeesLoading /></OwnerDashboardShell>; }
