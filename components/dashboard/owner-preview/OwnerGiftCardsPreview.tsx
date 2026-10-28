"use client";

import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Gift,
  Mail,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  createGiftCardAction,
  deleteGiftCardAction,
  updateGiftCardAction,
} from "@/features/gift-cards/actions/gift-cards";
import type {
  OwnerCatalogCommittedChange,
  OwnerCatalogPreviewGiftCard,
  OwnerCatalogPreviewGiftCardStatus,
  OwnerGiftCardsPreviewReadModel,
} from "@/features/catalog/types/owner-catalog-preview";
import { cn } from "@/lib/utils";
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
import { GiftCardClaimDialog } from "@/components/dashboard/shared/GiftCardClaimDialog";

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const fieldClass =
  "mt-1.5 h-11 w-full rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20";

export function OwnerGiftCardsPreview({
  data,
  refreshControl,
  onChanged,
  onGiftCardClaimed,
}: {
  data: OwnerGiftCardsPreviewReadModel;
  refreshControl?: ReactNode;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewGiftCard>) => void;
  onGiftCardClaimed?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<
    "all" | OwnerCatalogPreviewGiftCardStatus
  >("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [editing, setEditing] = useState<OwnerCatalogPreviewGiftCard | null>(
    null,
  );
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewGiftCard | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const catalog = useOptimisticCatalog(data.giftCards, onChanged);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      catalog.items.filter((item) => {
        const haystack =
          `${item.code} ${item.recipientName} ${item.recipientEmail ?? ""} ${item.recipientPhone ?? ""} ${item.includedServices.map((service) => service.name).join(" ")} ${item.includedPackages.map((pack) => pack.name).join(" ")}`.toLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (status === "all" || item.status === status)
        );
      }),
    [catalog.items, normalizedQuery, status],
  );
  const filtered = Boolean(normalizedQuery || status !== "all");
  function refreshWith(message: string) {
    setNotice({ tone: "success", text: message });
  }
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    const target = deleting;
    setDeleting(null);
    const result = await catalog.remove(target.id, async () => {
      const response = await deleteGiftCardAction(target.id);
      return response.success ? { success: true as const, data: target } : response;
    });
    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete gift card");
      setDeleting(target);
      setNotice({ tone: "error", text: result.error ?? "Failed to delete gift card" });
      return;
    }
    refreshWith(`${target.code} was deleted.`);
  }

  return (
    <CatalogPageFrame businessSlug={data.business.slug} active="gift-cards">
      <CatalogHeader
        businessSlug={data.business.slug}
        businessName={data.business.name}
        context="Customer gifting"
        title="Gift cards"
        description="Issue catalog experiences to a recipient and track whether each gift is active, claimed, or expired."
        actionLabel="Issue gift card"
        shortActionLabel="Gift card"
        actionFocusKey="gift-cards:create"
        refreshControl={refreshControl}
        onAction={() => {
          setEditing(null);
          setEditorSession((value) => value + 1);
          setEditorOpen(true);
        }}
      />
      <div className="mt-4 flex justify-end">
        <GiftCardClaimDialog businessSlug={data.business.slug} onClaimed={onGiftCardClaimed} trigger={<button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#DDE0D9] bg-white px-4 text-xs font-bold text-[#20211F] outline-none transition-colors hover:border-[#72CF35] hover:bg-[#F4FAF0] focus-visible:ring-2 focus-visible:ring-[#72CF35]"><Gift className="h-4 w-4 text-[#4D8F24]" aria-hidden="true" />Claim gift card booking</button>} />
      </div>
      <MutationNotice notice={notice} />
      <section
        aria-label="Gift card overview"
        className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <CatalogKpi
          label="Total gift cards"
          value={String(data.metrics.totalGiftCards)}
          detail="All issued catalog gifts"
          icon={Gift}
          tone="lime"
        />
        <CatalogKpi
          label="Active"
          value={String(data.metrics.activeGiftCards)}
          detail="Available to claim"
          icon={Mail}
          tone="dark"
        />
        <CatalogKpi
          label="Claimed"
          value={String(data.metrics.claimedGiftCards)}
          detail="Successfully redeemed"
          icon={CheckCircle2}
          tone="ring"
          ring={
            data.metrics.totalGiftCards
              ? (data.metrics.claimedGiftCards / data.metrics.totalGiftCards) *
                100
              : 0
          }
        />
        <CatalogKpi
          label="Expired"
          value={String(data.metrics.expiredGiftCards)}
          detail="Past their claim date"
          icon={Clock3}
          tone="neutral"
        />
      </section>
      <section
        aria-labelledby="gift-card-library-heading"
        className="mt-4 overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:mt-5 sm:rounded-[30px]"
      >
        <div className="border-b border-[#ECEEE9] p-3 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-baseline justify-between gap-3 sm:block">
            <h2
              id="gift-card-library-heading"
              className="text-base font-bold sm:text-lg"
            >
              Gift card library
            </h2>
            <p className="text-[10px] text-[#81847E] sm:mt-1 sm:text-xs">
              {visible.length} of {catalog.items.length} gift cards
            </p>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2 sm:flex lg:mt-0">
            <label className="relative block min-w-0 sm:w-72">
              <span className="sr-only">Search gift cards</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search gift cards"
                className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
              />
            </label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as typeof status)}
            >
              <SelectTrigger
                aria-label="Filter by status"
                className="!h-11 w-full rounded-[14px] border-[#E1E3DE] bg-[#F8F9F6] text-xs font-semibold shadow-none sm:w-44 sm:text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {visible.length ? (
          <ul className="divide-y divide-[#ECEEE9]">
            {visible.map((item) => (
              <GiftCardRow
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
                onCopied={() =>
                  setNotice({ tone: "success", text: `${item.code} copied.` })
                }
              />
            ))}
          </ul>
        ) : (
          <CatalogEmptyState
            title={filtered ? "No matching gift cards" : "No gift cards yet"}
            description={
              filtered
                ? "Try another recipient, code, or status."
                : "Issue a gift card that includes at least one service or package."
            }
            filtered={filtered}
            onClear={() => {
              setQuery("");
              setStatus("all");
            }}
          />
        )}
      </section>
      <GiftCardEditorDialog
          key={`${editing?.id ?? "new"}-${editorSession}`}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          item={editing}
          data={data}
          onSubmit={(payload) => {
            const optimistic: OwnerCatalogPreviewGiftCard = {
              id: editing?.id ?? catalog.nextTemporaryId(),
              code: payload.code.toUpperCase(),
              recipientName: payload.customer_name,
              recipientEmail: payload.customer_email,
              recipientPhone: payload.customer_phone,
              expiresAt: payload.expires_at.toISOString(),
              claimedAt: editing?.claimedAt ?? null,
              status: editing?.status ?? "active",
              includedServices: data.availableServices.filter((entry) => payload.service_ids.includes(entry.id)).map(({ id, name }) => ({ id, name })),
              includedPackages: data.availablePackages.filter((entry) => payload.package_ids.includes(entry.id)).map(({ id, name }) => ({ id, name })),
            };
            return editing
              ? catalog.update(optimistic, () => updateGiftCardAction(editing.id, payload))
              : catalog.create(optimistic, () => createGiftCardAction(payload));
          }}
          onSaved={(saved, edited, warning) => {
            setNotice({ tone: warning ? "error" : "success", text: warning ?? `${saved.code} was ${edited ? "updated" : "issued"}.` });
          }}
        />
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.code ?? "gift card"}?`}
        description="This permanently removes the gift card and its catalog inclusions."
        pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </CatalogPageFrame>
  );
}

const statusStyle: Record<OwnerCatalogPreviewGiftCardStatus, string> = {
  active: "bg-[#EFF9E8] text-[#3D791E]",
  claimed: "bg-[#EEF2FF] text-[#4556A7]",
  expired: "bg-[#FFF0F0] text-[#C74248]",
};
function GiftCardRow({
  item,
  pending,
  onEdit,
  onDelete,
  onCopied,
}: {
  item: OwnerCatalogPreviewGiftCard;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopied: () => void;
}) {
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(item.code);
      onCopied();
    } catch {
      /* Browser may deny clipboard access. */
    }
  }
  const inclusions = [
    ...item.includedServices.map((entry) => ({ ...entry, kind: "Service" })),
    ...item.includedPackages.map((entry) => ({ ...entry, kind: "Package" })),
  ];
  return (
    <li aria-busy={pending || undefined} className={`p-3 transition-colors hover:bg-[#FAFBF8] sm:p-5 ${pending ? "bg-[#F8FBEF] opacity-75" : ""}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(210px,.85fr)_minmax(190px,.8fr)_minmax(230px,1.2fr)_minmax(145px,.55fr)_44px] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#EFF9E8] text-[#4D8F24]">
            <Gift className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h3 className="truncate font-mono text-sm font-bold tracking-[0.04em]">
                {item.code}
              </h3>
              {pending ? <span className="shrink-0 rounded-full bg-[#E9F6DF] px-2 py-0.5 text-[9px] font-bold text-[#3D791E]">Saving…</span> : null}
              <button
                type="button"
                onClick={copyCode}
                aria-label={`Copy ${item.code}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#696C67] hover:bg-[#F1F2EF]"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <span
              className={cn(
                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]",
                statusStyle[item.status],
              )}
            >
              {item.status}
            </span>
          </div>
          <GiftCardActions
            code={item.code}
            focusKey={`gift-cards:${item.id}`}
            onEdit={onEdit}
            onDelete={onDelete}
            className="grid lg:hidden"
            disabled={pending}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            Recipient
          </p>
          <p className="mt-1 truncate text-sm font-bold">
            {item.recipientName}
          </p>
          <p className="mt-1 truncate text-[11px] text-[#696C67]">
            {item.recipientEmail || item.recipientPhone || "No contact"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            Included catalog
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inclusions.map((entry) => (
              <span
                key={`${entry.kind}-${entry.id}`}
                title={entry.kind}
                className="rounded-full bg-[#F1F2EF] px-2 py-1 text-[10px] font-semibold text-[#555852]"
              >
                {entry.name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            {item.claimedAt ? "Claimed" : "Expires"}
          </p>
          <p className="mt-1 text-xs font-semibold">
            {dateFormatter.format(new Date(item.claimedAt ?? item.expiresAt))}
          </p>
          <p className="mt-1 text-[11px] text-[#696C67]">
            {inclusions.length} included{" "}
            {inclusions.length === 1 ? "item" : "items"}
          </p>
        </div>
        <GiftCardActions
          code={item.code}
          focusKey={`gift-cards:${item.id}`}
          onEdit={onEdit}
          onDelete={onDelete}
          className="hidden lg:grid"
          disabled={pending}
        />
      </div>
    </li>
  );
}

function GiftCardActions({
  code,
  focusKey,
  onEdit,
  onDelete,
  className,
  disabled,
}: {
  code: string;
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
          aria-label={`Actions for ${code}`}
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

function toDateInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function GiftCardEditorDialog({
  open,
  onOpenChange,
  item,
  data,
  onSaved,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: OwnerCatalogPreviewGiftCard | null;
  data: OwnerGiftCardsPreviewReadModel;
  onSaved: (item: OwnerCatalogPreviewGiftCard, edited: boolean, warning?: string) => void;
  onSubmit: (payload: {
    code: string;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    expires_at: Date;
    service_ids: number[];
    package_ids: number[];
  }) => Promise<
    | { success: true; data: OwnerCatalogPreviewGiftCard; warning?: string }
    | { success: false; error: string }
  >;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState(item?.recipientName ?? "");
  const [email, setEmail] = useState(item?.recipientEmail ?? "");
  const [phone, setPhone] = useState(item?.recipientPhone ?? "");
  const [expiry, setExpiry] = useState(item ? toDateInput(item.expiresAt) : "");
  const [serviceIds, setServiceIds] = useState<number[]>(
    () => item?.includedServices.map((entry) => entry.id) ?? [],
  );
  const [packageIds, setPackageIds] = useState<number[]>(
    () => item?.includedPackages.map((entry) => entry.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  function toggle(
    id: number,
    values: number[],
    setValues: (next: number[]) => void,
  ) {
    setValues(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!email.trim() && !phone.trim()) {
      setError("Add a recipient email or phone.");
      return;
    }
    if (!serviceIds.length && !packageIds.length) {
      setError("Select at least one service or package.");
      return;
    }
    const payload = {
      code: code.trim(),
      customer_name: name.trim(),
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      expires_at: new Date(`${expiry}T23:59:59+08:00`),
      service_ids: serviceIds,
      package_ids: packageIds,
    };
    setError(null);
    submitting.current = true;
    setPending(true);
    try {
      const result = await onSubmit(payload);
      if (!result.success) {
        setError(result.error ?? "Failed to save gift card");
        return;
      }
      onOpenChange(false);
      onSaved(result.data, Boolean(item), result.warning);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <CatalogEditorOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit gift card" : "Issue a gift card"}
      description="Choose the recipient and the services or packages they can claim."
      restoreFocusKey={item ? `gift-cards:${item.id}` : "gift-cards:create"}
    >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <CatalogEditorBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[#555852]">
                Gift code
                <input
                  required
                  maxLength={200}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  className={cn(fieldClass, "font-mono uppercase")}
                />
              </label>
              <label className="block text-xs font-semibold text-[#555852]">
                Recipient name
                <input
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[#555852]">
                Recipient email
                <input
                  type="email"
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-xs font-semibold text-[#555852]">
                Recipient phone
                <input
                  maxLength={50}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-[#555852]">
              Expiry date
              <input
                required
                type="date"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                className={fieldClass}
              />
            </label>
            <fieldset className="min-w-0">
              <legend className="text-xs font-semibold text-[#555852]">
                Included catalog
              </legend>
              <div className="mt-2 grid max-h-60 gap-2 overflow-y-auto rounded-[14px] border border-[#E1E3DE] bg-[#FAFBF8] p-2 sm:grid-cols-2">
                {data.availableServices.map((entry) => (
                  <CatalogChoice
                    key={`service-${entry.id}`}
                    id={`gift-card-service-${entry.id}`}
                    checked={serviceIds.includes(entry.id)}
                    label={entry.name}
                    meta={`Service · ${entry.category}`}
                    onChange={() => toggle(entry.id, serviceIds, setServiceIds)}
                  />
                ))}
                {data.availablePackages.map((entry) => (
                  <CatalogChoice
                    key={`package-${entry.id}`}
                    id={`gift-card-package-${entry.id}`}
                    checked={packageIds.includes(entry.id)}
                    label={entry.name}
                    meta={`Package · ${entry.category}`}
                    onChange={() => toggle(entry.id, packageIds, setPackageIds)}
                  />
                ))}
                {!data.availableServices.length &&
                !data.availablePackages.length ? (
                  <p className="p-3 text-sm text-[#696C67] sm:col-span-2">
                    Add a service or package before issuing a gift card.
                  </p>
                ) : null}
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
              disabled={
                pending ||
                (!data.availableServices.length &&
                  !data.availablePackages.length)
              }
              className="min-h-11 rounded-full bg-[#20211F] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : item ? "Save changes" : "Issue gift card"}
            </button>
          </CatalogEditorFooter>
        </form>
    </CatalogEditorOverlay>
  );
}

function CatalogChoice({
  id,
  checked,
  label,
  meta,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  meta: string;
  onChange: () => void;
}) {
  return (
    <CatalogCheckbox
      id={id}
      checked={checked}
      onChange={onChange}
      className="rounded-[11px] bg-white px-3 py-2.5"
      inputClassName="mt-0.5"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[#696C67]">
          {meta}
        </span>
      </span>
    </CatalogCheckbox>
  );
}
