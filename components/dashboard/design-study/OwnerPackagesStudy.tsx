"use client";
import { packageChoicesSchema, matchesServiceRule, type PackageChoice } from "@/features/catalog/offer-definitions";
import { ServiceRuleEditor } from "@/components/dashboard/owner-preview/ServiceRuleEditor";

import { type FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, Clock3, MoreHorizontal, Copy, Pencil, Plus, Search, TicketPercent, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { createPackageAction, deletePackageAction, updatePackageAction } from "@/features/catalog/actions/packages";
import type { OwnerCatalogCommittedChange, OwnerCatalogPreviewPackage, OwnerPackagesPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";
import type { PackageDetails } from "@/features/catalog/package-schemas";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteDialog } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewShared";
import { CatalogEditorClose, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOptimisticCatalog, type CatalogMutationResult } from "@/components/dashboard/owner-preview/useOptimisticCatalog";
import { CatalogDraftOverlay } from "@/components/dashboard/owner-preview/CatalogDraftOverlay";
import { CatalogInput } from "@/components/dashboard/owner-preview/CatalogInput";
import { showCatalogSaved } from "@/components/dashboard/owner-preview/showCatalogSaved";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useCatalogEditorSessions } from "@/components/dashboard/owner-preview/useCatalogEditorSessions";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import packages from "@/components/dashboard/design-study/owner-packages.module.css";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fieldClass = "mt-1.5 h-11 w-full px-3.5 outline-none";

export function OwnerPackagesStudy({ data, fontClassName = "", onChanged }: {
  data: OwnerPackagesPreviewReadModel;
  fontClassName?: string;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewPackage>) => void;
}) {
  const [query, setQuery] = useCatalogListState(`${data.business.slug}:Packages`, "query", "");
  const [category, setCategory] = useCatalogListState(`${data.business.slug}:Packages`, "category", "all");
  const [sort, setSort] = useCatalogListState(`${data.business.slug}:Packages`, "sort", "name");
  const [limit, setLimit] = useCatalogListState(`${data.business.slug}:Packages`, "limit", 12);
  const editors = useCatalogEditorSessions<OwnerCatalogPreviewPackage>();
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewPackage | null>(null);
  const deletingIds = useRef(new Set<number>());
  const listRef = useRef<HTMLDivElement>(null);
  useCatalogScroll(`${data.business.slug}:Packages`, listRef);
  const catalog = useOptimisticCatalog(data.packages, onChanged);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => catalog.items.filter(item =>
    (!normalized || `${item.name} ${item.description ?? ""} ${item.category} ${item.services.map(service => service.name).join(" ")}`.toLowerCase().includes(normalized)) &&
    (category === "all" || `category:${item.category}` === category),
  ).sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : sort === "popular" ? b.monthlySales - a.monthlySales : a.name.localeCompare(b.name)), [catalog.items, normalized, category, sort]);
  const shown = visible.slice(0, limit);
  const captureRows = useSelectionMotion(listRef, shown.map(item => item.id).join(","), "package");
  const filtered = Boolean(normalized || category !== "all");

  function openEditor(item: OwnerCatalogPreviewPackage | null = null) {
    editors.open(item);
  }
  async function confirmDelete() {
    if (!deleting || deletingIds.current.has(deleting.id)) return;
    const target = deleting;
    deletingIds.current.add(target.id);
    setDeleting(null);
    captureRows();
    try {
      const result = await catalog.remove(target.id, async () => {
        const response = await deletePackageAction(target.id);
        return response.success ? { success: true as const, data: target } : response;
      });
      if (!result.success) {
        setDeleting(current => current ?? target);
        toast.error(result.error);
      } else toast.success(`${target.name} was deleted.`);
    } finally { deletingIds.current.delete(target.id); }
  }

  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{data.business.name} · Your curated offers</p><h1>Packages<span className={styles.titleDetail}>, better together.</span></h1><p className={styles.description}>Bring your services together with considered pricing and a little more value.</p></div>
      <button type="button" className={styles.primary} data-catalog-focus="packages:create" onClick={() => openEditor()}><Plus size={17} aria-hidden="true" />Add package</button>
    </header>
    <section className={styles.summary} aria-label="Package catalog overview">
      <PackageMetric icon={Boxes} label="Total packages" value={String(catalog.items.length)} detail="Offers in your catalog" />
      <PackageMetric icon={TicketPercent} label="Monthly sales" value={String(data.metrics.monthlySales)} detail="Package bookings this month" />
      <PackageMetric icon={TrendingUp} label="Est. booking value" value={peso.format(data.metrics.monthlyRevenue)} detail="Monthly sales × current prices" />
      <PackageMetric icon={Clock3} label="Average savings" value={`${Math.round(data.metrics.averageSavingsPercent)}%`} detail="Compared with individual prices" />
    </section>
    <div ref={listRef}><section className={styles.catalog} aria-labelledby="package-catalog-heading">
      <div className={styles.toolbar}>
        <div><h2 id="package-catalog-heading">Your package catalog</h2><span className={styles.count} role="status">{filtered ? `${visible.length} matching packages` : `${catalog.items.length} packages in your catalog`}</span></div>
        <div className={styles.filters}>
          <label className={styles.search}><span className="sr-only">Search packages</span><Search size={16} aria-hidden="true" /><input placeholder="Find a package or service…" value={query} onChange={event => { captureRows(); setLimit(12); setQuery(event.target.value); }} /></label>
          <Select value={category} onValueChange={value => { captureRows(); setLimit(12); setCategory(value); }}><SelectTrigger className={styles.select} aria-label="Filter by category"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="all">All packages</SelectItem>{data.categories.map(item => <SelectItem key={item} value={`category:${item}`}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={value => { captureRows(); setLimit(12); setSort(value); }}><SelectTrigger className={styles.select} aria-label="Sort packages"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="name">Name A–Z</SelectItem><SelectItem value="popular">Most booked</SelectItem><SelectItem value="price-low">Price: low to high</SelectItem><SelectItem value="price-high">Price: high to low</SelectItem></SelectContent></Select>
        </div>
      </div>
      <ul className={styles.list} data-package-area>{shown.map(item => <PackageRow key={item.id} item={item} pending={catalog.pendingIds.has(item.id)} fontClassName={fontClassName} onEdit={() => openEditor(item)} onDuplicate={() => editors.open({ ...item, id: 0, name: `${item.name} (copy)`, monthlySales: 0 })} onDelete={() => setDeleting(item)} />)}</ul>
      {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon} aria-hidden="true"><Boxes size={29} strokeWidth={1.5} /></span><h3>{filtered ? "No matching packages" : "Good things come together."}</h3><p>{filtered ? "Try another name, included service, or category." : "Combine services from your catalog to create your first package."}</p><button type="button" className={styles.secondary} onClick={filtered ? () => { captureRows(); setQuery(""); setCategory("all"); } : () => openEditor()}>{filtered ? "Clear filters" : "Add your first package"}</button></div></div>}
      {shown.length < visible.length && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length} matching packages</span><button type="button" className={styles.secondary} onClick={() => { captureRows(); setLimit(value => value + 12); }}>Show more packages<Plus size={14} aria-hidden="true" /></button></div>}
      <div className={styles.footer}><span>Booking value uses current prices; it is not collected revenue.</span><span>Package sales · This month</span></div>
    </section></div>
    {editors.sessions.filter(entry => (entry.state === "failed" || entry.state === "draft") && entry.id !== editors.activeId).map(entry => <button key={entry.id} type="button" className={styles.secondary} onClick={() => editors.resume(entry.id)}>Resume package draft {entry.id}</button>)}
    {editors.sessions.map(({ id: sessionId, item: editing }) => <PackageEditor key={sessionId} open={editors.activeId === sessionId} onOpenChange={open => open ? editors.resume(sessionId) : editors.dismiss(sessionId)} onDiscard={() => editors.status(sessionId, "saved")} item={editing} data={data} fontClassName={fontClassName} onSubmit={async details => {
      editors.status(sessionId, "pending");
      captureRows();
      const services = details.items.flatMap(entry => {
        const service = data.availableServices.find(candidate => candidate.id === entry.serviceId);
        return service ? [{ ...service, packageItemPrice: entry.customPrice }] : [];
      });
      const optimistic: OwnerCatalogPreviewPackage = { id: editing?.id || catalog.nextTemporaryId(), name: details.name, description: details.description ?? null, category: details.category, price: details.price, durationMinutes: details.duration ?? null, originalPrice: services.reduce((sum, service) => sum + service.price, 0), monthlySales: editing?.monthlySales ?? 0, services };
      const result = await (editing?.id ? catalog.update(optimistic, () => updatePackageAction(editing.id, details)) : catalog.create(optimistic, () => createPackageAction({ ...details, businessSlug: data.business.slug })));
      if (!result.success) editors.failed(sessionId, result.error);
      else {
        editors.status(sessionId, "saved");
        const saved = result.data;
        showCatalogSaved(`${saved.name} was ${editing?.id ? "updated" : "created"}.`, `[data-package-row="${saved.id}"]`, () => { setQuery(saved.name); setCategory("all"); setLimit(Number.MAX_SAFE_INTEGER); });
      }
      return result;
    }} />)}
    <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null); }} title={`Delete ${deleting?.name ?? "package"}?`} description="This permanently removes the package. Existing records may prevent deletion." pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))} error={null} onConfirm={confirmDelete} />
  </div></div>;
}

function PackageMetric({ icon: Icon, label, value, detail }: { icon: typeof Boxes; label: string; value: string; detail: string }) {
  return <article className={`${styles.metric} ${packages.metric}`}><div className={styles.metricLabel}><Icon size={15} aria-hidden="true" />{label}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function PackageRow({ item, pending, fontClassName, onEdit, onDelete, onDuplicate }: { item: OwnerCatalogPreviewPackage; pending: boolean; fontClassName: string; onDuplicate: () => void; onEdit: () => void; onDelete: () => void }) {
  const difference = item.originalPrice - item.price;
  const savings = item.originalPrice > 0 ? Math.round(difference / item.originalPrice * 100) : 0;
  return <li tabIndex={-1} data-package-row={item.id} aria-busy={pending || undefined} className={styles.row}><div className={packages.row}>
    <div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><Boxes size={20} strokeWidth={1.5} /></span><div className={styles.serviceCopy}><h3>{item.name}</h3><div className={styles.metadata}><span className={styles.category}>{item.category}</span>{item.durationMinutes !== null && <span className={styles.duration}><Clock3 size={11} aria-hidden="true" />{item.durationMinutes} min</span>}</div>{item.description && <p className={styles.serviceDescription}>{item.description}</p>}{pending && <div className={styles.saving}>Saving…</div>}</div></div>
    <div className={packages.included}><span>Included services</span><div className={packages.tags}>{item.services.length ? item.services.map(service => <span key={service.id}>{service.name}</span>) : <span>No services</span>}</div></div>
    <div className={`${styles.price} ${packages.price}`}><strong>{peso.format(item.price)}</strong><small>{item.originalPrice > 0 ? savings >= 0 ? `${savings}% savings` : `${Math.abs(savings)}% above individual prices` : "No price comparison"} · {item.monthlySales} sales</small></div>
    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={`${styles.rowActions} ${packages.actions}`} aria-label={`Actions for ${item.name}`} data-catalog-focus={`packages:${item.id}`} disabled={pending}><MoreHorizontal size={16} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${fontClassName} w-44`}><DropdownMenuItem onSelect={onEdit}><Pencil size={16} />Edit</DropdownMenuItem><DropdownMenuItem onSelect={onDuplicate}><Copy size={16} />Duplicate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={onDelete} className="text-[#C74248] focus:text-[#C74248]"><Trash2 size={16} />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div></li>;
}

function PackageEditor({ open, onOpenChange, item, data, fontClassName, onSubmit, onDiscard }: {
  onDiscard: () => void;
  open: boolean; onOpenChange: (open: boolean) => void; item: OwnerCatalogPreviewPackage | null; data: OwnerPackagesPreviewReadModel; fontClassName: string;
  onSubmit: (details: PackageDetails) => Promise<CatalogMutationResult<OwnerCatalogPreviewPackage>>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category ?? data.categories[0] ?? "");
  const [customCategory, setCustomCategory] = useState(!data.categories.includes(item?.category ?? data.categories[0] ?? ""));
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [duration, setDuration] = useState(item?.durationMinutes == null ? "" : String(item.durationMinutes));
  const [selected, setSelected] = useState<Record<number, string>>(() => Object.fromEntries((item?.services ?? []).map(service => [service.id, String(service.packageItemPrice)])));
  const [serviceQuery, setServiceQuery] = useState("");
  const [choices, setChoices] = useState<PackageChoice[]>(item?.choices ?? []);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const available = data.availableServices.filter(service => `${service.name} ${service.category}`.toLowerCase().includes(serviceQuery.trim().toLowerCase()));
  const originalPrice = data.availableServices.reduce((sum, service) => sum + (service.id in selected ? service.price : 0), 0);
  function toggle(id: number, defaultPrice: number) {
    setSelected(current => { const next = { ...current }; if (id in next) delete next[id]; else next[id] = String(defaultPrice); return next; });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const entries = Object.entries(selected);
    if (!name.trim() || !category.trim()) { toast.error("Enter a package name and category."); return; }
    if ((!entries.length && !choices.length) || entries.length + choices.length > 100) { toast.error("Add at least one service or choice, up to 100 inclusions."); return; }
    if (!packageChoicesSchema.safeParse(choices).success || choices.some(choice => !data.availableServices.some(service => matchesServiceRule(choice.rule, service)))) { toast.error("Give each choice a label and at least one eligible service."); return; }
    if (entries.some(([id, value]) => !data.availableServices.some(service => service.id === Number(id)) || value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0)) { toast.error("Set a valid price for each included service."); return; }
    submitting.current = true;
    setPending(true);
    onOpenChange(false);
    try {
      const result = await onSubmit({ choices, expectedRevision: item?.revision, name: name.trim(), description: description.trim() || undefined, category: category.trim(), price: Number(price), duration: duration === "" ? undefined : Number(duration), items: entries.map(([id, value]) => ({ serviceId: Number(id), customPrice: Number(value) })) });
      if (!result.success) return;
    } finally { submitting.current = false; setPending(false); }
  }
  return <CatalogDraftOverlay draftKey={JSON.stringify({name,description,category,price,duration,selected,choices})} onDiscard={onDiscard} open={open} onOpenChange={value => { if (!submitting.current) onOpenChange(value); }} title={item?.id ? "Edit package" : "Add a package"} description="Choose included services and set the package pricing." restoreFocusKey={item?.id ? `packages:${item.id}` : "packages:create"} className={`${styles.editor} ${packages.editor} ${fontClassName}`}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" aria-busy={pending || undefined}>
      <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}><fieldset disabled={pending} className={`${styles.editorFields} ${packages.fields}`}>
        <div className={styles.editorIntro}><Boxes size={25} strokeWidth={1.5} /><span>Combine complementary services into one offer. Included-service prices are saved separately from the package total.</span></div>
        <label>Package name<CatalogInput required maxLength={200} value={name} onChange={event => setName(event.target.value)} className={fieldClass} /></label>
        <label>Description<textarea maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full resize-y px-3.5 py-2.5" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="package-category-choice">Category</label><Select value={customCategory ? "new" : `existing:${category}`} disabled={pending} onValueChange={value => { setCustomCategory(value === "new"); setCategory(value === "new" ? "" : value.slice(9)); }}><SelectTrigger id="package-category-choice" className={styles.categorySelect}><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}>{data.categories.map(value => <SelectItem key={value} value={`existing:${value}`}>{value}</SelectItem>)}<SelectItem value="new">New category…</SelectItem></SelectContent></Select>{customCategory && <label className={styles.newCategory}>New category name<CatalogInput required maxLength={200} value={category} onChange={event => setCategory(event.target.value)} className={fieldClass} /></label>}</div><label>Duration (minutes)<CatalogInput type="number" min="0" max="2147483647" step="1" value={duration} onChange={event => setDuration(event.target.value)} className={fieldClass} /></label></div>
        <label className={packages.priceField}>Package price<CatalogInput required type="number" min="0" max="2147483647" step="0.01" value={price} onChange={event => setPrice(event.target.value)} className={fieldClass} /></label>
        <fieldset className={styles.formSection}><legend>Included services · {Object.keys(selected).length} selected</legend>
          {data.availableServices.length ? <><label className={packages.serviceSearch}>Find services<CatalogInput value={serviceQuery} onChange={event => setServiceQuery(event.target.value)} placeholder="Search name or category" className={fieldClass} /></label><div className={packages.serviceChoices}>{available.map(service => <div key={service.id} className={packages.serviceChoice}><label className={packages.checkLabel}><Checkbox checked={service.id in selected} disabled={pending} onCheckedChange={() => toggle(service.id, service.price)} aria-label={`Include ${service.name}`} /><span>{service.name}<small>{peso.format(service.price)} individually</small></span></label><label className={packages.itemPrice}>Item price<CatalogInput aria-label={`Package item price for ${service.name}`} required={service.id in selected} disabled={pending || !(service.id in selected)} type="number" min="0" max="2147483647" step="0.01" value={selected[service.id] ?? ""} onChange={event => setSelected(current => ({ ...current, [service.id]: event.target.value }))} /></label></div>)}{!available.length && <p>No services match your search.</p>}</div></> : <p className={packages.help}>Add services to your catalog before creating a package.</p>}
        </fieldset>
        <div className="grid gap-4">{choices.map((choice, index) => <section key={choice.id} className="grid gap-3"><label className="grid gap-2">Choice label<CatalogInput value={choice.label} required maxLength={120} onChange={event => setChoices(values => values.map((value, i) => i === index ? { ...value, label: event.target.value } : value))} /></label><ServiceRuleEditor label={choice.label || `Choice ${index + 1}`} rule={choice.rule} services={data.availableServices} fontClassName={fontClassName} onChange={rule => setChoices(values => values.map((value, i) => i === index ? { ...value, rule } : value))} /><button type="button" className={styles.secondary} onClick={() => setChoices(values => values.filter(value => value.id !== choice.id))}>Remove choice</button></section>)}</div>
        <button type="button" className={styles.secondary} disabled={choices.length >= 20} onClick={() => setChoices(values => [...values, { id: crypto.randomUUID(), label: "Choose your service", rule: { kind: "SERVICES", serviceIds: [] } }])}><Plus size={16} aria-hidden="true" />Add a choice</button>
        {choices.length > 0 ? <p className={packages.help}>All choices are included in the fixed package price. Values are allocated automatically using the selected services’ regular prices. Duration follows the selected services. Savings depend on the choices made.</p> : <div className={styles.previewPrice}><span>Individual prices total</span><strong>{peso.format(originalPrice)}</strong></div>}
        <div className={styles.previewPrice}><span>Package total</span><strong>{peso.format(Number(price) || 0)}</strong></div>
        <p className={packages.help}>{originalPrice >= Number(price) ? `Customers save ${peso.format(originalPrice - (Number(price) || 0))} compared with booking separately.` : "The package price is higher than booking these services separately."} Item prices allocate value between services; they do not automatically change the package total.</p>
      </fieldset></ScrollArea>
      <CatalogEditorFooter className={styles.editorFooter}><CatalogEditorClose type="button" disabled={pending} className={styles.secondary}>Cancel</CatalogEditorClose><button type="submit" disabled={pending || !data.availableServices.length} className={styles.primary}>{pending ? "Saving…" : item?.id ? "Save changes" : "Create package"}</button></CatalogEditorFooter>
    </form>
  </CatalogDraftOverlay>;
}
