"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2, Clock3, Copy, Gift, Mail, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createGiftCardAction, deleteGiftCardAction, updateGiftCardAction } from "@/features/gift-cards/actions/gift-cards";
import type { OwnerCatalogCommittedChange, OwnerCatalogPreviewGiftCard, OwnerCatalogPreviewGiftCardStatus, OwnerGiftCardsPreviewReadModel } from "@/features/catalog/types/owner-catalog-preview";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteDialog } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewShared";
import { CatalogEditorClose, CatalogEditorFooter, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOptimisticCatalog } from "@/components/dashboard/owner-preview/useOptimisticCatalog";
import { CatalogDraftOverlay } from "@/components/dashboard/owner-preview/CatalogDraftOverlay";
import { CatalogInput } from "@/components/dashboard/owner-preview/CatalogInput";
import { showCatalogSaved } from "@/components/dashboard/owner-preview/showCatalogSaved";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useCatalogEditorSessions } from "@/components/dashboard/owner-preview/useCatalogEditorSessions";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import gifts from "@/components/dashboard/design-study/owner-gift-cards.module.css";

const GiftCardClaimForm = dynamic(() => import("@/components/bookings/GiftCardClaimForm"), {
  loading: () => <div role="status" aria-label="Loading gift card claim" className={gifts.claimLoading}><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>,
});
const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const fieldClass = "mt-1.5 h-11 w-full px-3.5 outline-none";
type GiftPayload = { code: string; customer_name: string; customer_email: string | null; customer_phone: string | null; expires_at: Date; service_ids: number[]; package_ids: number[] };
type GiftResult = { success: true; data: OwnerCatalogPreviewGiftCard; warning?: string } | { success: false; error: string };

export function OwnerGiftCardsStudy({ data, fontClassName = "", onChanged, onGiftCardClaimed }: {
  data: OwnerGiftCardsPreviewReadModel; fontClassName?: string;
  onChanged?: (change: OwnerCatalogCommittedChange<OwnerCatalogPreviewGiftCard>) => void;
  onGiftCardClaimed?: () => void;
}) {
  const [query, setQuery] = useCatalogListState(`${data.business.slug}:GiftCards`, "query", "");
  const [status, setStatus] = useCatalogListState<"all" | OwnerCatalogPreviewGiftCardStatus>(`${data.business.slug}:GiftCards`, "status", "all");
  const [sort, setSort] = useCatalogListState(`${data.business.slug}:GiftCards`, "sort", "recipient");
  const [limit, setLimit] = useCatalogListState(`${data.business.slug}:GiftCards`, "limit", 12);
  const [deliveryWarnings, setDeliveryWarnings] = useCatalogListState<Record<number, string>>(`${data.business.slug}:GiftCards`, "delivery-warnings", {});
  const editors = useCatalogEditorSessions<OwnerCatalogPreviewGiftCard>();
  const [deleting, setDeleting] = useState<OwnerCatalogPreviewGiftCard | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const deletingIds = useRef(new Set<number>());
  const listRef = useRef<HTMLDivElement>(null);
  useCatalogScroll(`${data.business.slug}:GiftCards`, listRef);
  const catalog = useOptimisticCatalog(data.giftCards, onChanged);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => catalog.items.filter(item =>
    (!normalized || `${item.code} ${item.recipientName} ${item.recipientEmail ?? ""} ${item.recipientPhone ?? ""} ${item.includedServices.map(entry => entry.name).join(" ")} ${item.includedPackages.map(entry => entry.name).join(" ")}`.toLowerCase().includes(normalized)) &&
    (status === "all" || item.status === status),
  ).sort((a, b) => sort === "expiry" ? a.expiresAt.localeCompare(b.expiresAt) : sort === "code" ? a.code.localeCompare(b.code) : a.recipientName.localeCompare(b.recipientName)), [catalog.items, normalized, status, sort]);
  const shown = visible.slice(0, limit);
  const captureRows = useSelectionMotion(listRef, shown.map(item => item.id).join(","), "gift");
  const filtered = Boolean(normalized || status !== "all");

  function openEditor(item: OwnerCatalogPreviewGiftCard | null = null) {
    editors.open(item);
  }
  async function confirmDelete() {
    if (!deleting || deletingIds.current.has(deleting.id)) return;
    const target = deleting;
    deletingIds.current.add(target.id); setDeleting(null); captureRows();
    try {
      const result = await catalog.remove(target.id, async () => {
        const response = await deleteGiftCardAction(target.id);
        return response.success ? { success: true as const, data: target } : response;
      });
      if (!result.success) { setDeleting(current => current ?? target); toast.error(result.error); }
      else toast.success(`${target.code} was deleted.`);
    } finally { deletingIds.current.delete(target.id); }
  }

  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{data.business.name} · Customer gifting</p><h1>Gift cards<span className={styles.titleDetail}>, chosen with care.</span></h1><p className={styles.description}>Give your services and packages to someone special. Keep every recipient and claim in view.</p></div>
      <div className={gifts.headerActions}><button type="button" className={styles.secondary} data-catalog-focus="gift-cards:claim" onClick={() => setClaimOpen(true)}><Gift size={17} aria-hidden="true" />Claim gift card</button><button type="button" className={styles.primary} data-catalog-focus="gift-cards:create" onClick={() => openEditor()}><Plus size={17} aria-hidden="true" />Issue gift card</button></div>
    </header>
    <section className={styles.summary} aria-label="Gift card overview">
      <GiftMetric icon={Gift} label="Total gift cards" value={data.metrics.totalGiftCards} detail="All issued catalog gifts" />
      <GiftMetric icon={Mail} label="Active" value={data.metrics.activeGiftCards} detail="Available to claim" />
      <GiftMetric icon={CheckCircle2} label="Claimed" value={data.metrics.claimedGiftCards} detail="Confirmed redemptions" />
      <GiftMetric icon={Clock3} label="Expired" value={data.metrics.expiredGiftCards} detail="Past their claim date" />
    </section>
    <div ref={listRef}><section className={styles.catalog} aria-labelledby="gift-catalog-heading">
      <div className={styles.toolbar}><div><h2 id="gift-catalog-heading">Your gift cards</h2><span className={styles.count} role="status">{visible.length} {filtered ? "matching" : "listed"} gift cards{catalog.pendingIds.size ? " · Changes pending" : ""}</span></div><div className={styles.filters}>
        <label className={styles.search}><span className="sr-only">Search gift cards</span><Search size={16} aria-hidden="true" /><input placeholder="Find a code or recipient…" value={query} onChange={event => { captureRows(); setLimit(12); setQuery(event.target.value); }} /></label>
        <Select value={status} onValueChange={value => { captureRows(); setLimit(12); setStatus(value as typeof status); }}><SelectTrigger className={styles.select} aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="claimed">Claimed</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent></Select>
        <Select value={sort} onValueChange={value => { captureRows(); setLimit(12); setSort(value); }}><SelectTrigger className={styles.select} aria-label="Sort gift cards"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="recipient">Recipient A–Z</SelectItem><SelectItem value="expiry">Expiry: soonest</SelectItem><SelectItem value="code">Code A–Z</SelectItem></SelectContent></Select>
      </div></div>
      <ul className={styles.list} data-gift-area>{shown.map(item => <GiftRow key={item.id} item={item} deliveryWarning={deliveryWarnings[item.id]} pending={catalog.pendingIds.has(item.id)} fontClassName={fontClassName} onEdit={() => openEditor(item)} onDelete={() => setDeleting(item)} />)}</ul>
      {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon} aria-hidden="true"><Gift size={29} strokeWidth={1.5} /></span><h3>{filtered ? "No matching gift cards" : "A thoughtful gift starts here."}</h3><p>{filtered ? "Try another recipient, code, included item, or status." : "Choose a recipient and services or packages for your first gift card."}</p><button type="button" className={styles.secondary} onClick={filtered ? () => { captureRows(); setQuery(""); setStatus("all"); } : () => openEditor()}>{filtered ? "Clear filters" : "Issue your first gift card"}</button></div></div>}
      {shown.length < visible.length && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length} matching gift cards</span><button type="button" className={styles.secondary} onClick={() => { captureRows(); setLimit(value => value + 12); }}>Show more gift cards<Plus size={14} aria-hidden="true" /></button></div>}
      <div className={styles.footer}><span>Gifts include services and packages. Claims are confirmed after booking succeeds.</span><span>Dates · Philippine time</span></div>
    </section></div>
    {editors.sessions.filter(entry => (entry.state === "failed" || entry.state === "draft") && entry.id !== editors.activeId).map(entry => <button key={entry.id} type="button" className={styles.secondary} onClick={() => editors.resume(entry.id)}>Resume gift card draft {entry.id}</button>)}
    {editors.sessions.map(({ id: sessionId, item: editing }) => <GiftEditor key={sessionId} open={editors.activeId === sessionId} onOpenChange={open => open ? editors.resume(sessionId) : editors.dismiss(sessionId)} onDiscard={() => editors.status(sessionId, "saved")} item={editing} data={data} fontClassName={fontClassName} onSubmit={async payload => {
      editors.status(sessionId, "pending");
      captureRows();
      const optimistic: OwnerCatalogPreviewGiftCard = { id: editing?.id ?? catalog.nextTemporaryId(), code: payload.code, recipientName: payload.customer_name, recipientEmail: payload.customer_email, recipientPhone: payload.customer_phone, expiresAt: payload.expires_at.toISOString(), claimedAt: editing?.claimedAt ?? null, status: editing?.status ?? "active", includedServices: data.availableServices.filter(entry => payload.service_ids.includes(entry.id)).map(({ id, name }) => ({ id, name })), includedPackages: data.availablePackages.filter(entry => payload.package_ids.includes(entry.id)).map(({ id, name }) => ({ id, name })) };
      const result: GiftResult = await (editing ? catalog.update(optimistic, () => updateGiftCardAction(editing.id, payload)) : catalog.create(optimistic, () => createGiftCardAction(payload)));
      if (!result.success) editors.failed(sessionId, result.error);
      else {
        editors.status(sessionId, "saved");
        const saved = result.data;
        if (result.warning) setDeliveryWarnings(current => ({ ...current, [saved.id]: result.warning! }));
        showCatalogSaved(`${saved.code} was ${editing?.id ? "updated" : "issued"}.`, `[data-gift-row="${saved.id}"]`, () => { setQuery(saved.code); setStatus("all"); setLimit(Number.MAX_SAFE_INTEGER); });
      }
      return result;
    }} />)}
    <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null); }} title={`Delete ${deleting?.code ?? "gift card"}?`} description="This permanently removes the gift card and its included services and packages." pending={Boolean(deleting && catalog.pendingIds.has(deleting.id))} error={null} onConfirm={confirmDelete} />
    <CatalogEditorOverlay open={claimOpen} onOpenChange={setClaimOpen} title="Claim gift card booking" description="Verify the recipient’s gift and choose when they will visit." restoreFocusKey="gift-cards:claim" className={`${styles.editor} ${gifts.claim} ${fontClassName}`} size="booking">
      <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}><div className={styles.editorFields}>{claimOpen && <GiftCardClaimForm businessSlug={data.business.slug} mode="staff" onSuccess={() => { setClaimOpen(false); onGiftCardClaimed?.(); }} />}</div></ScrollArea>
    </CatalogEditorOverlay>
  </div></div>;
}

function GiftMetric({ icon: Icon, label, value, detail }: { icon: typeof Gift; label: string; value: number; detail: string }) {
  return <article className={styles.metric}><div className={styles.metricLabel}><Icon size={15} aria-hidden="true" />{label}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function GiftRow({ item, pending, fontClassName, onEdit, onDelete, deliveryWarning }: { deliveryWarning?: string; item: OwnerCatalogPreviewGiftCard; pending: boolean; fontClassName: string; onEdit: () => void; onDelete: () => void }) {
  async function copyCode() {
    try { await navigator.clipboard.writeText(item.code); toast.success(`${item.code} copied.`); }
    catch { toast.error("Could not copy the code. Please try again."); }
  }
  return <li tabIndex={-1} className={styles.row} data-gift-row={item.id} aria-busy={pending || undefined}><div className={gifts.row}>
    <div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><Gift size={20} strokeWidth={1.5} /></span><div className={styles.serviceCopy}><div className={gifts.code}><h3>{item.code}</h3><button type="button" className={gifts.copy} aria-label={`Copy ${item.code}`} onClick={() => void copyCode()} disabled={pending}><Copy size={14} aria-hidden="true" /></button></div><div className={styles.metadata}>{pending ? <span className={styles.saving}>Saving…</span> : <span className={`${gifts.status} ${gifts[item.status]}`}>{item.status}</span>}</div></div></div>
    <div className={gifts.recipient}><span className={gifts.label}>Recipient</span><strong>{item.recipientName}</strong>{item.recipientEmail && <span>{item.recipientEmail}</span>}{item.recipientPhone && <span>{item.recipientPhone}</span>}{deliveryWarning && <p className="mt-2 text-xs text-[#a65a13]">Email delivery needs attention: {deliveryWarning}</p>}</div>
    <div className={gifts.inclusions}><span className={gifts.label}>Included catalog</span><div className={gifts.tags}>{item.includedServices.map(entry => <span key={`service-${entry.id}`} title="Service">{entry.name}</span>)}{item.includedPackages.map(entry => <span key={`package-${entry.id}`} title="Package">{entry.name}</span>)}</div></div>
    <div className={gifts.dates}><span className={gifts.label}>Expires</span><time dateTime={item.expiresAt}>{dateFormatter.format(new Date(item.expiresAt))}</time>{item.claimedAt && <><span className={gifts.label}>Claimed</span><time dateTime={item.claimedAt}>{dateFormatter.format(new Date(item.claimedAt))}</time></>}</div>
    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={`${styles.rowActions} ${gifts.actions}`} aria-label={`Actions for ${item.code}`} data-catalog-focus={`gift-cards:${item.id}`} disabled={pending}><MoreHorizontal size={16} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${fontClassName} w-44`}><DropdownMenuItem onSelect={onEdit}><Pencil size={16} />Edit</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={onDelete} className="text-[#C74248] focus:text-[#C74248]"><Trash2 size={16} />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div></li>;
}

function toDateInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function GiftEditor({ open, onOpenChange, item, data, fontClassName, onSubmit, onDiscard }: { onDiscard: () => void; open: boolean; onOpenChange: (open: boolean) => void; item: OwnerCatalogPreviewGiftCard | null; data: OwnerGiftCardsPreviewReadModel; fontClassName: string; onSubmit: (payload: GiftPayload) => Promise<GiftResult> }) {
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState(item?.recipientName ?? "");
  const [email, setEmail] = useState(item?.recipientEmail ?? "");
  const [phone, setPhone] = useState(item?.recipientPhone ?? "");
  const [expiry, setExpiry] = useState(item ? toDateInput(item.expiresAt) : "");
  const [services, setServices] = useState(() => item?.includedServices.map(entry => entry.id) ?? []);
  const [packages, setPackages] = useState(() => item?.includedPackages.map(entry => entry.id) ?? []);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const available = [
    ...data.availableServices.map(entry => ({ ...entry, kind: "Service" as const })),
    ...data.availablePackages.map(entry => ({ ...entry, kind: "Package" as const })),
  ].filter(entry => `${entry.name} ${entry.category} ${entry.kind}`.toLowerCase().includes(catalogQuery.trim().toLowerCase()));
  function toggle(id: number, kind: "Service" | "Package") {
    const update = kind === "Service" ? setServices : setPackages;
    update(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const expiresAt = new Date(`${expiry}T23:59:59+08:00`);
    if (!code.trim() || !name.trim() || !Number.isFinite(expiresAt.getTime())) { toast.error("Enter a gift code, recipient name, and valid expiry date."); return; }
    if (!email.trim() && !phone.trim()) { toast.error("Add a recipient email or phone."); return; }
    if (!services.length && !packages.length) { toast.error("Select at least one service or package."); return; }
    if (services.length > 100 || packages.length > 100) { toast.error("Select no more than 100 services and 100 packages."); return; }
    if (services.some(id => !data.availableServices.some(entry => entry.id === id)) || packages.some(id => !data.availablePackages.some(entry => entry.id === id))) { toast.error("An included item is no longer available. Reopen the editor to review the catalog."); return; }
    submitting.current = true; setPending(true);
    onOpenChange(false);
    try {
      const result = await onSubmit({ code: code.trim().toUpperCase(), customer_name: name.trim(), customer_email: email.trim() || null, customer_phone: phone.trim() || null, expires_at: expiresAt, service_ids: services, package_ids: packages });
      if (!result.success) return;
      if (result.warning) toast.warning(result.warning);
    } finally { submitting.current = false; setPending(false); }
  }
  return <CatalogDraftOverlay draftKey={JSON.stringify({code,name,email,phone,expiry,services,packages})} onDiscard={onDiscard} open={open} onOpenChange={next => { if (!submitting.current) onOpenChange(next); }} title={item ? "Edit gift card" : "Issue a gift card"} description="Choose the recipient and the services or packages they can claim." restoreFocusKey={item ? `gift-cards:${item.id}` : "gift-cards:create"} className={`${styles.editor} ${gifts.editor} ${fontClassName}`}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" aria-busy={pending || undefined}>
      <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}><fieldset disabled={pending} className={`${styles.editorFields} ${gifts.fields}`}>
        <div className={styles.editorIntro}><Gift size={25} strokeWidth={1.5} /><span>Gift experiences from your catalog. The recipient receives the selected services and packages.</span></div>
        <div className="grid gap-3 sm:grid-cols-2"><label>Gift code<CatalogInput required maxLength={200} value={code} onChange={event => setCode(event.target.value.toUpperCase())} className={fieldClass} autoCapitalize="characters" spellCheck={false} /></label><label>Recipient name<CatalogInput required maxLength={200} value={name} onChange={event => setName(event.target.value)} className={fieldClass} /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label>Recipient email<CatalogInput type="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} className={fieldClass} /></label><label>Recipient phone<CatalogInput type="tel" maxLength={50} value={phone} onChange={event => setPhone(event.target.value)} className={fieldClass} /></label></div>
        <label className={gifts.expiryField}>Expiry date<CatalogInput required type="date" max="9999-12-31" value={expiry} onChange={event => setExpiry(event.target.value)} className={fieldClass} /></label>
        <p className={gifts.hint}>Expiry is at the end of the selected day in Philippine time. The claim flow verifies the recipient’s email.</p>
        <fieldset className={styles.formSection}><legend>Included catalog · {services.length + packages.length} selected</legend>
          {data.availableServices.length || data.availablePackages.length ? <><label className={gifts.catalogSearch}>Find services or packages<CatalogInput className={fieldClass} value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Search name, category, or type" /></label><div className={gifts.choices}>{available.map(entry => <label key={`${entry.kind}-${entry.id}`} className={gifts.choice}><Checkbox aria-label={`Include ${entry.kind.toLowerCase()} ${entry.name}`} disabled={pending} checked={(entry.kind === "Service" ? services : packages).includes(entry.id)} onCheckedChange={() => toggle(entry.id, entry.kind)} /><span>{entry.name}<small>{entry.kind} · {entry.category}</small></span></label>)}</div>{!available.length && <p className={gifts.hint}>No matching catalog items. Your selections are kept.</p>}</> : <p className={gifts.hint}>Add a service or package before issuing a gift card.</p>}
        </fieldset>
      </fieldset></ScrollArea>
      <CatalogEditorFooter className={styles.editorFooter}><CatalogEditorClose disabled={pending} className={styles.secondary}>Cancel</CatalogEditorClose><button type="submit" disabled={pending || (!data.availableServices.length && !data.availablePackages.length)} className={styles.primary}>{pending ? "Saving…" : item ? "Save changes" : "Issue gift card"}</button></CatalogEditorFooter>
    </form>
  </CatalogDraftOverlay>;
}
