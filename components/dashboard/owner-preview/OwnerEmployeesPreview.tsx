"use client";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OwnerEmployeesStudy } from "@/components/dashboard/design-study/OwnerEmployeesStudy";
import { OwnerEmployeesLoading } from "@/components/dashboard/design-study/OwnerEmployeesLoading";
import { invalidateOwnerBookingViews } from "@/components/dashboard/owner-preview/owner-booking-invalidation";
import redesignStyles from "@/components/dashboard/design-study/owner-services.module.css";
import { BriefcaseBusiness, Plus, Search, ShieldCheck, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StaffProfile } from "@/prisma/generated/prisma/enums";
import type { OwnerPreviewEmployeesData } from "@/features/workforce/types/owner-preview-directory";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { PersonAvatar, StatusChip, WorkforceHeader, WorkforceKpi, WorkforcePageShell, panelClass } from "./OwnerWorkforcePreviewShared";

type ProfileFilter = "ALL" | StaffProfile;
const filters: { value: ProfileFilter; label: string }[] = [
  { value: "ALL", label: "All roles" },
  { value: "MANAGER", label: "Manager" },
  { value: "STAFF", label: "Staff" },
  { value: "CASHIER", label: "Cashier" },
];
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function OwnerEmployeesPreview({ businessSlug, data, refreshControl, management, onManagementClose }: {
  businessSlug: string;
  data: OwnerPreviewEmployeesData;
  refreshControl: ReactNode;
  management?: ReactNode;
  onManagementClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [managementOpen, setManagementOpen] = useState(false);
  const [filter, setFilter] = useState<ProfileFilter>("ALL");
  const employees = data.employees;
  const visible = useMemo(() => employees.filter((employee) =>
    (filter === "ALL" || employee.profile === filter) &&
    `${employee.name} ${employee.profile} ${employee.specialties.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [employees, filter, query]);
  const count = (profile: StaffProfile) => employees.filter((employee) => employee.profile === profile).length;

  return <WorkforcePageShell businessSlug={businessSlug} active="employees">
    <WorkforceHeader businessSlug={businessSlug} businessName={data.businessName} eyebrow="Team management" title="Employees" description="A current view of your team, roles, and service specialties." action={<div className="flex flex-wrap items-center gap-3">{refreshControl}<button type="button" disabled={!management} onClick={() => setManagementOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white disabled:opacity-55"><Plus className="h-4 w-4" aria-hidden="true" />Manage employees</button></div>} />

    <section aria-label="Employee overview" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <WorkforceKpi label="Team members" value={String(employees.length)} detail="Current employee accounts" icon={Users} tone="lime" />
      <WorkforceKpi label="Managers" value={String(count("MANAGER"))} detail="Manager profile" icon={ShieldCheck} tone="dark" />
      <WorkforceKpi label="Staff" value={String(count("STAFF"))} detail="Staff profile" icon={BriefcaseBusiness} />
      <WorkforceKpi label="Cashiers" value={String(count("CASHIER"))} detail="Cashier profile" icon={Wallet} tone="coral" />
    </section>

    <section className={cn(panelClass, "mt-5 overflow-hidden")} aria-labelledby="employee-directory-heading">
      <div className="border-b border-[#ECEEE9] p-4 sm:p-5 lg:flex lg:items-end lg:justify-between">
        <div><h2 id="employee-directory-heading" className="text-lg font-bold">Team directory</h2><p className="mt-1 text-xs text-[#696C67]">{visible.length} of {employees.length} employees</p></div>
        <div className="mt-4 flex flex-col gap-3 lg:mt-0 lg:items-end">
          <label className="relative block lg:w-72"><span className="sr-only">Search employees</span><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team" className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label>
          <div className="flex flex-wrap gap-1.5" aria-label="Filter employees by role">{filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={cn("min-h-10 cursor-pointer rounded-full px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[#72CF35]", filter === item.value ? "bg-[#20211F] text-white" : "bg-[#F1F2EF] text-[#696C67] hover:text-[#20211F]")}>{item.label}</button>)}</div>
        </div>
      </div>
      <div className="divide-y divide-[#ECEEE9]">
        {visible.map((employee, index) => <article key={employee.id} className="p-4 sm:p-5">
          <div className="flex items-start gap-3"><PersonAvatar name={employee.name} tone={index % 3 === 0 ? "lime" : index % 3 === 1 ? "neutral" : "dark"} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{employee.name}</h3><StatusChip>{employee.profile.toLowerCase()}</StatusChip></div><p className="mt-0.5 text-xs text-[#696C67]">{employee.contactNumber}</p></div></div>
          <div className="mt-4 grid gap-3 rounded-[16px] bg-[#F8F9F6] p-3 sm:grid-cols-2 sm:gap-4 sm:bg-transparent sm:p-0 sm:pl-[52px]"><div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#81847E]">Service specialties</p><div className="mt-1.5 flex flex-wrap gap-1">{employee.specialties.length ? employee.specialties.map((specialty) => <span key={specialty} className="rounded-full border border-[#DDE0D9] bg-white px-2 py-1 text-[10px] font-semibold text-[#555852]">{specialty}</span>) : <p className="text-xs font-semibold">All service categories</p>}</div></div><div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#81847E]">Regular days off</p><p className="mt-1.5 text-xs font-semibold">{employee.recurringDaysOff.length ? employee.recurringDaysOff.map((day) => dayNames[day] ?? "Unknown day").join(" · ") : "No fixed days off"}</p></div></div>
        </article>)}
        {!visible.length && <div className="grid min-h-56 place-items-center p-6 text-center"><div><BriefcaseBusiness className="mx-auto h-5 w-5 text-[#92958F]" aria-hidden="true" /><p className="mt-3 text-sm font-bold">{employees.length ? "No matching employees" : "No employees yet"}</p>{employees.length ? <button type="button" onClick={() => { setQuery(""); setFilter("ALL"); }} className="mt-2 min-h-11 cursor-pointer px-3 text-xs font-bold text-[#4D8F24]">Clear filters</button> : <p className="mt-2 text-xs text-[#696C67]">Team members will appear here when added.</p>}</div></div>}
      </div>
    </section>
    <Dialog open={managementOpen} onOpenChange={(open) => { setManagementOpen(open); if (!open) onManagementClose?.(); }}><DialogContent className="max-h-[90dvh] max-w-[95vw] overflow-y-auto p-0 sm:max-w-[1100px]"><DialogHeader className="sr-only"><DialogTitle>Manage employees</DialogTitle><DialogDescription>View and manage employee accounts for this business.</DialogDescription></DialogHeader>{management}</DialogContent></Dialog>
  </WorkforcePageShell>;
}

export function OwnerEmployeesPreviewRoute({ management, redesign = false, fontClassName = "" }: { management?: ReactNode; redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const previewFetch = useOwnerPreviewFetch();
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "employees", "page"),
    queryFn: ({ signal }) => previewFetch<OwnerPreviewEmployeesData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/employees`, { signal }),
    staleTime: ownerPreviewStaleTime.catalog,
  });
  if (!query.data && query.isPending) return redesign ? <OwnerEmployeesLoading /> : <OwnerCatalogPreviewSkeleton label="employees preview" />;
  const refreshControl = <OwnerPreviewRefreshControl label="employees" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { if (redesign) void refreshTeamQueries(client, ownerPreviewKeys.section(identity, "employees", "page")); else void query.refetch(); }} />;
  if (redesign) {
    if (!query.data) return <div className={`${redesignStyles.page} ${fontClassName}`}><header className={redesignStyles.header}><div><p className={redesignStyles.eyebrow}>Your people</p><h1>Employees</h1></div></header><div className={redesignStyles.empty}><div><h2>Employees unavailable</h2><p>We couldn’t load your team. Please try again.</p>{refreshControl}</div></div></div>;
    return <OwnerEmployeesStudy data={query.data} refreshControl={refreshControl} fontClassName={fontClassName} onChanged={() => {
      void client.cancelQueries({ queryKey: ownerPreviewKeys.page(identity, "employees") }).then(() => {
        void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "employees") });
      });
      for (const page of ["attendance", "payroll"]) void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
      invalidateOwnerBookingViews(client, identity);
    }} />;
  }
  if (!query.data) return <WorkforcePageShell businessSlug={identity.businessSlug} active="employees"><h1 className="text-2xl font-bold">Employees unavailable</h1><div className="mt-4">{refreshControl}</div></WorkforcePageShell>;
  return <OwnerEmployeesPreview businessSlug={identity.businessSlug} data={query.data} refreshControl={refreshControl} management={management} onManagementClose={() => { void query.refetch(); }} />;
}
