"use client";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getBookingChangeEditorAction, reviewBookingChangeAction } from "@/features/bookings/actions/booking-reviewed-change";
import { bookingSelections } from "@/features/bookings/booking-selection";
import type { BookingQuote } from "@/features/bookings/booking-quote";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import ServicePicker, { type SelectedService } from "@/components/bookings/ServicePicker";
import SelectedServiceList from "@/components/bookings/SelectedServiceList";
import { BookingQuoteContext } from "@/components/bookings/BookingQuoteContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

type Data = Extract<Awaited<ReturnType<typeof getBookingChangeEditorAction>>, { success: true }>["data"];
export function BookingChangesDialog({ bookingId, open, onOpenChange, onChanged }: { bookingId: number; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const query = useQuery({ queryKey: ["booking-change-editor", bookingId], queryFn: async () => { const result = await getBookingChangeEditorAction({ bookingId }); if (!result.success) throw new Error(result.error); return result.data; }, enabled: open, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, retry: false });
  return <CatalogEditorOverlay open={open} onOpenChange={onOpenChange} title="Review services & offers" description="Change services and review the complete price before saving. Paid or started bookings are not changed here." restoreFocusKey={`booking-changes:${bookingId}`} className={styles.editor}>
    {query.isFetching || !query.data ? <div className="p-6" role="status">{query.isError ? <><p>{query.error.message}</p><button type="button" className={styles.secondary} onClick={() => { void query.refetch(); }}>Try again</button></> : "Loading services and saved booking…"}</div> : <ChangeForm key={query.dataUpdatedAt} data={query.data} bookingId={bookingId} close={() => onOpenChange(false)} onChanged={onChanged} />}
  </CatalogEditorOverlay>;
}
function ChangeForm({ data, bookingId, close, onChanged }: { data: Data; bookingId: number; close: () => void; onChanged: () => void }) {
  const form = useForm<{ services: SelectedService[] }>({ defaultValues: { services: data.selected } });
  const selected = useWatch({ control: form.control, name: "services" });
  const [voucherCode, setVoucherCode] = useState(data.voucherCode ?? "");
  const [review, setReview] = useState<BookingQuote>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const request = useRef(crypto.randomUUID());
  const key = JSON.stringify({ services: bookingSelections(selected), voucherCode });
  useEffect(() => { setReview(undefined); request.current = crypto.randomUUID(); }, [key]);
  async function submit() {
    if (lock.current || !selected.length) return;
    lock.current = true; setPending(true);
    try {
      const result = await reviewBookingChangeAction({ bookingId, services: bookingSelections(selected), voucherCode: voucherCode.trim() || undefined, expectedFingerprint: review?.fingerprint, requestKey: review ? request.current : undefined });
      if (!result.success) { toast.error(result.error); return; }
      if (!result.applied) { setReview(result.quote); toast.message("Review the updated services, offers, and total."); return; }
      toast.success("Booking services and prices updated."); close(); onChanged();
    } catch { toast.error("The change could not be confirmed. Keep this draft and retry before making another change."); }
    finally { lock.current = false; setPending(false); }
  }
  return <BookingQuoteContext.Provider value={review}>
    <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}><fieldset disabled={pending} className={`${styles.editorFields} grid gap-5`}>
      <p className="text-sm leading-6">Remove a package to remove all of its inclusions. Add it again to change its choices. Replacement services return to the queue; unchanged assignments are retained.</p>
      <ServicePicker services={data.services} packages={data.packages} categories={[...new Set(data.services.map(service => service.category))]} businessSlug={data.businessSlug} selectedDate={new Date(data.scheduledAt)} form={form} presentation="owner" redesign />
      <SelectedServiceList services={selected} presentation="owner" form={{ setValue: (name, items) => form.setValue(name, items.flatMap(item => { const service = data.services.find(service => service.id === item.id); return service ? [{ ...service, ...item }] : []; })) }} />
      <label className="grid gap-2 text-sm">Voucher code (optional)<input className="h-11 rounded-xl border px-3" value={voucherCode} onChange={event => setVoucherCode(event.target.value)} /></label>
      {review && <section className="grid gap-3 rounded-2xl border p-4" aria-label="Reviewed booking prices"><h3 className="font-semibold">Updated total · ₱{review.grandTotal.toFixed(2)}</h3><p className="text-xs">Previously ₱{data.total.toFixed(2)} · {review.totalDuration} minutes after this change</p>{review.offers.map(offer => <p key={offer.id} className="text-sm">Applied: {offer.title}</p>)}{review.voucherOutcome === "BETTER_OFFER" && <p className="text-sm">A better offer was applied. Your voucher has not been used.</p>}<p className="text-xs">Confirming saves these prices and updates availability together.</p></section>}
    </fieldset></ScrollArea>
    <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} disabled={pending} onClick={close}>Cancel</button><button type="button" className={styles.primary} disabled={pending || !selected.length} onClick={() => { void submit(); }}>{pending ? "Checking…" : review ? "Confirm changes" : "Review updated price"}</button></CatalogEditorFooter>
  </BookingQuoteContext.Provider>;
}
