"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, CheckCircle2, Copy, MoreHorizontal, Pencil, Plus, Search, Ticket, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { createVoucherAction, deleteVoucherAction, setVoucherActiveAction, updateVoucherAction } from "@/features/catalog/actions/vouchers";
import { createVoucherSchema } from "@/features/catalog/voucher-schemas";
import type { CreateVoucherInput } from "@/features/catalog/voucher-types";
import type { OwnerCatalogCommittedChange, OwnerCatalogPreviewVoucher, OwnerCatalogPreviewVoucherStatus, OwnerVouchersPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import vouchers from "@/components/dashboard/design-study/owner-vouchers.module.css";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const fieldClass = "mt-1.5 h-11 w-full px-3.5 outline-none";

export function OwnerVouchersStudy({ data, fontClassName = "", onChanged }: {
  data: OwnerVouchersPreviewReadModel;
  fontClassName?: string;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewVoucher>) => void;
}) {
  const [query, setQuery] = useCatalogListState(`${data.business.slug}:Vouchers`, "query", "");
  const [status, setStatus] = useCatalogListState<"all" | OwnerCatalogPreviewVoucherStatus>(`${data.business.slug}:Vouchers`, "status", "all");
  const [sort, setSort] = useCatalogListState(`${data.business.slug}:Vouchers`, "sort", "code");
  const [limit, setLimit] = useCatalogListState(`${data.business.slug}:Vouchers`, "limit", 12);
  const editors = useCatalogEditorSessions<OwnerCatalogPreviewVoucher>();
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewVoucher | null>(null);
  const mutatingIds = useRef(new Set<number>());
  const listRef = useRef<HTMLDivElement>(null);
  useCatalogScroll(`${data.business.slug}:Vouchers`, listRef);
  const catalog = useOptimisticCatalog(data.vouchers, onChanged);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => catalog.items.filter(item =>
    (!normalized || item.code.toLowerCase().includes(normalized)) && (status === "all" || item.status === status),
  ).sort((a, b) => sort === "expiry" ? Date.parse(a.expiresAt) - Date.parse(b.expiresAt) : sort === "minimum" ? a.minimumAmount - b.minimumAmount : a.code.localeCompare(b.code)), [catalog.items, normalized, status, sort]);
  const shown = visible.slice(0, limit);
  const captureRows = useSelectionMotion(listRef, shown.map(item => item.id).join(","), "voucher");
  const filtered = Boolean(normalized || status !== "all");

  function openEditor(item: OwnerCatalogPreviewVoucher | null = null) {
    editors.open(item);
  }
  async function toggleActive(item: OwnerCatalogPreviewVoucher) {
    if (mutatingIds.current.has(item.id)) return;
    mutatingIds.current.add(item.id);
    const activate = item.status === "archived";
    captureRows();
    try {
      const result = await catalog.update({ ...item, status: activate ? "active" : "archived" }, () => setVoucherActiveAction(item.id, activate));
      if (!result.success) toast.error(result.error);
      else toast.success(`${result.data.code} was ${activate ? "restored" : "archived"}.`);
    } finally { mutatingIds.current.delete(item.id); }
  }
  async function confirmDelete() {
    if (!deleting || mutatingIds.current.has(deleting.id)) return;
    const target = deleting;
    mutatingIds.current.add(target.id);
    setDeleting(null);
    captureRows();
    try {
      const result = await catalog.remove(target.id, async () => {
        const response = await deleteVoucherAction(target.id);
        return response.success ? { success: true as const, data: target } : response;
      });
      if (!result.success) {
        setDeleting(current => current ?? target);
        toast.error(result.error);
      } else toast.success(`${target.code} was deleted.`);
    } finally { mutatingIds.current.delete(target.id); }
  }

  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{data.business.name} · Customer incentives</p><h1>Vouchers<span className={styles.titleDetail}>, a little extra.</span></h1><p className={styles.description}>Thoughtful discounts, with clear conditions. Manage your codes and their use.</p></div>
      <button type="button" className={styles.primary} data-catalog-focus="vouchers:create" onClick={() => openEditor()}><Plus size={17} aria-hidden="true" />Create voucher</button>
    </header>
    <section className={styles.summary} aria-label="Voucher catalog overview">
      <VoucherMetric icon={Ticket} label="Total vouchers" value={catalog.items.length} detail="Codes in your catalog" />
      <VoucherMetric icon={CheckCircle2} label="Active vouchers" value={data.metrics.activeVouchers} detail="Available at last refresh" />
      <VoucherMetric icon={Copy} label="Redemptions" value={data.metrics.redemptions} detail="Used voucher records" />
      <VoucherMetric icon={Archive} label="Archived vouchers" value={data.metrics.archivedVouchers} detail="Retired discount codes" />
    </section>
    <div ref={listRef}><section className={styles.catalog} aria-labelledby="voucher-catalog-heading">
      <div className={styles.toolbar}>
        <div><h2 id="voucher-catalog-heading">Your voucher catalog</h2><span className={styles.count} role="status">{filtered ? `${visible.length} matching vouchers` : `${catalog.items.length} vouchers in your catalog`}</span></div>
        <div className={styles.filters}>
          <label className={styles.search}><span className="sr-only">Search vouchers</span><Search size={16} aria-hidden="true" /><input placeholder="Find a voucher code…" value={query} onChange={event => { captureRows(); setLimit(12); setQuery(event.target.value); }} /></label>
          <Select value={status} onValueChange={value => { captureRows(); setLimit(12); setStatus(value as typeof status); }}><SelectTrigger className={styles.select} aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="used">Used</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select>
          <Select value={sort} onValueChange={value => { captureRows(); setLimit(12); setSort(value); }}><SelectTrigger className={styles.select} aria-label="Sort vouchers"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="code">Code A–Z</SelectItem><SelectItem value="expiry">Expiring first</SelectItem><SelectItem value="minimum">Lowest minimum spend</SelectItem></SelectContent></Select>
        </div>
      </div>
      <ul className={styles.list} data-voucher-area>{shown.map(item => <VoucherRow key={item.id} item={item} pending={catalog.pendingIds.has(item.id)} fontClassName={fontClassName} onEdit={() => openEditor(item)} onToggle={() => void toggleActive(item)} onDelete={() => setDeleting(item)} />)}</ul>
      {catalog.pendingIds.size > 0 && <p role="status" className={styles.saving}>Saving {catalog.pendingIds.size} voucher {catalog.pendingIds.size === 1 ? "change" : "changes"}…</p>}
      {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon} aria-hidden="true"><Ticket size={29} strokeWidth={1.5} /></span><h3>{filtered ? "No matching vouchers" : "Your first little extra."}</h3><p>{filtered ? "Try another code or status." : "Create a voucher with a discount, minimum spend, and expiry."}</p><button type="button" className={styles.secondary} onClick={filtered ? () => { captureRows(); setLimit(12); setQuery(""); setStatus("all"); } : () => openEditor()}>{filtered ? "Clear filters" : "Create your first voucher"}</button></div></div>}
      {shown.length < visible.length && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length} matching vouchers</span><button type="button" className={styles.secondary} onClick={() => { captureRows(); setLimit(value => value + 12); }}>Show more vouchers<Plus size={14} aria-hidden="true" /></button></div>}
      <div className={styles.footer}><span>Each voucher can be redeemed once. Minimum spend and expiry apply.</span><span>Expiry dates · Philippine time</span></div>
    </section></div>
    {editors.sessions.filter(entry => (entry.state === "failed" || entry.state === "draft") && entry.id !== editors.activeId).map(entry => <button key={entry.id} type="button" className={styles.secondary} onClick={() => editors.resume(entry.id)}>Resume voucher draft {entry.id}</button>)}
    {editors.sessions.map(({ id: sessionId, item: editing }) => <VoucherEditor key={sessionId} open={editors.activeId === sessionId} onOpenChange={open => open ? editors.resume(sessionId) : editors.dismiss(sessionId)} onDiscard={() => editors.status(sessionId, "saved")} item={editing} fontClassName={fontClassName} onSubmit={async payload => {
      editors.status(sessionId, "pending");
      captureRows();
      const optimistic: OwnerCatalogPreviewVoucher = { id: editing?.id ?? catalog.nextTemporaryId(), code: payload.code, type: payload.type, value: payload.value, minimumAmount: payload.minimum_amount, expiresAt: payload.expires_at.toISOString(), status: editing?.status ?? "active", redemptions: editing?.redemptions ?? 0 };
      const result = await (editing ? catalog.update(optimistic, () => updateVoucherAction(editing.id, payload)) : catalog.create(optimistic, () => createVoucherAction(payload)));
      if (!result.success) editors.failed(sessionId, result.error);
      else {
        editors.status(sessionId, "saved");
        const saved = result.data;
        showCatalogSaved(`${saved.code} was ${editing?.id ? "updated" : "created"}.`, `[data-voucher-row="${saved.id}"]`, () => { setQuery(saved.code); setStatus("all"); setLimit(Number.MAX_SAFE_INTEGER); });
      }
      return result;
    }} />)}
    <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null); }} title={`Delete ${deleting?.code ?? "voucher"}?`} description="This permanently removes the voucher code and cannot be undone." pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))} error={null} onConfirm={confirmDelete} />
  </div></div>;
}

function VoucherMetric({ icon: Icon, label, value, detail }: { icon: typeof Ticket; label: string; value: number; detail: string }) {
  return <article className={styles.metric}><div className={styles.metricLabel}><Icon size={15} aria-hidden="true" />{label}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function VoucherRow({ item, pending, fontClassName, onEdit, onToggle, onDelete }: {
  item: OwnerCatalogPreviewVoucher; pending: boolean; fontClassName: string; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  async function copyCode() {
    try { await navigator.clipboard.writeText(item.code); toast.success(`${item.code} copied.`); }
    catch { toast.error("Could not copy the code. Please try again."); }
  }
  return <li tabIndex={-1} data-voucher-row={item.id} aria-busy={pending || undefined} className={styles.row}><div className={vouchers.row}>
    <div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><Ticket size={20} strokeWidth={1.5} /></span><div className={styles.serviceCopy}><div className={vouchers.code}><h3>{item.code}</h3><button type="button" className={vouchers.copy} aria-label={`Copy ${item.code}`} disabled={pending} onClick={() => void copyCode()}><Copy size={14} aria-hidden="true" /></button></div><div className={styles.metadata}>{pending ? <span className={styles.saving}>Saving…</span> : <span className={`${vouchers.status} ${vouchers[item.status]}`}>{item.status}</span>}<span>{item.redemptions} / 1 used</span></div>{!pending && item.status !== "active" && <p className="mt-1 text-xs text-[#756580]">{item.status === "used" ? "Already redeemed. This code cannot be used again." : item.status === "expired" ? "The expiry date has passed." : "Archived codes are unavailable until restored; expiry and usage still apply."}</p>}</div></div>
    <div className={`${styles.price} ${vouchers.discount}`}><strong>{item.type === "PERCENTAGE" ? `${item.value}% off` : `${peso.format(item.value)} off`}</strong><small>Minimum {peso.format(item.minimumAmount)}</small></div>
    <div className={vouchers.expiry}><span>Expires</span><time dateTime={item.expiresAt}>{dateFormatter.format(new Date(item.expiresAt))}</time></div>
    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={`${styles.rowActions} ${vouchers.actions}`} aria-label={`Actions for ${item.code}`} data-catalog-focus={`vouchers:${item.id}`} disabled={pending}><MoreHorizontal size={16} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${fontClassName} w-44`}><DropdownMenuItem onSelect={onEdit}><Pencil size={16} />Edit</DropdownMenuItem>{(item.status === "active" || item.status === "archived") && <DropdownMenuItem onSelect={onToggle}>{item.status === "archived" ? <Undo2 size={16} /> : <Archive size={16} />}{item.status === "archived" ? "Restore" : "Archive"}</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onSelect={onDelete} className="text-[#C74248] focus:text-[#C74248]"><Trash2 size={16} />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div></li>;
}

function toDateInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function VoucherEditor({ open, onOpenChange, item, fontClassName, onSubmit, onDiscard }: {
  onDiscard: () => void;
  open: boolean; onOpenChange: (open: boolean) => void; item: OwnerCatalogPreviewVoucher | null; fontClassName: string;
  onSubmit: (payload: CreateVoucherInput) => Promise<CatalogMutationResult<OwnerCatalogPreviewVoucher>>;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [type, setType] = useState<"PERCENTAGE" | "FLAT">(item?.type ?? "PERCENTAGE");
  const [value, setValue] = useState(item ? String(item.value) : "");
  const [minimum, setMinimum] = useState(item ? String(item.minimumAmount) : "0");
  const [expiry, setExpiry] = useState(item ? toDateInput(item.expiresAt) : "");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = createVoucherSchema.safeParse({ code, type, value: Number(value), minimum_amount: Number(minimum), expires_at: new Date(`${expiry}T23:59:59+08:00`) });
    if (!parsed.success || !value.trim() || !minimum.trim()) { toast.error("Enter a valid code, discount, minimum spend, and expiry date."); return; }
    submitting.current = true;
    setPending(true);
    onOpenChange(false);
    try {
      const result = await onSubmit(parsed.data);
      if (!result.success) return;
    } finally { submitting.current = false; setPending(false); }
  }
  return <CatalogDraftOverlay draftKey={JSON.stringify({code,type,value,minimum,expiry})} onDiscard={onDiscard} open={open} onOpenChange={next => { if (!submitting.current) onOpenChange(next); }} title={item ? "Edit voucher" : "Create a voucher"} description="Set a discount code, its threshold, and expiry." restoreFocusKey={item ? `vouchers:${item.id}` : "vouchers:create"} className={`${styles.editor} ${fontClassName}`}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" aria-busy={pending || undefined}>
      <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}><fieldset disabled={pending} className={`${styles.editorFields} ${vouchers.fields}`}>
        <div className={styles.editorIntro}><Ticket size={25} strokeWidth={1.5} /><span>Each code can be redeemed once. Customers must meet the minimum spend before the voucher expires.</span></div>
        <label>Voucher code<CatalogInput required maxLength={200} value={code} onChange={event => setCode(event.target.value.toUpperCase())} className={fieldClass} autoCapitalize="characters" spellCheck={false} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="voucher-type">Discount type</label><Select value={type} disabled={pending} onValueChange={next => setType(next as typeof type)}><SelectTrigger id="voucher-type" className={styles.categorySelect}><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="PERCENTAGE">Percentage</SelectItem><SelectItem value="FLAT">Fixed amount</SelectItem></SelectContent></Select></div><label>Discount value<CatalogInput required type="number" min="0" max={type === "PERCENTAGE" ? 100 : 1e12} step="0.01" value={value} onChange={event => setValue(event.target.value)} className={fieldClass} /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label>Minimum spend<CatalogInput required type="number" min="0" max={1e12} step="0.01" value={minimum} onChange={event => setMinimum(event.target.value)} className={fieldClass} /></label><label>Expiry date<CatalogInput required type="date" max="9999-12-31" value={expiry} onChange={event => setExpiry(event.target.value)} className={fieldClass} /></label></div>
        <div className={styles.previewPrice}><span>{code.trim() || "Your code"} gives {type === "PERCENTAGE" ? `${Number(value) || 0}%` : peso.format(Number(value) || 0)} off orders of {peso.format(Number(minimum) || 0)} or more. One redemption, through {expiry || "your selected expiry date"}.</span></div>
        <p className={vouchers.hint}>Expiry is at the end of the selected day in Philippine time. Restoring a voucher does not reset its usage or extend its expiry.</p>
      </fieldset></ScrollArea>
      <CatalogEditorFooter className={styles.editorFooter}><CatalogEditorClose disabled={pending} className={styles.secondary}>Cancel</CatalogEditorClose><button type="submit" disabled={pending} className={styles.primary}>{pending ? "Saving…" : item ? "Save changes" : "Create voucher"}</button></CatalogEditorFooter>
    </form>
  </CatalogDraftOverlay>;
}
