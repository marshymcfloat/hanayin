"use client";

import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import {
  Clock3,
  MoreHorizontal,
  Package,
  Pencil,
  Search,
  SlidersHorizontal,
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
  CatalogEmptyState,
  CatalogHeader,
  CatalogKpi,
  CatalogPageFrame,
  ConfirmDeleteDialog,
  MutationNotice,
} from "@/components/dashboard/owner-preview/OwnerCatalogPreviewShared";
import {
  CatalogEditorBody,
  CatalogEditorClose,
  CatalogEditorFooter,
  CatalogEditorOverlay,
} from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOptimisticCatalog } from "@/components/dashboard/owner-preview/useOptimisticCatalog";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
const fieldClass =
  "mt-1.5 h-11 w-full rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm text-[#20211F] outline-none placeholder:text-[#9A9D97] focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20";

export function OwnerServicesPreview({
  data,
  refreshControl,
  onChanged,
}: {
  data: OwnerServicesPreviewReadModel;
  refreshControl?: ReactNode;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewService>) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [editing, setEditing] = useState<OwnerCatalogPreviewService | null>(
    null,
  );
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewService | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const catalog = useOptimisticCatalog(data.services, onChanged);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      catalog.items.filter((service) => {
        const haystack =
          `${service.name} ${service.category} ${service.description ?? ""}`.toLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (category === "all" || service.category === category)
        );
      }),
    [category, catalog.items, normalizedQuery],
  );

  function openCreate() {
    setEditing(null);
    setEditorSession((value) => value + 1);
    setEditorOpen(true);
  }
  function openEdit(service: OwnerCatalogPreviewService) {
    setEditing(service);
    setEditorSession((value) => value + 1);
    setEditorOpen(true);
  }
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    const target = deleting;
    setDeleting(null);
    const result = await catalog.remove(target.id, async () => {
      const response = await deleteServiceAction(target.id);
      return response.success
        ? { success: true as const, data: target }
        : response;
    });
    if (!result.success) {
      setDeleteError(result.error);
      setDeleting(target);
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "success", text: `${target.name} was deleted.` });
  }

  const filtered = Boolean(normalizedQuery || category !== "all");
  return (
    <CatalogPageFrame businessSlug={data.business.slug} active="services">
      <CatalogHeader businessSlug={data.business.slug} businessName={data.business.name} context="Business catalog" title="Services" description="Shape what customers can book, keep pricing healthy, and spot your strongest offers." actionLabel="Add service" shortActionLabel="Service" actionFocusKey="services:create" onAction={openCreate} refreshControl={refreshControl} />
      <MutationNotice notice={notice} />
      <section aria-label="Service catalog overview" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CatalogKpi label="Total services" value={String(data.metrics.totalServices)} detail="Available in your catalog" icon={Package} tone="lime" />
        <CatalogKpi label="Monthly bookings" value={String(data.metrics.monthlyBookings)} detail="Accepted or completed this month" icon={Sparkles} tone="dark" />
        <CatalogKpi label="Average margin" value={`${Math.round(data.metrics.averageMarginPercent)}%`} detail="Based on estimated cost" icon={TrendingUp} tone="ring" ring={data.metrics.averageMarginPercent} />
        <CatalogKpi label="Average duration" value={`${Math.round(data.metrics.averageDurationMinutes)}m`} detail="Across services with a duration" icon={Clock3} tone="neutral" />
      </section>
      <section className="mt-4 overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:mt-5 sm:rounded-[30px]" aria-labelledby="catalog-heading">
        <div className="border-b border-[#ECEEE9] p-3 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-baseline justify-between gap-3 sm:block"><h2 id="catalog-heading" className="text-base font-bold tracking-[-0.02em] sm:text-lg">Service catalog</h2><p className="text-[10px] font-medium text-[#81847E] sm:mt-1 sm:text-xs">{visible.length} of {catalog.items.length} services</p></div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2 sm:flex lg:mt-0">
            <label className="relative block min-w-0 sm:w-72"><span className="sr-only">Search services</span><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]" aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services" className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none placeholder:text-[#9A9D97] focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label>
            <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Filter by category" className="!h-11 w-full min-w-0 cursor-pointer rounded-[14px] border-[#E1E3DE] bg-[#F8F9F6] px-3 text-xs font-semibold shadow-none focus-visible:border-[#72CF35] focus-visible:ring-[#72CF35]/20 sm:w-48 sm:text-sm"><SlidersHorizontal className="hidden h-4 w-4 sm:block" aria-hidden="true" /><SelectValue /></SelectTrigger><SelectContent className="rounded-[16px] border-[#E1E3DE] bg-white p-2"><SelectItem value="all">All services</SelectItem>{data.categories.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        {visible.length > 0 ? <ul className="divide-y divide-[#ECEEE9]">{visible.map(service => <ServiceRow key={service.id} service={service} pending={catalog.pendingIds.has(service.id)} onEdit={() => openEdit(service)} onDelete={() => { setDeleteError(null); setDeleting(service); }} />)}</ul> : <CatalogEmptyState title={filtered ? "No matching services" : "No services yet"} description={filtered ? "Try another search or category." : "Add your first service to make it available in the catalog."} filtered={filtered} onClear={() => { setQuery(""); setCategory("all"); }} />}
      </section>
      <ServiceEditorDialog
          key={`${editing?.id ?? "new"}-${editorSession}`}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          service={editing}
          categories={data.categories}
          onSubmit={(payload) => {
                    const optimistic: OwnerCatalogPreviewService = {
              id: editing?.id ?? catalog.nextTemporaryId(),
              name: payload.name,
              description: payload.description ?? null,
              category: payload.category,
              price: payload.price,
              estimatedCost: payload.estimated_cost ?? 0,
              durationMinutes: payload.duration ?? null,
              monthlyBookings: editing?.monthlyBookings ?? 0,
            };
            return editing
              ? catalog.update(optimistic, () => updateServiceAction(editing.id, payload))
              : catalog.create(optimistic, () => createServiceAction(payload));
          }}
          onSaved={(saved, edited) => {
            setNotice({
              tone: "success",
              text: `${saved.name} was ${edited ? "updated" : "created"}.`,
            });
          }}
        />
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? "service"}?`}
        description="This permanently removes the service. Existing records may prevent deletion."
        pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </CatalogPageFrame>
  );
}

function ServiceRow({
  service,
  pending,
  onEdit,
  onDelete,
}: {
  service: OwnerCatalogPreviewService;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const margin =
    service.price > 0
      ? Math.round(
          ((service.price - service.estimatedCost) / service.price) * 100,
        )
      : 0;
  return (
    <li aria-busy={pending || undefined} className={`p-2.5 transition-colors hover:bg-[#FAFBF8] sm:p-5 ${pending ? "bg-[#F8FBEF] opacity-75" : ""}`}>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.35fr)_minmax(150px,.55fr)_minmax(140px,.45fr)_44px] md:items-center md:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#EFF9E8] text-[#4D8F24] sm:h-11 sm:w-11 sm:rounded-[14px]"><Package className="h-[18px] w-[18px]" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-bold sm:text-[15px]">{service.name}</h3>{pending ? <span className="shrink-0 rounded-full bg-[#E9F6DF] px-2 py-0.5 text-[9px] font-bold text-[#3D791E]">Saving…</span> : null}</div>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#696C67] sm:mt-1 sm:text-xs">{service.category}{service.durationMinutes !== null ? ` · ${service.durationMinutes} min` : ""}</p>
            <p className="mt-1 hidden text-xs leading-5 text-[#81847E] sm:line-clamp-2">{service.description || "No description provided."}</p>
          </div>
          <ServiceActions name={service.name} focusKey={`services:${service.id}`} onEdit={onEdit} onDelete={onDelete} disabled={pending} className="grid md:hidden" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 rounded-[12px] bg-[#F7F8F5] px-2.5 py-1.5 md:block md:bg-transparent md:p-0">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">Price / cost</p><p className="mt-1 font-mono text-sm font-bold">{peso.format(service.price)}</p><p className="mt-0.5 text-[10px] text-[#696C67] md:mt-1 md:text-[11px]">{peso.format(service.estimatedCost)} est. cost</p></div>
          <div className="md:hidden"><div className="flex items-center justify-between text-[10px] font-semibold text-[#696C67]"><span>Margin</span><span className="font-mono text-[#3D791E]">{margin}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E5E8E1]"><div className="h-full rounded-full bg-[#72CF35]" style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} /></div><p className="mt-1 truncate text-[10px] text-[#696C67]">{service.monthlyBookings} bookings this month</p></div>
        </div>
        <div className="hidden md:block"><div className="flex items-center justify-between text-[10px] font-semibold text-[#696C67]"><span>Margin</span><span className="font-mono text-[#3D791E]">{margin}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ECEEE9]"><div className="h-full rounded-full bg-[#72CF35]" style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} /></div><p className="mt-1.5 text-[11px] text-[#696C67]">{service.monthlyBookings} bookings this month</p></div>
        <ServiceActions name={service.name} focusKey={`services:${service.id}`} onEdit={onEdit} onDelete={onDelete} disabled={pending} className="hidden md:grid" />
      </div>
    </li>
  );
}

function ServiceActions({
  name,
  focusKey,
  onEdit,
  onDelete,
  className,
  disabled,
}: {
  name: string;
  focusKey: string;
  onEdit: () => void;
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
          className={`${className} h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-[#696C67] outline-none hover:bg-[#F1F2EF] focus-visible:ring-3 focus-visible:ring-[#72CF35]`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-[14px] p-1.5">
        <DropdownMenuItem
          onSelect={onEdit}
          className="min-h-10 cursor-pointer rounded-[10px]"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
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
  open,
  onOpenChange,
  service,
  categories,
  onSaved,
  onSubmit,
}: {
  open: boolean;
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
  const [price, setPrice] = useState(service ? String(service.price) : "");
  const [cost, setCost] = useState(
    service ? String(service.estimatedCost) : "",
  );
  const [duration, setDuration] = useState(
    service?.durationMinutes === null || service?.durationMinutes === undefined
      ? ""
      : String(service.durationMinutes),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
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
    try {
      const result = await onSubmit(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onSaved(result.data, Boolean(service));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <CatalogEditorOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={service ? "Edit service" : "Add a service"}
      description="Set the booking details, duration, and estimated margin."
      restoreFocusKey={service ? `services:${service.id}` : "services:create"}
    >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <CatalogEditorBody className="space-y-3">
            <label className="block text-xs font-semibold text-[#555852]">
              Service name
              <input
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
              <label className="block text-xs font-semibold text-[#555852]">
                Category
                <input required list="service-categories" maxLength={200} value={category} onChange={event => setCategory(event.target.value)} className={fieldClass} />
                <datalist id="service-categories">{categories.map(item => <option key={item} value={item} />)}</datalist>
              </label>
              <label className="block text-xs font-semibold text-[#555852]">
                Duration (minutes)
                <input
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
                <input
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
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-[12px] bg-[#FFF0F0] px-3 py-2 text-sm font-semibold text-[#C74248]"
              >
                {error}
              </p>
            ) : null}
          </CatalogEditorBody>
          <CatalogEditorFooter>
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
    </CatalogEditorOverlay>
  );
}
