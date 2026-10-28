"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CatalogEditorFooter, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEmployeePaySettingsAction } from "@/features/payroll/actions/pay-settings";
import { saveCompensationAction } from "@/features/payroll/actions/lifecycle";
import { compensationSchema } from "@/features/payroll/v2/schemas";
import { currentPayTerms, paySettingsDraft, type EmployeePaySettings, type PaySettingsDraft } from "@/features/payroll/pay-settings";
import { PayrollScroll } from "@/components/payroll/PayrollScroll";
import { useCommandKeys } from "@/components/payroll/useCommandKeys";
import { php } from "@/components/payroll/StatementDetails";
import styles from "@/components/payroll/simple-payroll.module.css";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

export function EmployeePaySettingsButton({ employeeId, employeeName, businessSlug, userId, onSaved, disabled = false, fontClassName = "" }: { employeeId: number; employeeName: string; businessSlug: string; userId: string; onSaved?: () => void; disabled?: boolean; fontClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const focusKey = `pay-settings:${employeeId}`;
  return <><button type="button" className={styles.secondary} disabled={disabled || pending} data-catalog-focus={focusKey} onClick={() => setOpen(true)}>Pay settings<span className="sr-only"> for {employeeName}</span></button><EmployeePaySettingsEditor employeeId={employeeId} businessSlug={businessSlug} userId={userId} open={open} onOpenChange={setOpen} onPendingChange={setPending} restoreFocusKey={focusKey} onSaved={onSaved} fontClassName={fontClassName} /></>;
}

function PaySettingsRead({ employeeId, businessSlug, userId, onRead, onDenied }: { employeeId: number; businessSlug: string; userId: string; onRead: (data: EmployeePaySettings) => void; onDenied?: () => void }) {
  const query = useQuery({ queryKey: ["employee-pay-settings", businessSlug, userId, employeeId], queryFn: async () => {
    const result = await getEmployeePaySettingsAction(employeeId);
    if (!result.success) { if ("forbidden" in result && result.forbidden) onDenied?.(); throw new Error(result.error); }
    return result.data;
  }, staleTime: 0, gcTime: 0, retry: false });
  useEffect(() => { if (query.data) onRead(query.data); }, [query.data, onRead]);
  return <div className={styles.sheetBody}><p role={query.isError ? "alert" : "status"}>{query.isError ? query.error.message : "Loading pay settings…"}</p>{query.isError && <button className={styles.secondary} onClick={() => void query.refetch()}>Retry pay settings</button>}</div>;
}

function PayMenu({ label, value, options, onChange, fontClassName = "" }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void; fontClassName?: string }) {
  return <label className={styles.field}>{label}<Select value={value} onValueChange={onChange}><SelectTrigger className={styles.select} aria-label={label}><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}>{options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>;
}

export function EmployeePaySettingsEditor({ employeeId, businessSlug, userId, open, onOpenChange, restoreFocusKey, onSaved, onPendingChange, onDenied, fontClassName = "" }: { employeeId: number; businessSlug: string; userId: string; open: boolean; onOpenChange: (open: boolean) => void; restoreFocusKey: string; onSaved?: () => void; onPendingChange?: (pending: boolean) => void; onDenied?: () => void; fontClassName?: string }) {
  const client = useQueryClient();
  const command = useCommandKeys();
  const payDateHelpId = useId();
  const lock = useRef(false);
  const mounted = useRef(true);
  const returnFocus = useRef(false);
  const [data, setData] = useState<EmployeePaySettings | null>(null);
  const [draft, setDraft] = useState<PaySettingsDraft | null>(null);
  const [commissions, setCommissions] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (pending || open || !returnFocus.current) return;
    const frame = requestAnimationFrame(() => {
      returnFocus.current = false;
      const active = document.activeElement;
      if (document.querySelector('[data-testid="catalog-editor-overlay"]') || active && active !== document.body && active.isConnected && !active.matches(":disabled") && !active.closest("[inert]")) return;
      Array.from(document.querySelectorAll<HTMLElement>("[data-catalog-focus]")).find(target => target.dataset.catalogFocus === restoreFocusKey && target.getClientRects().length > 0 && !target.matches(":disabled"))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, open, restoreFocusKey]);
  function received(value: EmployeePaySettings) {
    const next = paySettingsDraft(value.employee, today());
    if (!value.employee.agreements.length) {
      const rate = Number(value.legacy.dailyRate);
      next.rate = Number.isFinite(rate) && rate > 0 ? value.legacy.dailyRate : "";
      next.commissionRate = value.legacy.commissionRate;
    }
    setData(value); setDraft(next); setCommissions(Number(next.commissionRate) > 0);
  }
  function change(next: PaySettingsDraft) { setDraft(next); setDirty(true); setError(""); }
  function close() { if (lock.current) return; if (dirty) setConfirming(true); else onOpenChange(false); }
  function discard() { setDirty(false); setFailed(false); setConfirming(false); onOpenChange(false); }
  async function save() {
    if (!draft || !data || lock.current) return;
    const parsed = compensationSchema.safeParse(command("PAY_SETTINGS", { ...draft, monthlyDivisor: data.policy === "GOVERNMENT" && draft.basis === "MONTHLY" ? draft.monthlyDivisor : undefined }));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the pay rate and dates."); return; }
    lock.current = true; returnFocus.current = true; setPending(true); setFailed(false); onPendingChange?.(true); onOpenChange(false);
    try {
      const result = await saveCompensationAction(parsed.data);
      if (!result.success) {
        if (result.code === "FORBIDDEN") { if (mounted.current) { setData(null); setDraft(null); setDirty(false); } onDenied?.(); toast.error(result.error); return; }
        if (mounted.current) { setFailed(true); setError(result.error); }
        toast.error(result.error, { action: { label: "Review draft", onClick: () => { if (mounted.current) onOpenChange(true); } } });
        return;
      }
      toast.success("Pay settings saved. Earlier payslips are unchanged.");
      if (mounted.current) { setDraft(null); setData(null); setDirty(false); }
      void client.invalidateQueries({ queryKey: ["payroll-lifecycle", businessSlug, userId] }).catch(() => {});
      void client.invalidateQueries({ queryKey: ["employee-pay-settings", businessSlug, userId, employeeId] }).catch(() => {});
      try { onSaved?.(); } catch { toast.warning("Pay settings were saved. Refresh the page to update displayed amounts."); }
    } catch {
      if (mounted.current) { setFailed(true); setError("The change could not be confirmed. Retry the same draft safely."); }
      toast.error("Pay settings could not be confirmed.", { action: { label: "Review draft", onClick: () => { if (mounted.current) onOpenChange(true); } } });
    } finally { lock.current = false; if (mounted.current) setPending(false); onPendingChange?.(false); }
  }
  const terms = data ? currentPayTerms(data.employee, today()) : undefined;
  const prefilled = data && !data.employee.agreements.length && (Number(data.legacy.dailyRate) > 0 || Number(data.legacy.commissionRate) > 0);
  const canSave = dirty || Boolean(data && draft && !data.employee.agreements.length && draft.rate !== "");
  return <>
    {pending && <p role="status" className={styles.pendingNotice}>Saving pay settings… The current rate stays in place until confirmed.</p>}
    {failed && !open && <button className={styles.secondary} type="button" onClick={() => onOpenChange(true)}>Resume pay settings draft</button>}
    <CatalogEditorOverlay open={open} onOpenChange={next => { if (next) onOpenChange(true); else close(); }} onExited={() => { if (!pending && !failed) { setData(null); setDraft(null); setDirty(false); } }} title="Pay settings" description={data ? `${data.employee.name} · set how this person earns.` : "One pay record, shared by People and Payroll."} restoreFocusKey={restoreFocusKey} className={`${styles.editor} ${fontClassName}`}>
      {confirming ? <div role="alert" className={styles.sheetBody}><h3>Discard your changes?</h3><p>These pay settings have not been saved.</p><div className={styles.reviewActions}><button className={styles.primary} onClick={() => setConfirming(false)}>Keep editing</button><button className={styles.secondary} onClick={discard}>Discard changes</button></div></div> : open && !data ? <PaySettingsRead employeeId={employeeId} businessSlug={businessSlug} userId={userId} onRead={received} onDenied={onDenied} /> : data && draft && <form className={styles.sheetForm} onSubmit={event => { event.preventDefault(); void save(); }}>
        <PayrollScroll label="Pay settings fields" className={styles.sheetBody}>
          <section className={styles.amountPreview} aria-label="Current pay settings"><span>{terms ? "Current pay" : prefilled ? "Review pay settings" : "Pay not set"}</span>{terms && <strong>{php(terms.rate)} / {terms.basis === "DAILY" ? "day" : terms.basis === "HOURLY" ? "hour" : "month"}</strong>}</section>
          {data.mode === "LEGACY" && <p className={styles.help}>Your existing payroll and its rates remain unchanged. These dated terms are used after you explicitly enable period-based pay tracking in Payroll.</p>}
          {prefilled && <p className={styles.help}>Filled from this person&apos;s existing pay details. Review the rate, commission basis, and starting date before saving.</p>}
          {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
          {failed && <button type="button" className={styles.textButton} onClick={() => { setDraft(null); setData(null); setFailed(false); setDirty(false); setError(""); }}>Reload latest settings and discard draft</button>}
          <div className={styles.fields}>
            <PayMenu label="Paid per" value={draft.basis} onChange={basis => change({ ...draft, basis: basis as PaySettingsDraft["basis"] })} options={[["DAILY", "Day"], ["HOURLY", "Hour"], ["MONTHLY", "Month"]]} fontClassName={fontClassName} />
            <label className={styles.field}>{draft.basis === "DAILY" ? "Daily rate" : draft.basis === "HOURLY" ? "Hourly rate" : "Monthly salary"}<input required type="number" min="0" step="0.01" value={draft.rate} onChange={event => change({ ...draft, rate: event.target.value })} /></label>
            <label className={styles.field}>Apply this pay from<input required type="date" aria-label="Apply this pay from" aria-describedby={payDateHelpId} min={data.employee.employmentStart ?? undefined} value={draft.from} onChange={event => change({ ...draft, from: event.target.value })} /><span id={payDateHelpId} className={styles.help}>This pay applies to work from this date. Saved payslips stay unchanged.</span></label>
            <label className={styles.field}>Hours in a usual workday<input required type="number" min="0.25" max="8" step="0.25" value={draft.hours} onChange={event => change({ ...draft, hours: event.target.value })} /></label>
            {data.policy === "GOVERNMENT" && draft.basis === "MONTHLY" && <label className={styles.field}>Verified monthly daily-rate divisor<input required type="number" min="0.01" step="0.01" value={draft.monthlyDivisor ?? ""} onChange={event => change({ ...draft, monthlyDivisor: event.target.value })} /></label>}
          </div>
          <label className={styles.choice}><input type="checkbox" checked={commissions} onChange={event => { setCommissions(event.target.checked); change({ ...draft, commissionRate: event.target.checked ? "" : "0" }); }} />This person also earns commission</label>
          {commissions && <div className={styles.fields}><label className={styles.field}>Commission percentage<input required type="number" min="0" max="100" step="0.01" value={draft.commissionRate} onChange={event => change({ ...draft, commissionRate: event.target.value })} /></label><PayMenu label="Calculate commission from" value={draft.commissionBasis} onChange={basis => change({ ...draft, commissionBasis: basis as PaySettingsDraft["commissionBasis"] })} options={[["ORIGINAL_PRICE", "Original booked price"], ["DISCOUNTED_PRICE", "Price after discounts"]]} fontClassName={fontClassName} /></div>}
          <p className={styles.help}>A new starting date preserves previous rates. Saved payslips and captured commissions are never rewritten. Refresh any existing draft payroll before saving its payslips.</p>
          {data.employee.agreements.length > 0 && <section className={styles.settingsSection} aria-label="Pay history"><h3>Pay history</h3>{data.employee.agreements.map(entry => <p className={styles.help} key={entry.id}>{entry.from} – {entry.to ?? "ongoing"} · {php(entry.rate)} / {entry.basis.toLowerCase()} · {entry.commissionRate}% commission</p>)}</section>}
        </PayrollScroll>
        <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} onClick={close}>Cancel</button><button type="submit" className={styles.primary} disabled={pending || !canSave}>Save pay settings</button></CatalogEditorFooter>
      </form>}
    </CatalogEditorOverlay>
  </>;
}
