"use client";

import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Scissors,
  Clock3,
  MoreHorizontal,
  Copy,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  createServiceAction,
  deleteServiceAction,
  updateServiceAction,
} from "@/features/catalog/actions/services";
import type {
  OwnerCatalogCommittedChange,
  OwnerCatalogPreviewService,
  OwnerServicesPreviewReadModel,
} from "@/features/catalog/types/owner-catalog-preview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDeleteDialog,
} from "@/components/dashboard/owner-preview/OwnerCatalogPreviewShared";
import {
  CatalogEditorClose,
  CatalogEditorFooter,
} from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOptimisticCatalog } from "@/components/dashboard/owner-preview/useOptimisticCatalog";
import Link from "next/link";
import { toast } from "sonner";
import { CatalogDraftOverlay } from "@/components/dashboard/owner-preview/CatalogDraftOverlay";
import { CatalogInput } from "@/components/dashboard/owner-preview/CatalogInput";
import { showCatalogSaved } from "@/components/dashboard/owner-preview/showCatalogSaved";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useCatalogEditorSessions } from "@/components/dashboard/owner-preview/useCatalogEditorSessions";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import { ScrollArea } from "@/components/ui/scroll-area";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const fieldClass =
  "mt-1.5 h-11 w-full rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm text-[#20211F] outline-none placeholder:text-[#9A9D97] focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20";

export function OwnerServicesStudy({
  data,
  fontClassName = "",
  refreshControl,
  onChanged,
}: {
  data: OwnerServicesPreviewReadModel;
  fontClassName?: string;
  refreshControl?: ReactNode;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewService>) => void;
}) {
  const [query, setQuery] = useCatalogListState(`${data.business.slug}:Services`, "query", "");
  const [category, setCategory] = useCatalogListState(`${data.business.slug}:Services`, "category", "all");
  const [sort, setSort] = useCatalogListState(`${data.business.slug}:Services`, "sort", "name");
  const [visibleLimit, setVisibleLimit] = useCatalogListState(`${data.business.slug}:Services`, "visibleLimit", 12);
  const listRef = useRef<HTMLDivElement>(null);
  useCatalogScroll(`${data.business.slug}:Services`, listRef);
  const editors = useCatalogEditorSessions<OwnerCatalogPreviewService>();
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewService | null>(
    null,
  );
  const catalog = useOptimisticCatalog(data.services, onChanged);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      [...catalog.items].filter((service) => {
        const haystack =
          `${service.name} ${service.category} ${service.description ?? ""}`.toLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (category === "all" || service.category === category)
        );
      }).sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : sort === "popular" ? b.monthlyBookings - a.monthlyBookings : a.name.localeCompare(b.name)),
    [category, catalog.items, normalizedQuery, sort],
  );

  const shown = visible.slice(0, visibleLimit);
  const captureRows = useSelectionMotion(listRef, shown.map(service => service.id).join(","), "service");

  function openCreate() {
    editors.open();
  }
  function openEdit(service: OwnerCatalogPreviewService) {
    editors.open(service);
  }
  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    captureRows();
    const result = await catalog.remove(target.id, async () => {
      const response = await deleteServiceAction(target.id);
      return response.success
        ? { success: true as const, data: target }
        : response;
    });
    if (!result.success) {
      setDeleting(target);
      toast.error(result.error);
      return;
    }
    toast.success(`${target.name} was deleted.`);
  }

  const filtered = Boolean(normalizedQuery || category !== "all");
  return (
    <div className={`${styles.page} ${fontClassName}`}>
      <div className={styles.content}>
        <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>{data.business.name} · Your treatment menu</p><h1>Services<span className={styles.titleDetail}>, thoughtfully offered.</span></h1><p className={styles.description}>Your treatments, timing, and pricing. All in one place.</p></div>
          <div className={styles.actions}><div className={styles.refresh}>{refreshControl}</div><button type="button" className={styles.primary} data-catalog-focus="services:create" onClick={openCreate}><Plus size={17} aria-hidden="true" />Add service</button></div>
        </header>
        <section className={styles.summary} aria-label="Service catalog overview">
          <ServiceMetric icon={Scissors} label="Total services" value={String(catalog.items.length)} detail="Treatments in your catalog" />
          <ServiceMetric icon={Sparkles} label="Monthly bookings" value={String(data.metrics.monthlyBookings)} detail="Accepted or completed this month" />
          <ServiceMetric icon={TrendingUp} label="Average margin" value={`${Math.round(data.metrics.averageMarginPercent)}%`} detail="Based on estimated service cost" />
          <ServiceMetric icon={Clock3} label="Average duration" value={`${Math.round(data.metrics.averageDurationMinutes)} min`} detail="Across services with a duration" />
        </section>
        <div ref={listRef}>
          <section id="catalog" className={styles.catalog} aria-labelledby="catalog-heading">
            <div className={styles.toolbar}>
              <div><h2 id="catalog-heading">Your service catalog</h2><span className={styles.count} role="status">{filtered ? `${visible.length} matching services` : `${catalog.items.length} services in your catalog`}</span></div>
              <div className={styles.filters}>
                <label className={styles.search}><span className="sr-only">Search services</span><Search size={16} aria-hidden="true" /><input placeholder="Find a treatment…" value={query} onChange={event => { captureRows(); setVisibleLimit(12); setQuery(event.target.value); }} /></label>
                <Select value={category} onValueChange={value => { captureRows(); setVisibleLimit(12); setCategory(value); }}><SelectTrigger className={styles.select} aria-label="Filter by category"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="all">All services</SelectItem>{data.categories.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
                <Select value={sort} onValueChange={value => { captureRows(); setVisibleLimit(12); setSort(value); }}><SelectTrigger className={styles.select} aria-label="Sort services"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="name">Name A–Z</SelectItem><SelectItem value="popular">Most booked</SelectItem><SelectItem value="price-low">Price: low to high</SelectItem><SelectItem value="price-high">Price: high to low</SelectItem></SelectContent></Select>
              </div>
            </div>
            <ul className={styles.list} data-service-area>
              {shown.map(service => <ServiceRow fontClassName={fontClassName} key={service.id} service={service} pending={catalog.pendingIds.has(service.id)} onEdit={() => openEdit(service)} onDuplicate={() => editors.open({ ...service, id: 0, name: `${service.name} (copy)`, monthlyBookings: 0 })} onDelete={() => { setDeleting(service); }} />)}
            </ul>
            {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon} aria-hidden="true"><Scissors size={29} strokeWidth={1.5} /></span><h3>{filtered ? "No matching services" : "Your next signature treatment starts here."}</h3><p>{filtered ? "Try another name or category to find the treatment you need." : "Add your first service, with its price and timing, to start shaping your catalog."}</p><button type="button" className={styles.secondary} onClick={filtered ? () => { captureRows(); setQuery(""); setCategory("all"); } : openCreate}>{filtered ? "Clear filters" : "Add your first service"}</button></div></div>}
            {shown.length < visible.length && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length} matching services</span><button type="button" className={styles.secondary} onClick={() => { captureRows(); setVisibleLimit(limit => limit + 12); }}>Show more services<Plus size={14} aria-hidden="true" /></button></div>}
            <div className={styles.footer}><span>Margins use estimated costs, not actual profit.</span><span>Booking counts · This month</span></div>
          </section>
        </div>
    {editors.sessions.filter(entry => (entry.state === "failed" || entry.state === "draft") && entry.id !== editors.activeId).map(entry => <button key={entry.id} type="button" className={styles.secondary} onClick={() => editors.resume(entry.id)}>Resume service draft {entry.id}</button>)}
      {editors.sessions.map(({ id: sessionId, item: editing }) => <ServiceEditorDialog
          fontClassName={fontClassName}
          key={sessionId}
          open={editors.activeId === sessionId}
          onOpenChange={open => open ? editors.resume(sessionId) : editors.dismiss(sessionId)} onDiscard={() => editors.status(sessionId, "saved")}
          service={editing}
          categories={data.categories}
          onSubmit={async (payload) => {
            editors.status(sessionId, "pending");
            captureRows();
            const optimistic: OwnerCatalogPreviewService = {
              id: editing?.id || catalog.nextTemporaryId(),
              name: payload.name,
              description: payload.description ?? null,
              category: payload.category,
              price: payload.price,
              estimatedCost: payload.estimated_cost ?? 0,
              durationMinutes: payload.duration ?? null,
              monthlyBookings: editing?.monthlyBookings ?? 0,
            };
            const result = await (editing?.id
              ? catalog.update(optimistic, () => updateServiceAction(editing.id, payload))
              : catalog.create(optimistic, () => createServiceAction(payload)));
            if (!result.success) editors.failed(sessionId, result.error);
            else editors.status(sessionId, "saved");
            return result;
          }}
          onSaved={(saved, edited) => {
            showCatalogSaved(`${saved.name} was ${edited ? "updated" : "created"}.`, `[data-service-row="${saved.id}"]`, () => { setQuery(saved.name); setCategory("all"); setVisibleLimit(Number.MAX_SAFE_INTEGER); });
          }}
        />)}
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? "service"}?`}
        description="This permanently removes the service. Existing records may prevent deletion."
        pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))}
        error={null}
        onConfirm={confirmDelete}
      />
      </div>
    </div>
  );
}

function ServiceRow({
  fontClassName,
  service,
  pending,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  service: OwnerCatalogPreviewService;
  fontClassName: string;
  pending: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const margin =
    service.price > 0
      ? Math.round(
          ((service.price - service.estimatedCost) / service.price) * 100,
        )
      : 0;
  return (
    <li tabIndex={-1} data-service-row={service.id} aria-busy={pending || undefined} className={styles.row}>
      <div className={styles.rowInner}>
        <div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><Scissors size={20} strokeWidth={1.5} /></span><div className={styles.serviceCopy}>
          <h3>{service.name}</h3><div className={styles.metadata}><span className={styles.category}>{service.category}</span>{service.durationMinutes !== null && <span className={styles.duration}><Clock3 size={11} aria-hidden="true" />{service.durationMinutes} min</span>}</div>
          {service.description && <p className={styles.serviceDescription}>{service.description}</p>}{pending && <div className={styles.saving}>Saving…</div>}
        </div></div>
        <div className={styles.price}><strong>{peso.format(service.price)}</strong><small>{peso.format(service.estimatedCost)} estimated cost</small></div>
        <div className={styles.performance}><div className={styles.margin}><span>Est. margin</span><strong>{margin}%</strong></div><div className={styles.track} aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0, Math.min(100, margin)) / 100})` }} /></div><small>{service.monthlyBookings} bookings this month</small></div>
        <ServiceActions fontClassName={fontClassName} name={service.name} focusKey={`services:${service.id}`} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} disabled={pending} className={styles.rowActions} />
      </div>
    </li>
  );
}

function ServiceMetric({ icon: Icon, label, value, detail }: { icon: typeof Scissors; label: string; value: string; detail: string }) {
  return <article className={styles.metric}><div className={styles.metricLabel}><Icon size={15} aria-hidden="true" />{label}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function ServiceActions({
  fontClassName,
  name,
  focusKey,
  onEdit,
  onDuplicate,
  onDelete,
  className,
  disabled,
}: {
  name: string;
  fontClassName: string;
  focusKey: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  className: string;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-catalog-focus={focusKey}
          aria-label={`Actions for ${name}`}
          disabled={disabled}
          className={className}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`${styles.menu} ${fontClassName} w-44`}>
        <DropdownMenuItem
          onSelect={onEdit}
          className="min-h-10 cursor-pointer rounded-[10px]"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}><Copy size={16} />Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="min-h-10 cursor-pointer rounded-[10px] text-[#C74248] focus:text-[#C74248]"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ServiceEditorDialog({
  fontClassName,
  open,
  onOpenChange,
  service,
  categories,
  onSaved,
  onDiscard,
  onSubmit,
}: {
  onDiscard: () => void;
  open: boolean;
  fontClassName: string;
  onOpenChange: (open: boolean) => void;
  service: OwnerCatalogPreviewService | null;
  categories: string[];
  onSaved: (service: OwnerCatalogPreviewService, edited: boolean) => void;
  onSubmit: (payload: {
    name: string;
    description?: string;
    category: string;
    price: number;
    estimated_cost?: number;
    duration?: number;
  }) => Promise<{ success: true; data: OwnerCatalogPreviewService } | { success: false; error: string }>;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [category, setCategory] = useState(
    service?.category ?? categories[0] ?? "",
  );
  const [customCategory, setCustomCategory] = useState(!categories.includes(service?.category ?? categories[0] ?? ""));
  const [price, setPrice] = useState(service ? String(service.price) : "");
  const [cost, setCost] = useState(
    service ? String(service.estimatedCost) : "",
  );
  const [duration, setDuration] = useState(
    service?.durationMinutes === null || service?.durationMinutes === undefined
      ? ""
      : String(service.durationMinutes),
  );
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim() || !category.trim()) { toast.error("Enter a service name and category."); return; }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim(),
      price: Number(price),
      estimated_cost: cost === "" ? undefined : Number(cost),
      duration: duration === "" ? undefined : Number(duration),
    };
    submitting.current = true;
    setPending(true);
    onOpenChange(false);
    try {
      const result = await onSubmit(payload);
      if (!result.success) return;
      onSaved(result.data, Boolean(service?.id));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <CatalogDraftOverlay draftKey={JSON.stringify({name,description,category,price,cost,duration})} onDiscard={onDiscard}
      open={open}
      onOpenChange={onOpenChange}
      title={service?.id ? "Edit service" : "Add a service"}
      description="Set the booking details, duration, and estimated margin."
      restoreFocusKey={service?.id ? `services:${service.id}` : "services:create"}
      className={`${styles.editor} ${fontClassName}`}
    >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}>
            <div className={styles.editorFields}>
            <div className={styles.editorIntro}><Scissors size={25} strokeWidth={1.5} /><span>A clear name, the right timing, and a considered price. Make this treatment easy to choose.</span></div>
            <label className="block text-xs font-semibold text-[#555852]">
              Service name
              <CatalogInput
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-xs font-semibold text-[#555852]">
              Description
              <textarea
                maxLength={10000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1.5 min-h-20 w-full resize-y rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 py-2.5 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="service-category-choice">Category</label>
                <Select value={customCategory ? "new" : `existing:${category}`} onValueChange={value => { setCustomCategory(value === "new"); setCategory(value === "new" ? "" : value.slice(9)); }}>
                  <SelectTrigger id="service-category-choice" className={styles.categorySelect}><SelectValue /></SelectTrigger>
                  <SelectContent className={`${styles.menu} ${fontClassName}`}>{categories.map(item => <SelectItem key={item} value={`existing:${item}`}>{item}</SelectItem>)}<SelectItem value="new">New category…</SelectItem></SelectContent>
                </Select>
                {customCategory && <label className={styles.newCategory}>New category name<CatalogInput required maxLength={200} value={category} onChange={event => setCategory(event.target.value)} className={fieldClass} /></label>}
              </div>
              <label className="block text-xs font-semibold text-[#555852]">
                Duration (minutes)
                <CatalogInput
                  type="number"
                  min="0"
                  step="1"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[#555852]">
                Price
                <CatalogInput
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-xs font-semibold text-[#555852]">
                Estimated cost
                <CatalogInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <p className="text-xs text-[#756580]">Estimated cost is optional. It helps estimate margin and does not change the customer’s price.</p>
            <div className={styles.previewPrice}><span>Service price</span><strong>{peso.format(Number(price) || 0)}</strong></div>
            </div>
          </ScrollArea>
          <CatalogEditorFooter className={styles.editorFooter}>
            <CatalogEditorClose
                type="button"
                disabled={pending}
                className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] bg-white px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
              >
                Cancel
            </CatalogEditorClose>
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-full bg-[#20211F] px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {pending
                ? "Saving…"
                : service
                  ? "Save changes"
                  : "Create service"}
            </button>
          </CatalogEditorFooter>
        </form>
    </CatalogDraftOverlay>
  );
}
