"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useCatalogListState } from "@/components/dashboard/owner-preview/useCatalogListState";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CalendarCheck2, Mail, Phone, Plus, UserRoundPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OwnerPreviewCustomer, OwnerPreviewCustomerDirectory, OwnerPreviewCustomerHistory } from "@/features/customers/types/owner-preview";
import { CatalogEditorBody, CatalogEditorClose, CatalogEditorFooter, CatalogEditorOverlay } from "./CatalogEditorOverlay";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { actionClass, CustomerWorkspaceShell, panelClass, PersonAvatar, StatusChip, WorkspaceDetails, WorkspaceEmpty, WorkspaceField, WorkspaceFilters, WorkspaceHeader, WorkspaceKpi, WorkspaceMoney, WorkspaceSearch } from "./OwnerCustomerWorkspaceShared";
import { OwnerCustomersStudy } from "@/components/dashboard/design-study/OwnerCustomersStudy";
import { OwnerCustomersLoading } from "@/components/dashboard/design-study/OwnerCustomersLoading";
import type { CustomerContactDraft } from "@/components/dashboard/design-study/OwnerCustomerSheet";
import customerStyles from "@/components/dashboard/design-study/owner-services.module.css";

const segments = ["All customers", "New", "Returning"] as const;
type Segment = typeof segments[number];
const segmentKey = (segment: Segment) => segment === "New" ? "new" : segment === "Returning" ? "returning" : "all";
const displayDate = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

export function OwnerCustomersPreview({ businessSlug, data, customers, query, segment, isFetching, refreshControl, onQueryChange, onSegmentChange, onPageChange, onAdd }: {
  businessSlug: string;
  data: OwnerPreviewCustomerDirectory;
  customers: OwnerPreviewCustomer[];
  query: string;
  segment: Segment;
  isFetching: boolean;
  refreshControl: ReactNode;
  onQueryChange: (value: string) => void;
  onSegmentChange: (value: Segment) => void;
  onPageChange: (page: number) => void;
  onAdd: () => void;
}) {
  const pendingCount = customers.filter((customer) => !data.customers.some((saved) => saved.id === customer.id)).length;
  return <CustomerWorkspaceShell businessSlug={businessSlug} active="customers">
    <WorkspaceHeader businessSlug={businessSlug} businessName={data.businessName} eyebrow="Customer relationships" title="Customers" description="A current view of customer contacts and completed visits." action={<div className="flex flex-wrap items-center gap-3">{refreshControl}<button type="button" data-catalog-focus="add-customer" onClick={onAdd} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white outline-none transition-colors hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35]/40"><Plus className="h-4 w-4" aria-hidden="true" />Add customer</button></div>} />
    <section aria-label="Customer overview" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <WorkspaceKpi label="Customer directory" value={String(data.totals.customers + pendingCount)} detail="Contact profiles on file" icon={Users} tone="dark" />
      <WorkspaceKpi label="New customers" value={String(data.totals.newCustomers + pendingCount)} detail="No completed visits yet" icon={UserRoundPlus} tone="lime" />
      <WorkspaceKpi label="Returning customers" value={String(data.totals.returningCustomers)} detail="At least one completed visit" icon={CalendarCheck2} />
      <WorkspaceKpi label="Completed visits" value={String(data.totals.completedVisits)} detail="Across customer profiles" icon={CalendarCheck2} tone="lime" />
    </section>

    <section className={cn(panelClass, "mt-5 overflow-hidden")} aria-labelledby="customer-directory-heading">
      <div className="space-y-4 border-b border-[#ECEEE9] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 id="customer-directory-heading" className="text-lg font-bold">Customer directory</h2><p className="mt-1 text-xs text-[#696C67]" role="status">{data.filteredCount} matching customers{isFetching ? " · Updating…" : ""}</p></div><WorkspaceSearch label="Search name, email or phone" value={query} onChange={onQueryChange} /></div>
        <WorkspaceFilters label="Customer segment" options={segments} value={segment} onChange={onSegmentChange} />
      </div>
      <ul className="divide-y divide-[#ECEEE9]">{customers.map((customer, index) => <li key={customer.id} className="p-4 sm:p-5">
        <div className="flex items-start gap-3"><PersonAvatar name={customer.name} tone={index % 2 ? "neutral" : "lime"} /><div className="min-w-0 flex-1"><h3 className="text-sm font-bold sm:text-base">{customer.name}</h3><p className="mt-1 text-xs text-[#696C67]">Customer since {displayDate(customer.joinedAt)}</p></div><StatusChip tone={customer.completedVisits ? "positive" : "neutral"}>{customer.completedVisits ? "Returning" : "New"}</StatusChip></div>
        <div className="mt-4 grid gap-4 rounded-[16px] bg-[#F8F9F6] p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center lg:bg-transparent lg:p-0 lg:pl-[52px]">
          <div className="min-w-0 space-y-2"><p className="flex items-center gap-2 text-xs text-[#555852]"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="font-mono">{customer.phone || "No phone on file"}</span></p><p className="flex items-start gap-2 text-xs text-[#555852]"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-all">{customer.email || "No email on file"}</span></p></div>
          <dl className="grid grid-cols-2 gap-3"><WorkspaceField label="Last visit"><span className="text-xs">{customer.lastVisitAt ? displayDate(customer.lastVisitAt) : "No visits yet"}</span></WorkspaceField><WorkspaceField label="Completed visits">{customer.completedVisits}</WorkspaceField></dl>
          {customer.id.startsWith("pending-") ? <span role="status" className="text-xs font-semibold text-[#696C67]">Saving customer…</span> : <CustomerProfile customer={customer} />}
        </div>
      </li>)}</ul>
      {!customers.length && <WorkspaceEmpty title={data.totals.customers ? "No matching customers" : "No customers yet"} onReset={() => { onQueryChange(""); onSegmentChange("All customers"); }} />}
      {data.filteredCount > data.pageSize && <div className="flex items-center justify-between gap-3 border-t border-[#ECEEE9] p-4 sm:p-5"><button type="button" disabled={data.page <= 1} onClick={() => onPageChange(data.page - 1)} className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="text-xs text-[#696C67]">Page {data.page} of {Math.ceil(data.filteredCount / data.pageSize)}</span><button type="button" disabled={data.page * data.pageSize >= data.filteredCount} onClick={() => onPageChange(data.page + 1)} className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>}
    </section>
  </CustomerWorkspaceShell>;
}

function CustomerProfile({ customer }: { customer: OwnerPreviewCustomer }) {
  const [opened, setOpened] = useState(false);
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const history = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "customers", "history", { customerId: customer.id }),
    queryFn: ({ signal }) => previewFetch<OwnerPreviewCustomerHistory>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/customers/${encodeURIComponent(customer.id)}/history`, { signal }),
    staleTime: ownerPreviewStaleTime.catalog,
    enabled: opened,
  });
  return <WorkspaceDetails title={customer.name} description="Customer profile & completed service history" trigger={<button type="button" onClick={() => setOpened(true)} aria-label={`View profile for ${customer.name}`} className={cn(actionClass, "justify-self-start bg-white lg:justify-self-end")}>View profile<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}>
    <div className="flex items-center gap-3"><PersonAvatar name={customer.name} /><div><p className="text-sm font-bold">{customer.name}</p><p className="mt-1 text-xs text-[#696C67]">Joined {displayDate(customer.joinedAt)}</p></div></div>
    <dl className="grid grid-cols-1 gap-4 rounded-[18px] bg-[#F7F8F5] p-4 sm:grid-cols-2"><WorkspaceField label="Phone">{customer.phone || "No phone on file"}</WorkspaceField><WorkspaceField label="Email">{customer.email || "No email on file"}</WorkspaceField><WorkspaceField label="Completed visits">{customer.completedVisits}</WorkspaceField><WorkspaceField label="Last visit">{customer.lastVisitAt ? displayDate(customer.lastVisitAt) : "No visits yet"}</WorkspaceField></dl>
    <section aria-label="Completed service history"><h3 className="text-sm font-bold">Service history</h3>{history.isPending ? <p role="status" className="mt-3 rounded-[16px] bg-[#F8F9F6] p-4 text-sm text-[#696C67]">Loading service history…</p> : history.isError ? <div className="mt-3 rounded-[16px] bg-[#FFF0F0] p-4"><p role="alert" className="text-sm text-[#C74248]">Could not load service history.</p><button type="button" onClick={() => void history.refetch()} className="mt-2 min-h-11 cursor-pointer text-xs font-bold text-[#C74248]">Retry history</button></div> : history.data?.services.length ? <><ul className="mt-3 divide-y divide-[#ECEEE9]">{history.data.services.map((service) => <li key={service.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{service.service}</p><p className="mt-1 text-xs text-[#696C67]">{service.completedAt ? displayDate(service.completedAt) : "Date unavailable"} · #{service.id}</p>{service.provider && <p className="mt-1 text-xs text-[#696C67]">{service.provider}</p>}</div><div className="shrink-0 text-sm"><WorkspaceMoney amount={service.amount} /></div></div></li>)}</ul>{history.data.hasMore && <p className="mt-3 text-xs text-[#696C67]">Showing the latest 20 completed services.</p>}</> : <p className="mt-3 rounded-[16px] bg-[#F8F9F6] p-4 text-sm text-[#696C67]">No completed services yet.</p>}</section>
  </WorkspaceDetails>;
}

function AddCustomerOverlay({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; email?: string; phone?: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter a customer name."); return; }
    setSaving(true);
    setError("");
    const success = await onCreate({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
    setSaving(false);
    if (success) { setName(""); setEmail(""); setPhone(""); onOpenChange(false); }
    else setError("The customer could not be saved. Please try again.");
  }
  return <CatalogEditorOverlay open={open} onOpenChange={onOpenChange} title="Add customer" description="Create a contact profile for this business." restoreFocusKey="add-customer">
    <CatalogEditorBody><form id="owner-preview-add-customer" onSubmit={(event) => void submit(event)} className="space-y-4"><label className="block text-xs font-semibold text-[#555852]">Customer name <span aria-hidden="true">*</span><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-11 w-full rounded-[13px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label><label className="block text-xs font-semibold text-[#555852]">Email (optional)<input type="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-[13px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label><label className="block text-xs font-semibold text-[#555852]">Phone (optional)<input type="tel" maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 h-11 w-full rounded-[13px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label>{error && <p role="alert" className="text-xs font-semibold text-[#C74248]">{error}</p>}</form></CatalogEditorBody>
    <CatalogEditorFooter><CatalogEditorClose disabled={saving} className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] bg-white px-5 text-sm font-bold">Cancel</CatalogEditorClose><button type="submit" form="owner-preview-add-customer" disabled={saving} className="min-h-11 cursor-pointer rounded-full bg-[#20211F] px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? "Creating…" : "Create customer"}</button></CatalogEditorFooter>
  </CatalogEditorOverlay>;
}

export function OwnerCustomersPreviewRoute({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string } = {}) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const client = useQueryClient();
  const [search, setSearch] = useCatalogListState(`${identity.userId}:${identity.businessId}:customers`, "search", "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [segment, setSegment] = useCatalogListState<Segment>(`${identity.userId}:${identity.businessId}:customers`, "segment", "All customers");
  const [page, setPage] = useCatalogListState(`${identity.userId}:${identity.businessId}:customers`, "page", 1);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [pending, setPending] = useState<OwnerPreviewCustomer[]>([]);
  const nextPending = useRef(0);
  const mutationLock = useRef(false);
  const [editing, setEditing] = useState<Record<string, OwnerPreviewCustomer>>({});
  const editingLocks = useRef(new Set<string>());
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(timer); }, [search]);

  const filters = { search: debouncedSearch, segment: segmentKey(segment), page };
  const key = ownerPreviewKeys.section(identity, "customers", "directory", filters);
  const url = `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/customers`;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => previewFetch<OwnerPreviewCustomerDirectory>(`${url}?${new URLSearchParams({ search: filters.search, segment: filters.segment, page: String(filters.page) })}`, { signal }),
    staleTime: ownerPreviewStaleTime.catalog,
    placeholderData: keepPreviousData,
  });
  const signature = JSON.stringify(filters);
  const [previous, setPrevious] = useState<{ data: OwnerPreviewCustomerDirectory; signature: string } | null>(null);
  if (query.data && !query.isPlaceholderData && (previous?.data !== query.data || previous.signature !== signature)) {
    setPrevious({ data: query.data, signature });
  }
  const data = query.data ?? (redesign ? previous?.data : undefined);
  const staleSelection = query.isPlaceholderData || search !== debouncedSearch || (!query.data && previous?.signature !== signature);
  function invalidateCustomers() {
    for (const page of ["customers", "bookings", "dashboard", "reports", "inbox"]) {
      void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
    }
  }
  async function updateContact(customer: OwnerPreviewCustomer, draft: CustomerContactDraft) {
    if (editingLocks.current.has(customer.id)) return false;
    editingLocks.current.add(customer.id);
    setEditing(current => ({ ...current, [customer.id]: { ...customer, ...draft } }));
    try {
      const { updateCustomer } = await import("@/features/customers/actions/customer");
      const result = await updateCustomer(customer.id, { ...draft, businessSlug: identity.businessSlug });
      if (!result.success) return false;
      await client.cancelQueries({ queryKey: ownerPreviewKeys.page(identity, "customers") });
      client.setQueriesData<OwnerPreviewCustomerDirectory>({ queryKey: [...ownerPreviewKeys.page(identity, "customers"), "directory"] }, current => current ? {
        ...current, customers: current.customers.map(row => row.id === customer.id ? { ...row, name: result.data.name, email: result.data.email, phone: result.data.phone } : row),
      } : current);
      invalidateCustomers();
      return true;
    } catch { return false; }
    finally { setEditing(current => { const next = { ...current }; delete next[customer.id]; return next; }); editingLocks.current.delete(customer.id); }
  }
  async function createCustomer(input: { name: string; email?: string; phone?: string }) {
    if (!redesign && mutationLock.current) return false;
    mutationLock.current = true;
    const temporaryId = `pending-${++nextPending.current}`;
    const optimistic: OwnerPreviewCustomer = { id: temporaryId, name: input.name, email: input.email ?? null, phone: input.phone ?? null, joinedAt: new Date().toISOString(), completedVisits: 0, lastVisitAt: null };
    setSegment("All customers"); setSearch(""); setDebouncedSearch(""); setPage(1);
    setPending((current) => [...current, optimistic]);
    try {
      const created = await previewFetch<OwnerPreviewCustomer>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      await client.cancelQueries({ queryKey: ownerPreviewKeys.page(identity, "customers") });
      const defaultKey = ownerPreviewKeys.section(identity, "customers", "directory", { search: "", segment: "all", page: 1 });
      const cached = client.getQueryData<OwnerPreviewCustomerDirectory>(defaultKey);
      if (cached) {
        const increment = cached.customers.some(customer => customer.id === created.id) ? 0 : 1;
        client.setQueryData<OwnerPreviewCustomerDirectory>(defaultKey, { ...cached, customers: [created, ...cached.customers.filter((customer) => customer.id !== created.id)].slice(0, cached.pageSize), filteredCount: cached.filteredCount + increment, totals: { ...cached.totals, customers: cached.totals.customers + increment, newCustomers: cached.totals.newCustomers + increment } });
      }
      setPending((current) => current.filter((customer) => customer.id !== temporaryId));
      invalidateCustomers();
      return true;
    } catch {
      setPending((current) => current.filter((customer) => customer.id !== temporaryId));
      return false;
    } finally { mutationLock.current = false; }
  }

  if (redesign && !data && query.isPending) return <OwnerCustomersLoading />;
  if (!data && query.isPending) return <><OwnerCatalogPreviewSkeleton label="customers preview" /><AddCustomerOverlay open={overlayOpen} onOpenChange={setOverlayOpen} onCreate={createCustomer} /></>;
  const refreshControl = <OwnerPreviewRefreshControl label="customers" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { void refreshTeamQueries(client, key); }} />;
  if (redesign && !data) return <div className={`${customerStyles.page} ${fontClassName}`}><h1>Customers unavailable</h1><p className={customerStyles.notice} role="alert">The customer directory could not be loaded. Try refreshing.</p>{refreshControl}</div>;
  if (!data) return <CustomerWorkspaceShell businessSlug={identity.businessSlug} active="customers"><h1 className="text-2xl font-bold">Customers unavailable</h1><div className="mt-4">{refreshControl}</div></CustomerWorkspaceShell>;
  const pagePending = page === 1 && segment === "All customers" && !search ? pending : [];
  const customers = [...pagePending, ...data.customers.filter((customer) => !pagePending.some((entry) => entry.id === customer.id))];
  if (redesign) return <OwnerCustomersStudy data={data} customers={customers.map(customer => editing[customer.id] ?? customer)} query={search} segment={segment} isFetching={query.isFetching} staleSelection={staleSelection} refreshControl={refreshControl} onQueryChange={value => { setSearch(value); setPage(1); }} onSegmentChange={value => { setSegment(value); setPage(1); }} onPageChange={setPage} onCreate={createCustomer} onUpdate={updateContact} editingIds={Object.keys(editing)} fontClassName={fontClassName} />;
  return <><OwnerCustomersPreview businessSlug={identity.businessSlug} data={data} customers={customers} query={search} segment={segment} isFetching={query.isFetching || query.isPlaceholderData} refreshControl={refreshControl} onQueryChange={(value) => { setSearch(value); setPage(1); }} onSegmentChange={(value) => { setSegment(value); setPage(1); }} onPageChange={setPage} onAdd={() => setOverlayOpen(true)} /><AddCustomerOverlay open={overlayOpen} onOpenChange={setOverlayOpen} onCreate={createCustomer} /></>;
}
