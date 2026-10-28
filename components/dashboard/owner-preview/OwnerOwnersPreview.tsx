"use client";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EditOwnerPermissionsDialog } from "@/components/owners/EditOwnerPermissionsDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crown, KeyRound, Search, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import type { OwnerPreviewOwnersData, OwnerPreviewOwner } from "@/features/workforce/types/owner-preview-directory";
import { cn } from "@/lib/utils";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { PersonAvatar, StatusChip, WorkforceHeader, WorkforceKpi, WorkforcePageShell, panelClass } from "./OwnerWorkforcePreviewShared";
import { OwnerOwnersStudy } from "@/components/dashboard/design-study/OwnerOwnersStudy";
import { OwnerOwnersLoading } from "@/components/dashboard/design-study/OwnerOwnersLoading";
import { invalidateOwnerBookingViews } from "@/components/dashboard/owner-preview/owner-booking-invalidation";
import redesignStyles from "@/components/dashboard/design-study/owner-services.module.css";

const permissionLabels: Record<OwnerPermission, string> = {
  BILLING_VIEW: "View billing",
  BILLING_MANAGE: "Manage billing",
  REPORTS_VIEW_FULL: "Full reports",
  REPORTS_VIEW_SALES_ONLY: "Sales reports",
  EMPLOYEES_MANAGE: "Manage employees",
  STAFF_MANAGE: "Manage staff",
  SETTINGS_MANAGE: "Business settings",
  CATALOG_MANAGE: "Manage catalog",
  PAYROLL_MANAGE: "Manage payroll",
  WORKFORCE_MANAGE: "Manage time and leave",
};
const coverage = [
  { label: "Business settings", permissions: [OwnerPermission.SETTINGS_MANAGE] },
  { label: "Billing", permissions: [OwnerPermission.BILLING_VIEW, OwnerPermission.BILLING_MANAGE] },
  { label: "Team management", permissions: [OwnerPermission.EMPLOYEES_MANAGE, OwnerPermission.STAFF_MANAGE] },
  { label: "Payroll", permissions: [OwnerPermission.PAYROLL_MANAGE] },
  { label: "Reports", permissions: [OwnerPermission.REPORTS_VIEW_FULL, OwnerPermission.REPORTS_VIEW_SALES_ONLY] },
];

function isAssigned(owner: OwnerPreviewOwner, permissions: OwnerPermission[]) {
  return permissions.some((permission) => owner.permissions.includes(permission));
}

export function OwnerOwnersPreview({ businessSlug, data, refreshControl, onChanged, management }: {
  businessSlug: string;
  data: OwnerPreviewOwnersData;
  refreshControl: ReactNode;
  onChanged?: () => void;
  management?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const owners = data.owners;
  const visible = useMemo(() => owners.filter((owner) =>
    `${owner.name} ${owner.contactNumber} ${owner.specialties.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [owners, query]);
  const specialties = new Set(owners.flatMap((owner) => owner.specialties));
  const permissions = new Set(owners.flatMap((owner) => owner.permissions));
  const selectedOwner = owners.find((owner) => owner.id === selectedOwnerId);

  return <WorkforcePageShell businessSlug={businessSlug} active="owners">
    <WorkforceHeader businessSlug={businessSlug} businessName={data.businessName} eyebrow="Ownership & access" title="Owners" description="Review current owner accounts, assigned permissions, and service specialties." action={<div className="flex gap-2">{refreshControl}{management && <button type="button" onClick={() => setManagementOpen(true)} className="min-h-11 rounded-full bg-[#20211F] px-4 text-xs font-bold text-white">Manage owners</button>}</div>} />
    <section aria-label="Owner overview" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <WorkforceKpi label="Business owners" value={String(owners.length)} detail="Current owner accounts" icon={Crown} tone="lime" />
      <WorkforceKpi label="Primary owners" value={String(owners.filter((owner) => owner.isPrimary).length)} detail="Primary owner of record" icon={Sparkles} tone="dark" />
      <WorkforceKpi label="Configured specialties" value={String(specialties.size)} detail="Distinct service categories" icon={UserRoundCheck} />
      <WorkforceKpi label="Assigned capabilities" value={String(permissions.size)} detail="Distinct owner permissions" icon={ShieldCheck} tone="lime" />
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)]">
      <section className={cn(panelClass, "overflow-hidden")} aria-labelledby="owner-roster-heading">
        <div className="border-b border-[#ECEEE9] p-4 sm:flex sm:items-center sm:justify-between sm:p-5"><div><h2 id="owner-roster-heading" className="text-lg font-bold">Owner roster</h2><p className="mt-1 text-xs text-[#696C67]">{visible.length} of {owners.length} owner accounts</p></div><label className="relative mt-3 block sm:mt-0 sm:w-64"><span className="sr-only">Search owners</span><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search owners" className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label></div>
        <div className="divide-y divide-[#ECEEE9]">{visible.map((owner, index) => <article key={owner.id} className="p-4 sm:p-5"><div className="flex items-start gap-3"><PersonAvatar name={owner.name} tone={owner.isPrimary ? "dark" : index % 2 ? "neutral" : "lime"} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{owner.name}</h3>{owner.isPrimary && <StatusChip tone="positive">Primary</StatusChip>}</div><p className="mt-0.5 text-xs text-[#696C67]">{owner.contactNumber}</p></div><button type="button" onClick={() => setSelectedOwnerId(owner.id)} className="inline-flex min-h-11 items-center rounded-full border border-[#E1E3DE] px-3 text-xs font-bold">Manage permissions</button></div><div className="mt-4 grid gap-3 rounded-[16px] bg-[#F8F9F6] p-3 sm:grid-cols-2 sm:bg-transparent sm:p-0 sm:pl-[52px]"><div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#81847E]">Owner permissions</p><div className="mt-1.5 flex flex-wrap gap-1">{owner.permissions.length ? owner.permissions.map((permission) => <span key={permission} className="rounded-full border border-[#DDE0D9] bg-white px-2 py-1 text-[10px] font-semibold">{permissionLabels[permission]}</span>) : <p className="text-xs font-semibold">No permissions assigned</p>}</div></div><div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#81847E]">Service specialties</p><p className="mt-1.5 text-xs font-semibold">{owner.specialties.length ? owner.specialties.join(" · ") : "All service categories"}</p></div></div></article>)}
          {!visible.length && <div className="grid min-h-48 place-items-center p-6 text-center"><div><Crown className="mx-auto h-5 w-5 text-[#92958F]" aria-hidden="true" /><p className="mt-3 text-sm font-bold">{owners.length ? "No matching owners" : "No owners found"}</p>{owners.length ? <button type="button" onClick={() => setQuery("")} className="mt-2 min-h-11 cursor-pointer px-3 text-xs font-bold text-[#4D8F24]">Clear search</button> : <p className="mt-2 text-xs text-[#696C67]">Owner accounts will appear here when available.</p>}</div></div>}
        </div>
      </section>

      <aside className={cn(panelClass, "p-4 sm:p-5")} aria-labelledby="coverage-heading"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#EFF9E8] text-[#4D8F24]"><KeyRound className="h-[18px] w-[18px]" aria-hidden="true" /></span><div><h2 id="coverage-heading" className="font-bold">Responsibility coverage</h2><p className="mt-0.5 text-xs text-[#696C67]">Based on assigned owner permissions</p></div></div><div className="mt-5 space-y-4">{coverage.map((item) => { const assigned = owners.filter((owner) => isAssigned(owner, item.permissions)); return <div key={item.label} className="flex items-center justify-between gap-3 border-b border-[#ECEEE9] pb-4 last:border-0 last:pb-0"><div className="min-w-0"><p className="text-xs font-bold">{item.label}</p><p className="mt-1 text-[11px] text-[#696C67]">{assigned.length ? assigned.map((owner) => owner.name).join(" · ") : "No owner assigned"}</p></div><StatusChip tone={assigned.length ? "positive" : "warning"}>{assigned.length ? "Covered" : "Unassigned"}</StatusChip></div>; })}</div></aside>
    </div>
    {selectedOwner && <EditOwnerPermissionsDialog ownerId={selectedOwner.id} ownerName={selectedOwner.name} isPrimary={selectedOwner.isPrimary} currentPermissions={selectedOwner.permissions} open onOpenChange={(open) => { if (!open) setSelectedOwnerId(null); }} onSuccess={onChanged} />}
    <Dialog open={managementOpen} onOpenChange={(open) => { setManagementOpen(open); if (!open) onChanged?.(); }}><DialogContent className="max-h-[90dvh] max-w-[95vw] overflow-y-auto p-0 sm:max-w-[1000px]"><DialogHeader className="sr-only"><DialogTitle>Manage owners</DialogTitle><DialogDescription>View and manage owner accounts for this business.</DialogDescription></DialogHeader>{management}</DialogContent></Dialog>
  </WorkforcePageShell>;
}

export function OwnerOwnersPreviewRoute({ management, redesign = false, fontClassName = "" }: { management?: ReactNode; redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const queryClient = useQueryClient();
  const previewFetch = useOwnerPreviewFetch();
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "owners", "page"),
    queryFn: ({ signal }) => previewFetch<OwnerPreviewOwnersData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/owners`, { signal }),
    staleTime: ownerPreviewStaleTime.catalog,
  });
  if (!query.data && query.isPending) return redesign ? <OwnerOwnersLoading /> : <OwnerCatalogPreviewSkeleton label="owners preview" />;
  const refreshControl = <OwnerPreviewRefreshControl label="owners" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { if (redesign) void refreshTeamQueries(queryClient, ownerPreviewKeys.section(identity, "owners", "page")); else void query.refetch(); }} />;
  if (redesign) {
    if (!query.data) return <div className={`${redesignStyles.page} ${fontClassName}`}><header className={redesignStyles.header}><div><p className={redesignStyles.eyebrow}>Your people</p><h1>Owners</h1></div></header><div className={redesignStyles.empty}><div><h2>Owners unavailable</h2><p>We couldn’t load owner accounts. Please try again.</p>{refreshControl}</div></div></div>;
    return <OwnerOwnersStudy data={query.data} refreshControl={refreshControl} fontClassName={fontClassName} onChanged={change => {
      const key = ownerPreviewKeys.section(identity, "owners", "page");
      void queryClient.cancelQueries({ queryKey: key }).then(() => {
        queryClient.setQueryData<OwnerPreviewOwnersData>(key, current => {
          if (!current) return current;
          const owners = current.owners.map(owner => change.type === "primary" ? { ...owner, isPrimary: owner.id === change.ownerId } : owner.id !== change.ownerId ? owner : change.type === "permissions" ? { ...owner, permissions: change.permissions } : { ...owner, specialties: change.specialties });
          return { ...current, owners, administration: current.administration ? { ...current.administration, canManage: owners.some(owner => owner.id === current.administration?.currentOwnerId && owner.permissions.includes(OwnerPermission.SETTINGS_MANAGE)) } : undefined };
        });
        void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.business(identity) });
        invalidateOwnerBookingViews(queryClient, identity);
      });
    }} />;
  }
  if (!query.data) return <WorkforcePageShell businessSlug={identity.businessSlug} active="owners"><h1 className="text-2xl font-bold">Owners unavailable</h1><div className="mt-4">{refreshControl}</div></WorkforcePageShell>;
  return <OwnerOwnersPreview businessSlug={identity.businessSlug} data={query.data} refreshControl={refreshControl} management={management} onChanged={() => { void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "owners", "page") }); }} />;
}
