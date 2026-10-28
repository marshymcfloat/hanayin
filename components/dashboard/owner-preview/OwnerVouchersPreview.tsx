"use client";

import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import {
  Archive,
  BadgePercent,
  CheckCircle2,
  Copy,
  MoreHorizontal,
  Pencil,
  Search,
  Ticket,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  createVoucherAction,
  deleteVoucherAction,
  setVoucherActiveAction,
  updateVoucherAction,
} from "@/features/catalog/actions/vouchers";
import type {
  OwnerCatalogCommittedChange,
  OwnerCatalogPreviewVoucher,
  OwnerCatalogPreviewVoucherStatus,
  OwnerVouchersPreviewReadModel,
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
const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const fieldClass =
  "mt-1.5 h-11 w-full rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20";

export function OwnerVouchersPreview({
  data,
  refreshControl,
  onChanged,
}: {
  data: OwnerVouchersPreviewReadModel;
  refreshControl?: ReactNode;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewVoucher>) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<
    "all" | OwnerCatalogPreviewVoucherStatus
  >("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [editing, setEditing] = useState<OwnerCatalogPreviewVoucher | null>(
    null,
  );
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewVoucher | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const catalog = useOptimisticCatalog(data.vouchers, onChanged);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      catalog.items.filter(
        (item) =>
          (!normalizedQuery ||
            item.code.toLowerCase().includes(normalizedQuery)) &&
          (status === "all" || item.status === status),
      ),
    [catalog.items, normalizedQuery, status],
  );
  const filtered = Boolean(normalizedQuery || status !== "all");
  function refreshWith(message: string) {
    setNotice({ tone: "success", text: message });
  }
  async function toggleActive(item: OwnerCatalogPreviewVoucher) {
    const activate = item.status === "archived";
    const optimistic = { ...item, status: activate ? "active" as const : "archived" as const };
    const result = await catalog.update(optimistic, () => setVoucherActiveAction(item.id, activate));
    if (!result.success) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    refreshWith(`${item.code} was ${activate ? "restored" : "archived"}.`);
  }
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    const target = deleting;
    setDeleting(null);
    const result = await catalog.remove(target.id, async () => {
      const response = await deleteVoucherAction(target.id);
      return response.success ? { success: true as const, data: target } : response;
    });
    if (!result.success) {
      setDeleteError(result.error);
      setDeleting(target);
      setNotice({ tone: "error", text: result.error });
      return;
    }
    refreshWith(`${target.code} was deleted.`);
  }

  return (
    <CatalogPageFrame businessSlug={data.business.slug} active="vouchers">
      <CatalogHeader
        businessSlug={data.business.slug}
        businessName={data.business.name}
        context="Customer incentives"
        title="Vouchers"
        description="Create controlled discounts, review real redemption status, and retire codes when they are no longer needed."
        actionLabel="Create voucher"
        shortActionLabel="Voucher"
        actionFocusKey="vouchers:create"
        refreshControl={refreshControl}
        onAction={() => {
          setEditing(null);
          setEditorSession((value) => value + 1);
          setEditorOpen(true);
        }}
      />
      <MutationNotice notice={notice} />
      <section
        aria-label="Voucher overview"
        className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <CatalogKpi
          label="Active vouchers"
          value={String(data.metrics.activeVouchers)}
          detail="Ready for customer use"
          icon={Ticket}
          tone="lime"
        />
        <CatalogKpi
          label="Redemptions"
          value={String(data.metrics.redemptions)}
          detail="Used voucher records"
          icon={CheckCircle2}
          tone="dark"
        />
        <CatalogKpi
          label="Archived vouchers"
          value={String(data.metrics.archivedVouchers)}
          detail="Retired discount codes"
          icon={Archive}
          tone="neutral"
        />
        <CatalogKpi
          label="Total vouchers"
          value={String(catalog.items.length)}
          detail="Across every status"
          icon={BadgePercent}
          tone="ring"
          ring={
            catalog.items.length
              ? (data.metrics.activeVouchers / catalog.items.length) * 100
              : 0
          }
        />
      </section>
      <section
        aria-labelledby="voucher-library-heading"
        className="mt-4 overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:mt-5 sm:rounded-[30px]"
      >
        <div className="border-b border-[#ECEEE9] p-3 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-baseline justify-between gap-3 sm:block">
            <h2
              id="voucher-library-heading"
              className="text-base font-bold sm:text-lg"
            >
              Voucher library
            </h2>
            <p className="text-[10px] text-[#81847E] sm:mt-1 sm:text-xs">
              {visible.length} of {catalog.items.length} vouchers
            </p>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2 sm:flex lg:mt-0">
            <label className="relative block min-w-0 sm:w-72">
              <span className="sr-only">Search vouchers</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search codes"
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
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {visible.length ? (
          <ul className="divide-y divide-[#ECEEE9]">
            {visible.map((item) => (
              <VoucherRow
                key={item.id}
                item={item}
                changing={catalog.pendingIds.has(item.id)}
                onEdit={() => {
                  setEditing(item);
                  setEditorSession((value) => value + 1);
                  setEditorOpen(true);
                }}
                onToggle={() => toggleActive(item)}
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
            title={filtered ? "No matching vouchers" : "No vouchers yet"}
            description={
              filtered
                ? "Try another code or status."
                : "Create your first voucher for a controlled customer discount."
            }
            filtered={filtered}
            onClear={() => {
              setQuery("");
              setStatus("all");
            }}
          />
        )}
      </section>
      <VoucherEditorDialog
          key={`${editing?.id ?? "new"}-${editorSession}`}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          item={editing}
          onSubmit={(payload) => {
            const optimistic: OwnerCatalogPreviewVoucher = {
              id: editing?.id ?? catalog.nextTemporaryId(),
              code: payload.code.toUpperCase(),
              type: payload.type,
              value: payload.value,
              minimumAmount: payload.minimum_amount,
              expiresAt: payload.expires_at.toISOString(),
              status: editing?.status ?? "active",
              redemptions: editing?.redemptions ?? 0,
            };
            return editing
              ? catalog.update(optimistic, () => updateVoucherAction(editing.id, payload))
              : catalog.create(optimistic, () => createVoucherAction(payload));
          }}
          onSaved={(saved, edited) =>
            refreshWith(`${saved.code} was ${edited ? "updated" : "created"}.`)
          }
        />
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.code ?? "voucher"}?`}
        description="This permanently removes the voucher code and cannot be undone."
        pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </CatalogPageFrame>
  );
}

const statusStyle: Record<OwnerCatalogPreviewVoucherStatus, string> = {
  active: "bg-[#EFF9E8] text-[#3D791E]",
  used: "bg-[#EEF2FF] text-[#4556A7]",
  expired: "bg-[#FFF0F0] text-[#C74248]",
  archived: "bg-[#F1F2EF] text-[#696C67]",
};
function VoucherRow({
  item,
  changing,
  onEdit,
  onToggle,
  onDelete,
  onCopied,
}: {
  item: OwnerCatalogPreviewVoucher;
  changing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onCopied: () => void;
}) {
  const discount =
    item.type === "PERCENTAGE"
      ? `${item.value}% off`
      : `${peso.format(item.value)} off`;
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(item.code);
      onCopied();
    } catch {
      /* Browser may deny clipboard access. */
    }
  }
  return (
    <li aria-busy={changing || undefined} className={`p-3 transition-colors hover:bg-[#FAFBF8] sm:p-5 ${changing ? "bg-[#F8FBEF] opacity-75" : ""}`}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(130px,.45fr)_minmax(150px,.55fr)_minmax(125px,.45fr)_44px] md:items-center md:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#EFF9E8] text-[#4D8F24]">
            <Ticket className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-mono text-sm font-bold tracking-[0.04em]">
                {item.code}
              </h3>
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
            {changing ? <span className="ml-1 text-[9px] font-bold text-[#3D791E]">Saving…</span> : null}
          </div>
          <VoucherActions
            item={item}
            focusKey={`vouchers:${item.id}`}
            changing={changing}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
            className="grid md:hidden"
          />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            Discount
          </p>
          <p className="mt-1 text-sm font-bold">{discount}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            Conditions
          </p>
          <p className="mt-1 text-xs font-semibold">
            Minimum {peso.format(item.minimumAmount)}
          </p>
          <p className="mt-1 text-[11px] text-[#696C67]">
            Expires {dateFormatter.format(new Date(item.expiresAt))}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#92958F]">
            Redemptions
          </p>
          <p className="mt-1 font-mono text-sm font-bold">{item.redemptions}</p>
        </div>
        <VoucherActions
          item={item}
          focusKey={`vouchers:${item.id}`}
          changing={changing}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
          className="hidden md:grid"
        />
      </div>
    </li>
  );
}

function VoucherActions({
  item,
  focusKey,
  changing,
  onEdit,
  onToggle,
  onDelete,
  className,
}: {
  item: OwnerCatalogPreviewVoucher;
  focusKey: string;
  changing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  className: string;
}) {
  const canToggle = item.status === "active" || item.status === "archived";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-catalog-focus={focusKey}
          aria-label={`Actions for ${item.code}`}
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
        {canToggle ? (
          <DropdownMenuItem
            disabled={changing}
            onSelect={onToggle}
            className="min-h-10 cursor-pointer rounded-[10px]"
          >
            {item.status === "archived" ? (
              <Undo2 className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {item.status === "archived" ? "Restore" : "Archive"}
          </DropdownMenuItem>
        ) : null}
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
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function VoucherEditorDialog({
  open,
  onOpenChange,
  item,
  onSaved,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: OwnerCatalogPreviewVoucher | null;
  onSaved: (item: OwnerCatalogPreviewVoucher, edited: boolean) => void;
  onSubmit: (payload: {
    code: string;
    type: "PERCENTAGE" | "FLAT";
    value: number;
    minimum_amount: number;
    expires_at: Date;
  }) => Promise<{ success: true; data: OwnerCatalogPreviewVoucher } | { success: false; error: string }>;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [type, setType] = useState<"PERCENTAGE" | "FLAT">(
    item?.type ?? "PERCENTAGE",
  );
  const [value, setValue] = useState(item ? String(item.value) : "");
  const [minimum, setMinimum] = useState(
    item ? String(item.minimumAmount) : "0",
  );
  const [expiry, setExpiry] = useState(item ? toDateInput(item.expiresAt) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const expiryDate = new Date(`${expiry}T23:59:59+08:00`);
    const payload = {
      code: code.trim(),
      type,
      value: Number(value),
      minimum_amount: Number(minimum),
      expires_at: expiryDate,
    };
    setError(null);
    submitting.current = true;
    setPending(true);
    try {
      const result = await onSubmit(payload);
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
      title={item ? "Edit voucher" : "Create a voucher"}
      description="Set a discount code, its threshold, and expiry."
      restoreFocusKey={item ? `vouchers:${item.id}` : "vouchers:create"}
    >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <CatalogEditorBody className="space-y-3">
            <label className="block text-xs font-semibold text-[#555852]">
              Voucher code
              <input
                required
                maxLength={200}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className={cn(fieldClass, "font-mono uppercase")}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-[#555852]">
                Discount type
                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as typeof type)
                  }
                  className={fieldClass}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Fixed amount</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-[#555852]">
                Discount value
                <input
                  required
                  type="number"
                  min="0"
                  max={type === "PERCENTAGE" ? 100 : undefined}
                  step="0.01"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-[#555852]">
                Minimum spend
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={minimum}
                  onChange={(event) => setMinimum(event.target.value)}
                  className={fieldClass}
                />
              </label>
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
              {pending ? "Saving…" : item ? "Save changes" : "Create voucher"}
            </button>
          </CatalogEditorFooter>
        </form>
    </CatalogEditorOverlay>
  );
}
