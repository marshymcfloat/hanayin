"use client";

import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  Boxes,
  Clock3,
  MoreHorizontal,
  Pencil,
  PhilippinePeso,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  createPackageAction,
  deletePackageAction,
  updatePackageAction,
} from "@/features/catalog/actions/packages";
import type {
  OwnerCatalogCommittedChange,
  OwnerCatalogPreviewPackage,
  OwnerPackagesPreviewReadModel,
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
  CatalogCheckbox,
  CatalogEmptyState,
  CatalogHeader,
  CatalogKpi,
  CatalogPageFrame,
  ConfirmDeleteDialog,
  MutationNotice,
} from "./OwnerCatalogPreviewShared";
import { CatalogEditorBody, CatalogEditorClose, CatalogEditorFooter, CatalogEditorOverlay } from "./CatalogEditorOverlay";
import { useOptimisticCatalog } from "./useOptimisticCatalog";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
const fieldClass =
  "mt-1.5 h-11 w-full rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20";

export function OwnerPackagesPreview({
  data,
  refreshControl,
  onChanged,
}: {
  data: OwnerPackagesPreviewReadModel;
  refreshControl?: ReactNode;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewPackage>) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [editing, setEditing] = useState<OwnerCatalogPreviewPackage | null>(
    null,
  );
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewPackage | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const catalog = useOptimisticCatalog(data.packages, onChanged);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      catalog.items.filter((item) => {
        const haystack =
          `${item.name} ${item.category} ${item.description ?? ""} ${item.services.map((service) => service.name).join(" ")}`.toLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (category === "all" || item.category === category)
        );
      }),
    [category, catalog.items, normalizedQuery],
  );
  const filtered = Boolean(normalizedQuery || category !== "all");
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    const target = deleting;
    setDeleting(null);
    const result = await catalog.remove(target.id, async () => {
      const response = await deletePackageAction(target.id);
      return response.success ? { success: true as const, data: target } : response;
    });
    if (!result.success) {
      setDeleteError(result.error);
      setDeleting(target);
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "success", text: `${target.name} was deleted.` });
  }

  return (
    <CatalogPageFrame businessSlug={data.business.slug} active="packages">
      <CatalogHeader
        businessSlug={data.business.slug}
        businessName={data.business.name}
        context="Business catalog"
        title="Packages"
        description="Bundle services into clear, bookable offers and track how each package performs."
        actionLabel="Add package"
        shortActionLabel="Package"
        actionFocusKey="packages:create"
        refreshControl={refreshControl}
        onAction={() => {
          setEditing(null);
          setEditorSession((value) => value + 1);
          setEditorOpen(true);
        }}
      />
      <MutationNotice notice={notice} />
      <section
        aria-label="Package catalog overview"
        className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <CatalogKpi
          label="Total packages"
          value={String(data.metrics.totalPackages)}
          detail="Available package offers"
          icon={Boxes}
          tone="lime"
        />
        <CatalogKpi
          label="Monthly sales"
          value={String(data.metrics.monthlySales)}
          detail="Unique bookings this month"
          icon={BadgePercent}
          tone="dark"
        />
        <CatalogKpi
          label="Monthly revenue"
          value={new Intl.NumberFormat("en-PH", {
            maximumFractionDigits: 0,
          }).format(data.metrics.monthlyRevenue)}
          detail="From package bookings"
          icon={PhilippinePeso}
          tone="neutral"
          currency
        />
        <CatalogKpi
          label="Average savings"
          value={`${Math.round(data.metrics.averageSavingsPercent)}%`}
          detail="Compared with service prices"
          icon={Clock3}
          tone="ring"
          ring={data.metrics.averageSavingsPercent}
        />
      </section>
      <section
        aria-labelledby="package-library-heading"
        className="mt-4 overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:mt-5 sm:rounded-[30px]"
      >
        <div className="border-b border-[#ECEEE9] p-3 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-baseline justify-between gap-3 sm:block">
            <h2
              id="package-library-heading"
              className="text-base font-bold sm:text-lg"
            >
              Package library
            </h2>
            <p className="text-[10px] text-[#81847E] sm:mt-1 sm:text-xs">
              {visible.length} of {catalog.items.length} packages
            </p>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2 sm:flex lg:mt-0">
            <label className="relative block min-w-0 sm:w-72">
              <span className="sr-only">Search packages</span>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search packages"
                className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
              />
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                aria-label="Filter by category"
                className="!h-11 w-full rounded-[14px] border-[#E1E3DE] bg-[#F8F9F6] text-xs font-semibold shadow-none sm:w-48 sm:text-sm"
              >
                <SlidersHorizontal className="hidden h-4 w-4 sm:block" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All packages</SelectItem>
                {data.categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {visible.length > 0 ? (
          <ul className="divide-y divide-[#ECEEE9]">
            {visible.map((item) => (
              <PackageRow
                key={item.id}
                item={item}
                pending={catalog.pendingIds.has(item.id)}
                onEdit={() => {
                  setEditing(item);
                  setEditorSession((value) => value + 1);
                  setEditorOpen(true);
                }}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleting(item);
                }}
              />
            ))}
          </ul>
        ) : (
          <CatalogEmptyState
            title={filtered ? "No matching packages" : "No packages yet"}
            description={
              filtered
                ? "Try another search or category."
                : "Create a package from services already in your catalog."
            }
            filtered={filtered}
            onClear={() => {
              setQuery("");
              setCategory("all");
            }}
          />
        )}
      </section>
      <PackageEditorDialog
          key={`${editing?.id ?? "new"}-${editorSession}`}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          item={editing}
          data={data}
          onSubmit={(details) => {
            const services = details.items.flatMap((entry) => {
              const service = data.availableServices.find((candidate) => candidate.id === entry.serviceId);
              return service ? [{ ...service, packageItemPrice: entry.customPrice }] : [];
            });
            const optimistic: OwnerCatalogPreviewPackage = {
              id: editing?.id ?? catalog.nextTemporaryId(),
              name: details.name,
              description: details.description ?? null,
              category: details.category,
              price: details.price,
              durationMinutes: details.duration ?? null,
              originalPrice: services.reduce((sum, service) => sum + service.price, 0),
              monthlySales: editing?.monthlySales ?? 0,
              services,
            };
            return editing
              ? catalog.update(optimistic, () => updatePackageAction(editing.id, details))
              : catalog.create(optimistic, () => createPackageAction({ ...details, businessSlug: data.business.slug }));
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
        title={`Delete ${deleting?.name ?? "package"}?`}
        description="This permanently removes the package. Existing records may prevent deletion."
        pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </CatalogPageFrame>
  );
}

function PackageRow({
  item,
  pending,
  onEdit,
  onDelete,
}: {
  item: OwnerCatalogPreviewPackage;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const savings =
    item.originalPrice > 0
      ? Math.max(0, Math.round((1 - item.price / item.originalPrice) * 100))
      : 0;
  return (
    <li aria-busy={pending || undefined} className={`p-3 transition-colors hover:bg-[#FAFBF8] sm:p-5 ${pending ? "bg-[#F8FBEF] opacity-75" : ""}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(210px,1fr)_minmax(155px,.55fr)_44px] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#EFF9E8] text-[#4D8F24]">
            <Boxes className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-[15px] font-bold">{item.name}</h3>{pending ? <span className="shrink-0 rounded-full bg-[#E9F6DF] px-2 py-0.5 text-[9px] font-bold text-[#3D791E]">Saving…</span> : null}</div>
            <p className="mt-1 text-xs font-semibold text-[#696C67]">
              {item.category}
              {item.durationMinutes !== null
                ? ` · ${item.durationMinutes} min`
                : ""}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#81847E]">
              {item.description || "No description provided."}
            </p>
          </div>
          <PackageActions
            name={item.name}
            focusKey={`packages:${item.id}`}
            onEdit={onEdit}
            onDelete={onDelete}
            disabled={pending}
            className="grid lg:hidden"
          />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            Included services
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.services.length ? (
              item.services.map((service) => (
                <span
                  key={service.id}
                  className="rounded-full bg-[#F1F2EF] px-2 py-1 text-[10px] font-semibold text-[#555852]"
                >
                  {service.name}
                </span>
              ))
            ) : (
              <span className="text-xs text-[#81847E]">No services</span>
            )}
          </div>
        </div>
        <div className="rounded-[14px] bg-[#F7F8F5] p-3 lg:bg-transparent lg:p-0">
          <p className="font-mono text-sm font-bold">
            {peso.format(item.price)}
          </p>
          <p className="mt-1 text-[11px] text-[#696C67]">
            {savings}% savings · {item.monthlySales} sales
          </p>
        </div>
        <PackageActions
          name={item.name}
          focusKey={`packages:${item.id}`}
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={pending}
          className="hidden lg:grid"
        />
      </div>
    </li>
  );
}

function PackageActions({
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
          className={`${className} h-11 w-11 place-items-center rounded-full text-[#696C67] hover:bg-[#F1F2EF]`}
        >
          <MoreHorizontal className="h-4 w-4" />
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

function PackageEditorDialog({
  open,
  onOpenChange,
  item,
  data,
  onSaved,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: OwnerCatalogPreviewPackage | null;
  data: OwnerPackagesPreviewReadModel;
  onSaved: (item: OwnerCatalogPreviewPackage, edited: boolean) => void;
  onSubmit: (details: {
    name: string;
    description?: string;
    category: string;
    price: number;
    duration?: number;
    items: Array<{ serviceId: number; customPrice: number }>;
  }) => Promise<{ success: true; data: OwnerCatalogPreviewPackage } | { success: false; error: string }>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(
    item?.category ?? data.categories[0] ?? "",
  );
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [duration, setDuration] = useState(
    item?.durationMinutes === null || item?.durationMinutes === undefined
      ? ""
      : String(item.durationMinutes),
  );
  const [selected, setSelected] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (item?.services ?? []).map((service) => [
        service.id,
        String(service.packageItemPrice),
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  function toggle(serviceId: number, defaultPrice: number) {
    setSelected((current) => {
      const next = { ...current };
      if (serviceId in next) delete next[serviceId];
      else next[serviceId] = String(defaultPrice);
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (Object.keys(selected).length === 0) {
      setError("Select at least one service.");
      return;
    }
    setError(null);
    const details = {
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim(),
      price: Number(price),
      duration: duration === "" ? undefined : Number(duration),
      items: Object.entries(selected).map(([serviceId, customPrice]) => ({
        serviceId: Number(serviceId),
        customPrice: Number(customPrice),
      })),
    };
    submitting.current = true;
    setPending(true);
    try {
      const result = await onSubmit(details);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onSaved(result.data, Boolean(item));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <CatalogEditorOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit package" : "Add a package"}
      description="Combine catalog services and set the package price."
      restoreFocusKey={item ? `packages:${item.id}` : "packages:create"}
    >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <CatalogEditorBody className="space-y-3">
            <label className="block text-xs font-semibold text-[#555852]">
              Package name
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
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1.5 min-h-20 w-full resize-y rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 py-2.5 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-[#555852]">
                Category
                <input
                  required
                  list="package-categories"
                  maxLength={200}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={fieldClass}
                />
                <datalist id="package-categories">
                  {data.categories.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
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
                Duration
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
            <fieldset className="min-w-0">
              <legend className="text-xs font-semibold text-[#555852]">
                Included services
              </legend>
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-[14px] border border-[#E1E3DE] bg-[#FAFBF8] p-2">
                {data.availableServices.length ? (
                  data.availableServices.map((service) => {
                    const checked = service.id in selected;
                    return (
                      <div
                        key={service.id}
                        className="grid grid-cols-[minmax(0,1fr)_clamp(88px,25vw,100px)] items-center gap-2 rounded-[10px] bg-white px-3 py-1 sm:grid-cols-[minmax(0,1fr)_100px]"
                      >
                        <CatalogCheckbox
                          id={`package-service-${service.id}`}
                          checked={checked}
                          onChange={() => toggle(service.id, service.price)}
                          ariaLabel={`Include ${service.name}`}
                          className="min-w-0 items-center"
                        >
                          <span className="min-w-0 break-words text-sm font-semibold">
                            {service.name}
                          </span>
                        </CatalogCheckbox>
                        <input
                          aria-label={`Package item price for ${service.name}`}
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!checked}
                          value={selected[service.id] ?? ""}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [service.id]: event.target.value,
                            }))
                          }
                          className="h-9 min-w-0 w-full rounded-[10px] border border-[#DDE0D9] px-2 font-mono text-xs disabled:opacity-40"
                        />
                      </div>
                    );
                  })
                ) : (
                  <p className="p-3 text-sm text-[#696C67]">
                    Add services before creating a package.
                  </p>
                )}
              </div>
            </fieldset>
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
                disabled={pending}
                className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] bg-white px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
              >
                Cancel
            </CatalogEditorClose>
            <button
              type="submit"
              disabled={pending || data.availableServices.length === 0}
              className="min-h-11 rounded-full bg-[#20211F] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : item ? "Save changes" : "Create package"}
            </button>
          </CatalogEditorFooter>
        </form>
    </CatalogEditorOverlay>
  );
}
