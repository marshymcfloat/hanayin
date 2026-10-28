"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Root, Viewport } from "@radix-ui/react-scroll-area";
import { toast } from "sonner";
import { ScrollBar } from "@/components/ui/scroll-area";
import { CatalogInput } from "@/components/dashboard/owner-preview/CatalogInput";
import { CatalogDraftOverlay } from "@/components/dashboard/owner-preview/CatalogDraftOverlay";
import { CatalogEditorClose, CatalogEditorFooter, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "@/components/dashboard/owner-preview/owner-preview-query";
import type { OwnerPreviewCustomer, OwnerPreviewCustomerHistory } from "@/features/customers/types/owner-preview";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import customerStyles from "@/components/dashboard/design-study/owner-customers.module.css";

export type CustomerContactDraft = { name: string; email: string; phone: string };
export const customerDate = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

function SheetScroll({ children }: { children: ReactNode }) {
  return <Root type="scroll" scrollHideDelay={800} className={styles.editorScroll}><Viewport data-slot="scroll-area-viewport" tabIndex={0} aria-label="Customer details" className="size-full"><div className={styles.editorFields}>{children}</div></Viewport><ScrollBar /></Root>;
}

export function OwnerCustomerEditor({ customer, open, onOpenChange, onDiscard, onSave, fontClassName = "" }: {
  customer?: OwnerPreviewCustomer; open: boolean; onOpenChange: (open: boolean) => void; onDiscard: () => void;
  onSave: (draft: CustomerContactDraft) => Promise<boolean>; fontClassName?: string;
}) {
  const [draft, setDraft] = useState<CustomerContactDraft>({ name: customer?.name ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "" });
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !draft.name.trim()) return;
    lock.current = true; setSaving(true);
    onOpenChange(false);
    try {
      const success = await onSave({ name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() });
      if (success) toast.success(customer ? "Customer updated." : "Customer created.");
    } catch { toast.error("The customer could not be saved. Please try again."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <CatalogDraftOverlay draftKey={JSON.stringify(draft)} onDiscard={onDiscard} open={open} onOpenChange={next => { if (!lock.current) onOpenChange(next); }} title={customer ? "Edit customer" : "Add customer"} description="Contact details for this business. Saving does not send a message." restoreFocusKey={customer ? `customer-${customer.id}` : "add-customer"} className={`${styles.editor} ${fontClassName}`}>
    <form onSubmit={submit} className={customerStyles.form} aria-busy={saving}><SheetScroll><fieldset disabled={saving} className={customerStyles.fields}>
      <label>Customer name<CatalogInput required maxLength={200} autoComplete="off" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Email (optional)<CatalogInput type="email" maxLength={320} autoComplete="off" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /></label>
      <label>Phone (optional)<CatalogInput type="tel" maxLength={50} autoComplete="off" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
    </fieldset></SheetScroll><CatalogEditorFooter className={styles.editorFooter}><CatalogEditorClose type="button" className={styles.secondary} disabled={saving}>Cancel</CatalogEditorClose><button type="submit" className={styles.primary} disabled={saving || !draft.name.trim()}>{saving ? "Saving…" : customer ? "Save changes" : "Create customer"}</button></CatalogEditorFooter></form>
  </CatalogDraftOverlay>;
}

export function OwnerCustomerHistory({ customer, open, onOpenChange, onExited, fontClassName = "" }: { customer: OwnerPreviewCustomer; open: boolean; onOpenChange: (open: boolean) => void; onExited: () => void; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const fetchPreview = useOwnerPreviewFetch();
  const history = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "customers", "history", { customerId: customer.id }),
    queryFn: ({ signal }) => fetchPreview<OwnerPreviewCustomerHistory>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/customers/${encodeURIComponent(customer.id)}/history`, { signal }),
    enabled: open, staleTime: ownerPreviewStaleTime.catalog, gcTime: 0,
  });
  return <CatalogEditorOverlay open={open} onOpenChange={onOpenChange} onExited={onExited} title={customer.name} description="Customer profile and completed service history" restoreFocusKey={`history-${customer.id}`} initialFocus="panel" className={`${styles.editor} ${fontClassName}`}>
    <SheetScroll><dl className={customerStyles.profile}>{[["Phone", customer.phone || "No phone on file"], ["Email", customer.email || "No email on file"], ["Customer since", customerDate(customer.joinedAt)], ["Completed visits", String(customer.completedVisits)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3 className={customerStyles.historyTitle}>Completed service history</h3>
      {history.isPending ? <div role="status" aria-label="Loading customer history" aria-busy="true">{[0, 1, 2].map(i => <div key={i} aria-hidden="true" className={`${styles.skeleton} ${customerStyles.historySkeleton}`} />)}</div> : <>
        {history.isError && <div className={styles.notice} role="alert">Could not refresh service history.<button type="button" className={styles.secondary} onClick={() => void history.refetch()}>Retry history</button></div>}
        {history.data && (history.data.services.length ? <><ul className={customerStyles.history}>{history.data.services.map(service => <li key={service.id}><div>{service.service}<small>{service.completedAt ? customerDate(service.completedAt) : "Date unavailable"}</small>{service.provider && <small>{service.provider}</small>}</div><span>₱{service.amount.toLocaleString("en-PH")}</span></li>)}</ul>{history.data.hasMore && <p className={styles.notice}>Showing the latest 20 completed services.</p>}</> : <p className={styles.notice}>No completed services yet.</p>)}
      </>}
    </SheetScroll><CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} onClick={() => onOpenChange(false)}>Close</button></CatalogEditorFooter>
  </CatalogEditorOverlay>;
}
