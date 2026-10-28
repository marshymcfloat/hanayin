"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { CatalogEditorFooter, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PayrollWorkspaceView, StatementView } from "@/features/payroll/v2/contracts";
import type { getPayrollWorkspaceAction } from "@/features/payroll/actions/lifecycle";
import { decimal, outstanding } from "@/features/payroll/money";
import { currentWorkPeriod } from "@/features/payroll/v2/period";
import { PayrollScroll } from "@/components/payroll/PayrollScroll";
import { StatementDetails, php } from "@/components/payroll/StatementDetails";
import styles from "@/components/payroll/simple-payroll.module.css";
import { paySettingsDraft, type PaySettingsDraft } from "@/features/payroll/pay-settings";

export const payrollToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
export type SimpleEmployee = PayrollWorkspaceView["employees"][number];
export type SimplePaymentDraft = { amount: string; date: string; method: "CASH" | "BANK" | "WALLET"; reference: string };
export type SimpleDatesDraft = { start: string; end: string; paymentDate: string; employeeIds: number[]; kind: "REGULAR" | "OFF_CYCLE" };
export type SimpleSetupDraft = { cadence: "WEEKLY" | "SEMIMONTHLY" | "CUSTOM"; payDays: number[]; smsEnabled: boolean; effectiveFrom: string };
export type SimpleCompensationDraft = PaySettingsDraft;
export type SimpleAdjustmentDraft = { employeeId: number; expectedRevision: number; label: string; amount: string; reason: string; earnedOn: string; originalStatementId?: string };
export type SimplePayChecks = Pick<Extract<Awaited<ReturnType<typeof getPayrollWorkspaceAction>>, { success: true }>, "adjustments" | "historical">;
type SimpleRecoveryDraft = { adjustmentId: string; employeeId: number; expectedRevision: number; disposition: "APPROVED" | "DEFERRED" | "WAIVED"; reason: string; reviewedAmount: string; proposedAmount: string };
type SimpleCommissionDraft = { serviceId: number; employeeId: number; employeeName: string; expectedRevision: number; rate: string; base: string; payableOn: string; evidence: string; paid: boolean; earnedOn: string | null };
export type SimpleEditor =
  | { kind: "dates"; draft: SimpleDatesDraft; expectedRevision?: number }
  | { kind: "setup"; draft: SimpleSetupDraft }
  | { kind: "compensation"; draft: SimpleCompensationDraft }
  | { kind: "review"; statementId: string; expectedRevision: number; recordPayment?: boolean; payment?: SimplePaymentDraft; reviewed?: boolean }
  | { kind: "payment"; statementId: string; expectedRevision: number; draft: SimplePaymentDraft }
  | { kind: "adjustment"; statementId: string; draft: SimpleAdjustmentDraft }
  | { kind: "checks"; statementId?: string }
  | { kind: "recovery"; statementId?: string; draft: SimpleRecoveryDraft }
  | { kind: "commission"; statementId?: string; draft: SimpleCommissionDraft }
  | { kind: "settings" };

export function simpleEditorFocusKey(editor: SimpleEditor) {
  if ("statementId" in editor && editor.statementId) return "payroll-" + editor.statementId;
  if (editor.kind === "compensation") return "pay-terms-" + editor.draft.employeeId;
  return ["checks", "recovery", "commission"].includes(editor.kind) ? "payroll-settings" : "payroll-" + editor.kind;
}

export function SimpleMenu({ label, value, options, onChange, className = "", disabled = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; className?: string; disabled?: boolean }) {
  return <label className={`${styles.field} ${className}`}>{label}<Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className={styles.select}><SelectValue /></SelectTrigger><SelectContent className={styles.menu}>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>;
}

export function simplePayment(statement: StatementView): SimplePaymentDraft {
  return { amount: outstanding(statement.net, statement.paidAmount), date: payrollToday(), method: "CASH", reference: "" };
}

export function simpleDates(data: PayrollWorkspaceView): SimpleDatesDraft {
  const period = currentWorkPeriod(data.cadence, payrollToday());
  const start = data.simpleEffectiveFrom && data.simpleEffectiveFrom > period.start ? data.simpleEffectiveFrom : period.start;
  const end = period.end < start ? start : period.end;
  return { start, end, paymentDate: end, employeeIds: data.employees.map(employee => employee.id), kind: "REGULAR" };
}

export function simpleCompensation(employee: SimpleEmployee): SimpleCompensationDraft {
  return paySettingsDraft(employee, payrollToday());
}

function EditorForm({ children, onSubmit, onClose, label, disabled = false, footer }: { children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; label: string; disabled?: boolean; footer?: ReactNode }) {
  return <form className={styles.sheetForm} onSubmit={onSubmit}>
    <PayrollScroll label={label + " fields"} className={styles.sheetBody}>{children}</PayrollScroll>
    <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} onClick={onClose}>Cancel</button>{footer ?? <button className={styles.primary} disabled={disabled}>{label}</button>}</CatalogEditorFooter>
  </form>;
}

function PaymentFields({ draft, onChange, maximum }: { draft: SimplePaymentDraft; onChange: (value: SimplePaymentDraft) => void; maximum: string }) {
  return <div className={styles.fields}>
    <label className={styles.field}>Amount paid<input required type="number" min="0.01" max={maximum} step="0.01" inputMode="decimal" value={draft.amount} onChange={event => onChange({ ...draft, amount: event.target.value })} /></label>
    <label className={styles.field}>Actual payment date<input required type="date" max={payrollToday()} value={draft.date} onChange={event => onChange({ ...draft, date: event.target.value })} /></label>
    <SimpleMenu label="Payment method" value={draft.method} onChange={method => onChange({ ...draft, method: method as SimplePaymentDraft["method"] })} options={[{ value: "CASH", label: "Cash" }, { value: "BANK", label: "Bank transfer" }, { value: "WALLET", label: "Wallet" }]} />
    <label className={styles.field}>Payment reference or note<input required maxLength={200} placeholder="For example, cash handed to Ana" value={draft.reference} onChange={event => onChange({ ...draft, reference: event.target.value })} /></label>
  </div>;
}

function DatesSheet({ draft, onChange, data, onClose, onSubmit }: { draft: SimpleDatesDraft; onChange: (value: SimpleDatesDraft) => void; data: PayrollWorkspaceView; onClose: () => void; onSubmit: () => void }) {
  const invalid = draft.start > draft.end || draft.end > draft.paymentDate;
  return <EditorForm label="Review pay" onClose={onClose} disabled={!draft.employeeIds.length || invalid} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <p className={styles.help}>{draft.kind === "OFF_CYCLE" ? "Review extra earnings and corrections separately. Earlier saved payslips stay fixed and regular salary is not counted twice." : "Choose the work dates. Confirmed attendance, recorded pay terms, and captured commissions make up the draft."}</p>
    <div className={`${styles.fields} mt-5`}><SimpleMenu label="Pay type" value={draft.kind} onChange={kind => onChange({ ...draft, kind: kind as SimpleDatesDraft["kind"] })} options={[{ value: "REGULAR", label: "Pay period" }, { value: "OFF_CYCLE", label: "Extra pay / correction" }]} /><label className={styles.field}>From<input required type="date" value={draft.start} max={draft.end} onChange={event => onChange({ ...draft, start: event.target.value })} /></label><label className={styles.field}>Through<input required type="date" min={draft.start} max={draft.paymentDate} value={draft.end} onChange={event => onChange({ ...draft, end: event.target.value })} /></label><label className={styles.field}>Planned payday<input required type="date" min={draft.end} value={draft.paymentDate} onChange={event => onChange({ ...draft, paymentDate: event.target.value })} /></label></div>
    <fieldset className={styles.employeeChoices}><legend>Include employees</legend><PayrollScroll label="Employees to include" className={styles.scrollFields}>{data.employees.map(employee => <label key={employee.id} className={styles.choice}><input type="checkbox" checked={draft.employeeIds.includes(employee.id)} onChange={event => onChange({ ...draft, employeeIds: event.target.checked ? [...draft.employeeIds, employee.id] : draft.employeeIds.filter(id => id !== employee.id) })} />{employee.name}{!employee.agreements.length && <span className={styles.help}> · pay terms needed</span>}</label>)}</PayrollScroll></fieldset>
    {invalid && <p role="alert" className={styles.issues}>The work period must end on or before payday.</p>}
    <p className={styles.help}>This creates draft payslips. Payments are recorded separately after you review each person’s pay.</p>
  </EditorForm>;
}

function SetupSheet({ draft, onChange, data, onClose, onSubmit }: { draft: SimpleSetupDraft; onChange: (value: SimpleSetupDraft) => void; data: PayrollWorkspaceView; onClose: () => void; onSubmit: () => void }) {
  const [reviewed, setReviewed] = useState(false);
  const [payDays, setPayDays] = useState(draft.payDays.join(", "));
  return <EditorForm label="Start simple pay tracking" onClose={onClose} disabled={!reviewed} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <div className={styles.notice}><h2>Pay tracking, without the extra setup.</h2><p>Use pay terms, confirmed work, commissions, and your own additions or deductions. No government IDs are needed to get started.</p></div>
    <div className={styles.fields}><SimpleMenu label="Usual pay schedule" value={draft.cadence} onChange={cadence => onChange({ ...draft, cadence: cadence as SimpleSetupDraft["cadence"] })} options={[{ value: "WEEKLY", label: "Weekly" }, { value: "SEMIMONTHLY", label: "Twice a month" }, { value: "CUSTOM", label: "Custom pay dates" }]} /><label className={styles.field}>Track pay from<input required type="date" value={draft.effectiveFrom} onChange={event => onChange({ ...draft, effectiveFrom: event.target.value })} /></label>{draft.cadence !== "WEEKLY" && <label className={`${styles.field} ${styles.full}`}>Pay days of the month<input required value={payDays} placeholder="15, 30" onChange={event => { setPayDays(event.target.value); onChange({ ...draft, payDays: event.target.value.split(",").map(value => Number(value.trim())).filter(Number.isFinite) }); }} /><span className={styles.help}>Separate dates with commas, for example 15, 30.</span></label>}</div>
    <label className={styles.choice}><input type="checkbox" checked={draft.smsEnabled} onChange={event => onChange({ ...draft, smsEnabled: event.target.checked })} />Send an optional SMS when a payslip is ready. Salary amounts are kept out of the message.</label>
    <div className={styles.notice}><p>Government contributions and tax are not calculated automatically. You can record amounts calculated elsewhere. Employer obligations still apply.</p></div>
    {data.reconciliation && <p className={styles.help}>Previous payslips preserved: {data.reconciliation.migrated} of {data.reconciliation.legacyCount}. {data.reconciliation.unresolved > 0 && `${data.reconciliation.unresolved} still need reconciliation.`}</p>}
    <label className={styles.choice}><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed the starting date and existing pay records. Preserve previous payments and use simple tracking for new pay from this date.</label>
    <p className={styles.help}>Existing payments will be reconciled before this is enabled. The previous payroll writer closes after the switch to prevent paying the same work twice.</p>
  </EditorForm>;
}


function AdjustmentSheet({ draft, onChange, onClose, onSubmit }: { draft: SimpleAdjustmentDraft; onChange: (value: SimpleAdjustmentDraft) => void; onClose: () => void; onSubmit: () => void }) {
  const [kind, setKind] = useState(Number(draft.amount) < 0 ? "DEDUCTION" : "ADDITION");
  const [value, setValue] = useState(draft.amount.replace(/^-/, ""));
  const updateAmount = (next: string, nextKind = kind) => { setValue(next); onChange({ ...draft, amount: nextKind === "DEDUCTION" ? "-" + next : next }); };
  return <EditorForm label="Save adjustment" onClose={onClose} disabled={!value || Number(value) <= 0} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <p className={styles.help}>{draft.originalStatementId ? "Correct a saved payslip with a separately recorded amount. The original payslip stays fixed. Include this correction in extra pay or a later pay period." : "Add an amount you calculated or authorized. Its label, reason, and author stay with the payslip."}</p>
    <div className={`${styles.fields} mt-5`}><SimpleMenu label="Adjustment type" value={kind} onChange={next => { setKind(next); updateAmount(value, next); }} options={[{ value: "ADDITION", label: "Add to earnings" }, { value: "DEDUCTION", label: "Deduct from pay" }]} /><label className={styles.field}>Amount<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={value} onChange={event => updateAmount(event.target.value)} /></label><label className={`${styles.field} ${styles.full}`}>Label<input required maxLength={120} placeholder="For example, transport allowance or SSS calculated externally" value={draft.label} onChange={event => onChange({ ...draft, label: event.target.value })} /></label><label className={styles.field}>Applies on<input required type="date" value={draft.earnedOn} onChange={event => onChange({ ...draft, earnedOn: event.target.value })} /></label><label className={`${styles.field} ${styles.full}`}>Reason<input required minLength={5} maxLength={1000} value={draft.reason} onChange={event => onChange({ ...draft, reason: event.target.value })} /></label></div>
    <div className={styles.notice}>Manual amounts are recorded as entered. They do not certify a government calculation or exemption.</div>
  </EditorForm>;
}

function PayChecksSheet({ checks, data, statementId, onChange }: { checks: SimplePayChecks; data: PayrollWorkspaceView; statementId?: string; onChange: (value: SimpleEditor) => void }) {
  const adjustments = checks.adjustments ?? [];
  const historical = checks.historical;
  return <PayrollScroll label="Pay checks" className={styles.sheetBody}>
    <section className={styles.settingsSection}><h3>Additions and deductions to review</h3><p className={styles.help}>A cancellation, refund, or source correction can propose an amount for review. Approve it, reduce a deduction, defer it, or explicitly waive it. Saved payslips stay fixed.</p>
      {adjustments.map(entry => <div key={entry.id} className={styles.checkItem}><div><strong>{data.employees.find(employee => employee.id === entry.employeeId)?.name ?? "Employee"} · {php(entry.amount)}</strong><p className={styles.help}>{entry.reason}</p><span className={styles.status}>{entry.disposition === "PENDING" ? "Needs review" : entry.disposition === "DEFERRED" ? "Deferred" : "Approved"}</span></div><button type="button" className={styles.secondary} onClick={() => onChange({ kind: "recovery", statementId, draft: { adjustmentId: entry.id, employeeId: entry.employeeId, expectedRevision: entry.revision, reason: "", reviewedAmount: entry.amount, proposedAmount: entry.amount, disposition: "APPROVED" } })}>Review amount</button></div>)}
      {!adjustments.length && <p className={styles.help}>No unconsumed adjustments to review.</p>}
    </section>
    <section className={styles.settingsSection}><h3>Commission sources to confirm{historical?.count ? " · " + historical.count : ""}</h3><p className={styles.help}>Confirm the rate, booked base, and actual customer-payment date from evidence. Current employee rates cannot prove what was agreed for earlier work.</p>
      {(historical?.records ?? []).map(entry => <div key={entry.id} className={styles.checkItem}><div><strong>{entry.employeeName} · service #{entry.id}</strong><p className={styles.help}>Work date: {entry.earnedOn ?? "needs correction"}. Recorded base: {php(entry.recordedBase)}.</p><p className={styles.help}>{entry.paid ? "Verify the actual date the customer paid in full." : "Commission stays unavailable until the customer pays in full."}</p></div><button type="button" className={styles.secondary} disabled={!entry.earnedOn} onClick={() => onChange({ kind: "commission", statementId, draft: { serviceId: entry.id, employeeId: entry.employeeId, employeeName: entry.employeeName, expectedRevision: entry.revision, rate: "", base: entry.recordedBase, payableOn: "", evidence: "", paid: entry.paid, earnedOn: entry.earnedOn } })}>Confirm commission</button></div>)}
      {!historical?.count && <p className={styles.help}>No uncaptured commission sources to confirm.</p>}
      {(historical?.count ?? 0) > (historical?.records?.length ?? 0) && <p className={styles.help}>The next batch appears as these sources are confirmed.</p>}
    </section>
  </PayrollScroll>;
}

function RecoverySheet({ editor, entry, onChange, onClose, onSubmit }: { editor: Extract<SimpleEditor, { kind: "recovery" }>; entry: SimplePayChecks["adjustments"][number] | undefined; onChange: (value: SimpleEditor) => void; onClose: () => void; onSubmit: () => void }) {
  const draft = editor.draft;
  const deduction = decimal(draft.proposedAmount).isNegative();
  let validAmount = false; let reduced = false;
  try { const value = decimal(draft.reviewedAmount); validAmount = /^-?\d+(\.\d{1,2})?$/.test(draft.reviewedAmount) && !value.isZero() && (!deduction || value.isNegative() && value.abs().lte(decimal(draft.proposedAmount).abs())); reduced = !decimal(draft.proposedAmount).eq(value); } catch { /* Keep invalid amounts editable. */ }
  const label = draft.disposition === "DEFERRED" ? "Defer amount" : draft.disposition === "WAIVED" ? "Waive amount" : reduced ? "Approve reduced deduction" : "Approve amount";
  return <EditorForm label={label} onClose={onClose} disabled={draft.reason.trim().length < 5 || draft.disposition === "APPROVED" && !validAmount} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    {entry && <div className={styles.notice}><strong>Proposed amount · {php(entry.amount)}</strong><p>{entry.reason}</p></div>}
    <p className={styles.help}>Review the source and authorization before deciding. A deduction that exceeds available pay must be reduced, deferred, or waived before saving that payslip.</p>
    <div className={`${styles.fields} mt-5`}><SimpleMenu label="Decision" value={draft.disposition} onChange={disposition => onChange({ ...editor, draft: { ...draft, disposition: disposition as SimpleRecoveryDraft["disposition"] } })} options={[{ value: "APPROVED", label: "Approve amount" }, { value: "DEFERRED", label: "Defer this amount" }, { value: "WAIVED", label: "Waive this amount" }]} />
      {deduction && draft.disposition === "APPROVED" && <label className={styles.field}>Deduction to approve (negative amount)<input aria-label="Deduction to approve (negative amount)" aria-describedby="recovery-deduction-help" inputMode="decimal" value={draft.reviewedAmount} onChange={event => onChange({ ...editor, draft: { ...draft, reviewedAmount: event.target.value } })} /><span id="recovery-deduction-help" className={styles.help}>Use a smaller negative amount to reduce it. Zero requires an explicit waiver. The proposed amount remains in the evidence.</span></label>}
      <label className={`${styles.field} ${styles.full}`}>Decision reason and authorization<input required minLength={5} maxLength={1000} value={draft.reason} onChange={event => onChange({ ...editor, draft: { ...draft, reason: event.target.value } })} /></label>
    </div>
    <p className={styles.help}>A confirmed decision refreshes affected draft payslips. Earlier saved payslips are unchanged.</p>
  </EditorForm>;
}

function CommissionSheet({ editor, entry, onChange, onClose, onSubmit }: { editor: Extract<SimpleEditor, { kind: "commission" }>; entry: SimplePayChecks["historical"]["records"][number] | undefined; onChange: (value: SimpleEditor) => void; onClose: () => void; onSubmit: () => void }) {
  const draft = editor.draft;
  const paid = entry?.paid ?? draft.paid;
  return <EditorForm label="Confirm captured evidence" onClose={onClose} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <div className={styles.notice}><strong>{draft.employeeName} · service #{draft.serviceId}</strong><p>Historical rates cannot be inferred from current pay terms. Record the agreed rate, captured base, and payment evidence.</p></div>
    <div className={styles.fields}><label className={styles.field}>Confirmed commission percentage<input required type="number" min="0" max="100" step="0.000001" inputMode="decimal" value={draft.rate} onChange={event => onChange({ ...editor, draft: { ...draft, rate: event.target.value } })} /></label><label className={styles.field}>Confirmed commission base<input required type="number" min="0" step="0.01" inputMode="decimal" value={draft.base} onChange={event => onChange({ ...editor, draft: { ...draft, base: event.target.value } })} /></label>{paid && <label className={styles.field}>Customer fully paid on<input required type="date" min={entry?.earnedOn ?? draft.earnedOn ?? undefined} max={payrollToday()} value={draft.payableOn} onChange={event => onChange({ ...editor, draft: { ...draft, payableOn: event.target.value } })} /></label>}<label className={`${styles.field} ${styles.full}`}>Rate and payment evidence<input required minLength={10} maxLength={1000} value={draft.evidence} onChange={event => onChange({ ...editor, draft: { ...draft, evidence: event.target.value } })} /></label></div>
    <p className={styles.help}>{paid ? "Record the actual full-payment date; the planned payday is not evidence of customer payment." : "This commission stays unavailable until full customer payment is confirmed."} A confirmed source refreshes affected draft payslips.</p>
  </EditorForm>;
}

function ReviewSheet({ editor, onChange, statement, onClose, onSubmit, onAdjust, onRefresh, busy }: { editor: Extract<SimpleEditor, { kind: "review" }>; onChange: (value: SimpleEditor) => void; statement: StatementView; onClose: () => void; onSubmit: () => void; onAdjust: () => void; onRefresh: () => void; busy: boolean }) {
  const payment = editor.payment ?? simplePayment(statement);
  const changed = statement.revision !== editor.expectedRevision;
  const invalid = statement.status === "PUBLISHED" || statement.status === "VOID" || statement.issues.length > 0 || decimal(statement.net).lt(0) || changed;
  return <EditorForm label={editor.recordPayment ? "Save payslip & record payment" : "Save payslip"} onClose={onClose} disabled={busy || invalid || !editor.reviewed} onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <StatementDetails statement={statement} />
    {changed && <p role="alert" className={`${styles.notice} ${styles.error}`}>This payslip changed after you opened it. Close and reopen the review to check the latest amounts.</p>}
    {!!statement.issues.length && <div className={`${styles.notice} ${styles.error}`}><strong>Check these before saving</strong><ul className={styles.issues}>{statement.issues.map((issue, index) => <li key={issue.code + index}>{issue.message}</li>)}</ul><Link className={styles.textButton} href="/redesign/owner-dashboard/team/attendance">Review attendance</Link></div>}
    <div className={styles.reviewActions}><button type="button" className={styles.secondary} disabled={busy || statement.status === "PUBLISHED"} onClick={onAdjust}>Add addition or deduction</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => onChange({ kind: "checks", statementId: statement.id })}>Resolve pay checks</button><button type="button" className={styles.secondary} disabled={busy || statement.status === "PUBLISHED"} onClick={onRefresh}>Refresh draft</button></div>
    <label className={styles.choice}><input type="checkbox" checked={Boolean(editor.recordPayment)} disabled={invalid || decimal(statement.net).lte(0)} onChange={event => onChange({ ...editor, recordPayment: event.target.checked, payment })} />Also record money already paid</label>
    {editor.recordPayment && <><p className={styles.help}>This records a payment made outside ServiceFlow. It does not send money.</p><PaymentFields draft={payment} maximum={outstanding(statement.net, statement.paidAmount)} onChange={next => onChange({ ...editor, payment: next })} /></>}
    <label className={styles.choice}><input type="checkbox" checked={Boolean(editor.reviewed)} disabled={invalid} onChange={event => onChange({ ...editor, reviewed: event.target.checked })} />I reviewed these earnings and deductions{editor.recordPayment ? " and confirm the payment was made" : ""}.</label>
    <p className={styles.help}>Saving fixes these amounts and makes the payslip ready to pay. Later corrections are recorded separately.</p>
  </EditorForm>;
}

export function SimplePayrollEditor({ editor, open, data, checks, busy, onChange, onClose, onSubmit, onGovernmentSettings, onRefreshStatement }: { editor: SimpleEditor; open: boolean; data: PayrollWorkspaceView; checks: SimplePayChecks; busy: boolean; onChange: (value: SimpleEditor) => void; onClose: () => void; onSubmit: () => void; onGovernmentSettings: () => void; onRefreshStatement: (statement: StatementView) => void }) {
  const statement = "statementId" in editor ? data.runs.flatMap(run => run.statements).find(entry => entry.id === editor.statementId) : null;
  const employeeId = "draft" in editor && "employeeId" in editor.draft ? editor.draft.employeeId : statement?.employeeId;
  const employee = data.employees.find(entry => entry.id === employeeId);
  const titles = { dates: "Choose dates", setup: "Start simple pay tracking", compensation: "Pay terms", review: "Review pay", payment: "Record payment", adjustment: "Add an adjustment", settings: "Payroll settings", checks: "Pay checks", recovery: "Review an amount", commission: "Confirm commission" };
  const descriptions = { dates: "A work period, the people, and their payday.", setup: "Start with earnings, deductions, and payments.", compensation: employee ? employee.name + " · how they earn" : "Set how this person earns.", review: statement ? statement.employeeName + " · confirm the amounts before saving." : "Review a draft payslip.", payment: "Record money already paid outside ServiceFlow.", adjustment: employee ? employee.name + " · a named addition or deduction" : "Record a manual addition or deduction.", settings: "Your everyday setup and optional government calculations.", checks: "Review source changes before saving pay.", recovery: "Approve, reduce, defer, or waive an unconsumed adjustment.", commission: "Capture the agreed rate and customer-payment evidence." };
  const focusKey = simpleEditorFocusKey(editor);
  return <CatalogEditorOverlay open={open} onOpenChange={next => { if (!next) onClose(); }} title={editor.kind === "adjustment" && editor.draft.originalStatementId ? "Add a correction" : titles[editor.kind]} description={descriptions[editor.kind]} restoreFocusKey={focusKey} className={styles.editor}>
    <div className={styles.sheetForm} inert={busy}>
    {editor.kind === "dates" && <DatesSheet draft={editor.draft} onChange={draft => onChange({ ...editor, draft })} data={data} onClose={onClose} onSubmit={onSubmit} />}
    {editor.kind === "setup" && <SetupSheet draft={editor.draft} onChange={draft => onChange({ ...editor, draft })} data={data} onClose={onClose} onSubmit={onSubmit} />}
    {editor.kind === "adjustment" && <AdjustmentSheet draft={editor.draft} onChange={draft => onChange({ ...editor, draft })} onClose={onClose} onSubmit={onSubmit} />}
    {editor.kind === "checks" && <PayChecksSheet checks={checks} data={data} statementId={editor.statementId} onChange={onChange} />}
    {editor.kind === "recovery" && <RecoverySheet editor={editor} entry={checks.adjustments.find(entry => entry.id === editor.draft.adjustmentId)} onChange={onChange} onClose={onClose} onSubmit={onSubmit} />}
    {editor.kind === "commission" && <CommissionSheet editor={editor} entry={checks.historical?.records?.find(entry => entry.id === editor.draft.serviceId)} onChange={onChange} onClose={onClose} onSubmit={onSubmit} />}
    {editor.kind === "review" && statement && <ReviewSheet editor={editor} onChange={onChange} statement={statement} onClose={onClose} onSubmit={onSubmit} busy={busy} onRefresh={() => onRefreshStatement(statement)} onAdjust={() => onChange({ kind: "adjustment", statementId: statement.id, draft: { employeeId: statement.employeeId, expectedRevision: employee?.revision ?? 0, label: "", amount: "", reason: "", earnedOn: statement.periodEnd } })} />}
    {editor.kind === "payment" && statement && <EditorForm label="Record payment" onClose={onClose} onSubmit={event => { event.preventDefault(); onSubmit(); }}><div className={styles.amountPreview}><span>{statement.employeeName} · remaining</span><strong>{php(outstanding(statement.net, statement.paidAmount))}</strong></div><PaymentFields draft={editor.draft} maximum={outstanding(statement.net, statement.paidAmount)} onChange={draft => onChange({ ...editor, draft })} /><p className={styles.help}>The payslip stays unchanged. Only this confirmed payment updates the balance.</p></EditorForm>}
    {(editor.kind === "review" || editor.kind === "payment") && !statement && <div className={styles.sheetBody}><p role="alert">This payslip is no longer available. Close this sheet and refresh payroll.</p></div>}
    {editor.kind === "settings" && <PayrollScroll label="Payroll settings" className={styles.sheetBody}><section className={styles.settingsSection}><h3>Simple pay tracking</h3><p className={styles.help}>Earnings, manual adjustments, payslips, and recorded payments. Government IDs and automatic statutory calculations are not required for this feature.</p><p className={styles.help}>Schedule: {data.cadence === "WEEKLY" ? "Weekly" : "Pay days " + data.payDays.join(", ")}</p></section><section className={styles.settingsSection}><h3>Pay checks</h3><p className={styles.help}>Resolve proposed recoveries, deductions, and uncaptured commissions here before saving pay.</p><button type="button" className={styles.secondary} onClick={() => onChange({ kind: "checks" })}>Review pay checks</button></section><section className={styles.settingsSection}><h3>People and pay terms</h3><p className={styles.help}>Set an effective rate per day, hour, or month. Add commission only when it applies.</p>{data.employees.map(entry => <div key={entry.id} className={styles.summaryLine}><span className={styles.help}>{entry.name}</span><button type="button" className={styles.textButton} onClick={() => onChange({ kind: "compensation", draft: simpleCompensation(entry) })}>Edit pay terms</button></div>)}</section><section className={styles.settingsSection}><h3>Government calculations</h3><p className={styles.help}>Optional automatic contributions, withholding, specialist benefits, and agency exports. Enabling them requires reviewed setup and opening balances from earlier pay.</p><button type="button" className={styles.secondary} onClick={onGovernmentSettings}>Review government setup</button></section><section className={styles.settingsSection}><p className={styles.help}>ServiceFlow features are optional. Applicable employer and employee obligations remain separate.</p></section></PayrollScroll>}
    </div>
  </CatalogEditorOverlay>;
}

export function simpleStatus(statement: StatementView) {
  if (statement.status === "VOID") return "Voided";
  if (statement.status !== "PUBLISHED") return "Draft";
  if (decimal(statement.net).eq(0)) return "No payment due";
  if (statement.paymentState === "PAID") return "Paid";
  if (decimal(statement.paidAmount).gt(0)) return "Partly paid";
  return "Ready to pay";
}


