import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import { OwnerOwnersLoading } from "@/components/dashboard/design-study/OwnerOwnersLoading";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";

export default function Loading() { return <OwnerDashboardShell activePage="owners" fontClassName={redesignBodyFont.variable}><OwnerOwnersLoading /></OwnerDashboardShell>; }
