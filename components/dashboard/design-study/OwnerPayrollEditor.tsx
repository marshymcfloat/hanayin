"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPayslipAction, getPayslipDataAction } from "@/features/payroll/actions/payslip";
import { createPayslipSchema } from "@/features/payroll/schemas";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { CatalogInput } from "@/components/dashboard/owner-preview/CatalogInput";
import { useOwnerPreviewContext, useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { useTeamDraftGuard } from "@/components/dashboard/design-study/useTeamDraftGuard";
import { ScrollArea } from "@/components/ui/scroll-area";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import team from "@/components/dashboard/design-study/owner-employees.module.css";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const date = (value: Date | string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(new Date(value));
export function OwnerPayrollEditor({ employee, open, onOpenChange, onExited, onSaved, fontClassName = "" }: { employee: { id: number; name: string }; open: boolean; onOpenChange: (open: boolean) => void; onExited: () => void; onSaved: () => void; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const revoke = useOwnerPreviewRevoke();
  const [deduction, setDeduction] = useState("");
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lock = useRef(false);
  const guard = useTeamDraftGuard(() => onOpenChange(false));
  const query = useQuery({ queryKey: ownerPreviewKeys.section(identity, "payroll", "preview", { employeeId: employee.id }), queryFn: async () => {
    const result = await getPayslipDataAction(employee.id);
    if (!result.success || !("data" in result) || !result.data) {
      if ("error" in result && (result.error === "Forbidden" || result.error === "Unauthorized")) revoke();
      throw new Error("Payout details could not be loaded.");
    }
    return result.data;
  }, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false });
  const data = query.data;
  async function submit() {
    if (lock.current || !data || query.isFetching || query.isError || !confirmed || needsRefresh) return;
    const parsed = createPayslipSchema.safeParse({ employeeId: employee.id, deduction: Number(deduction || 0), comment: comment.trim() || undefined });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check the payout details."); return; }
    lock.current = true; setPending(true); setError("");
    try {
      const result = await createPayslipAction(parsed.data);
      if (!result.success) {
        toast.error(result.error || "The payout could not be confirmed. Your changes are still here.");
        if (result.error === "Forbidden" || result.error === "Unauthorized") revoke();
        return;
      }
      toast.success("Payout recorded."); onOpenChange(false); onSaved();
    } catch { setNeedsRefresh(true); setConfirmed(false); toast.error("The payout could not be confirmed. Refresh the records before retrying."); }
    finally { lock.current = false; setPending(false); }
  }
  return <CatalogEditorOverlay open={open} onOpenChange={() => { if (!lock.current) guard.close(); }} onExited={onExited} title="Review payout" description={employee.name} restoreFocusKey={`payroll:${employee.id}`} className={`${styles.editor} ${fontClassName}`}>
    {guard.confirmation}<form className={team.form} style={guard.confirming ? { display: "none" } : undefined} onSubmit={event => { event.preventDefault(); void submit(); }} onChangeCapture={guard.markChanged}>
      <ScrollArea className={styles.editorScroll}><div className={styles.editorFields}>
        {!data ? query.isError ? <><p role="alert">Payout details could not be loaded. Nothing has been recorded.</p><button type="button" className={styles.secondary} onClick={() => { void query.refetch(); }}>Retry payout details</button></> : <p role="status">Calculating payout…</p> : <fieldset disabled={pending} className={team.fields}>
          <p className={team.help}>Review the current unpaid earnings. Recording this payout marks the included earnings as paid; it does not transfer money.</p>
          <p className={team.help}>{date(data.period.start)} – {date(data.period.end)} · Philippine time</p>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f3ecfa] p-4 text-sm"><dt>Paid days</dt><dd className="text-right">{data.breakdown.days_present + data.breakdown.paid_leave_days}</dd><dt>Basic pay</dt><dd className="text-right">{money(data.breakdown.basic_salary)}</dd><dt>Commission</dt><dd className="text-right">{money(data.breakdown.commission_total)}</dd><dt className="font-semibold">Gross pay</dt><dd className="text-right font-semibold">{money(data.total_salary)}</dd></dl>
          <label className={team.field}>Deduction (PHP)<CatalogInput type="number" min={0} step="0.01" value={deduction} onChange={event => { setDeduction(event.target.value); setConfirmed(false); setError(""); }} /></label>
          {Number(deduction) > data.total_salary && <p role="status" className={team.help}>The deduction exceeds gross pay. It will be capped at gross pay; the excess is not carried forward.</p>}
          <label className={team.field}>Payout note (optional)<textarea maxLength={2000} value={comment} onChange={event => { setComment(event.target.value); setConfirmed(false); }} /></label>
          <div className="flex items-center justify-between rounded-2xl bg-[#f3ecfa] p-4"><span>Net payout</span><strong className="text-2xl">{money(Math.max(0, data.total_salary - (Number(deduction) || 0)))}</strong></div>
          <label className={team.choice}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I have reviewed these earnings and want to record this payout as paid.</label>
          {error && <p role="alert">{error}</p>}
          {needsRefresh && <div role="alert"><p>The result is uncertain. Reload the current earnings before recording another payout.</p><button type="button" className={styles.secondary} disabled={query.isFetching} onClick={() => { void query.refetch().then(result => { if (!result.isError) setNeedsRefresh(false); }); }}>Reload payout details</button></div>}
        </fieldset>}
      </div></ScrollArea>
      <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} disabled={pending} onClick={guard.close}>Cancel</button><button type="submit" className={styles.primary} disabled={!data || !confirmed || pending || query.isFetching || query.isError || needsRefresh}>{pending ? "Recording…" : "Confirm payout"}</button></CatalogEditorFooter>
    </form>
  </CatalogEditorOverlay>;
}
