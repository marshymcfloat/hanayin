"use client";

import { useRef, useState, useEffect, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPayrollWorkspaceAction, preparePayrollAction, prepareNextPayrollEmployeeAction, refreshPayrollAction, approvePayrollAction, publishPayrollAction, recordPayrollPaymentAction, voidPayrollAction, saveCompensationAction, savePayrollProfileAction, savePayrollSettingsAction, activatePayrollAction, reconcileLegacyPayrollAction, createPayrollAdjustmentAction, decidePayrollAdjustmentAction, previewPayrollPaymentDateAction, reconcilePayrollPaymentDateAction } from "@/features/payroll/actions/lifecycle";
import { exportPayrollRunAction } from "@/features/payroll/actions/exports";
import type { PayrollCommandResult, StatementView, PayrollWorkspaceView } from "@/features/payroll/v2/contracts";
import { outstanding, amount, decimal, sum } from "@/features/payroll/money";
import { currentWorkPeriod, taxPeriodKey } from "@/features/payroll/v2/period";
import { useCommandKeys } from "./useCommandKeys";
import { BulkPayroll } from "./BulkPayroll";
import { BenefitsReview } from "./BenefitsReview";
import { GovernmentExports } from "./GovernmentExports";
import { LeaveAwardsReview } from "@/components/payroll/LeaveAwardsReview";
import { ServiceChargeReview } from "@/components/payroll/ServiceChargeReview";
import { LeaveReview } from "./LeaveReview";
import { CommissionConfirmation } from "./CommissionConfirmation";
import { PayrollScroll } from "./PayrollScroll";
import { StatementDetails, php } from "./StatementDetails";
import { AttendanceReview } from "./WorkforceReview";
import { AttendanceCorrectionInbox } from "./AttendanceCorrectionInbox";
import styles from "./payroll.module.css";
import { OwnerPayrollLoading } from "@/components/dashboard/design-study/OwnerPayrollLoading";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import { OwnerPayrollHeader } from "@/components/dashboard/design-study/OwnerPayrollHeader";
import catalog from "@/components/dashboard/design-study/owner-services.module.css";
import { EmployeePaySettingsButton } from "@/components/payroll/EmployeePaySettings";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

type WorkspaceResult = Extract<Awaited<ReturnType<typeof getPayrollWorkspaceAction>>, { success: true }>;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
function Menu({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: { value: string; label: string }[] }) {
  return <label className={styles.label}>{label}<Select value={value} onValueChange={onChange}><SelectTrigger className={styles.select} aria-label={label}><SelectValue placeholder="Choose…" /></SelectTrigger><SelectContent className={styles.menu}>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>;
}
export function PayrollWorkspace({ businessSlug, userId, redesign = false, fontClassName = "", initialStage = "prepare", onBack, onDenied, onChanged }: { businessSlug: string; userId: string; redesign?: boolean; fontClassName?: string; initialStage?: string; onBack?: () => void; onDenied?: () => void; onChanged?: () => void }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [stage, setStage] = useState(initialStage);
  const [runId, setRunId] = useState("");
  const [employeeId, setEmployeeId] = useState("all");
  useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const requestedStage = params.get("stage") ?? initialStage;
      setStage(["prepare", "issues", "review", "payments", "setup"].includes(requestedStage) ? requestedStage : "prepare");
      setRunId(params.get("run") ?? "");
      setEmployeeId(/^\d+$/.test(params.get("employee") ?? "") ? params.get("employee")! : "all");
      const requestedPage = Number(params.get("page") ?? 1);
      setPage(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
    }
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialStage]);
  function navigate(changes: { stage?: string; run?: string; employee?: string; page?: number }) {
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(changes)) {
      if (value === "" || value === "all" || (name === "page" && value === 1)) url.searchParams.delete(name);
      else url.searchParams.set(name, String(value));
    }
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    if (changes.stage !== undefined) setStage(changes.stage);
    if (changes.run !== undefined) setRunId(changes.run);
    if (changes.employee !== undefined) setEmployeeId(changes.employee);
    if (changes.page !== undefined) setPage(changes.page);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const command = useCommandKeys();
  const stop = useRef(false);
  const [progress, setProgress] = useState("");
  const queryKey = ["payroll-lifecycle", businessSlug, userId, page];
  const query = useQuery({ queryKey, queryFn: async () => {
    const result = await getPayrollWorkspaceAction(page);
    if (!result.success) throw new Error(result.error);
    return result;
  }, gcTime: 0, staleTime: 0, refetchInterval: busy ? false : 30000 });
  useEffect(() => {
    if (query.error?.message.includes("access has changed") || query.error?.message === "Forbidden") onDenied?.();
  }, [query.error, onDenied]);
  async function mutate(command: () => Promise<PayrollCommandResult>, message: string) {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await command();
      if (!result.success) { setError(result.error); toast.error(result.error); if (result.code === "FORBIDDEN") onDenied?.(); await client.invalidateQueries({ queryKey: ["payroll-lifecycle", businessSlug, userId] }); return null; }
      toast.success(message);
      onChanged?.();
      await client.invalidateQueries({ queryKey: ["payroll-lifecycle", businessSlug, userId] });
      return result;
    } catch { const message = "The request could not be confirmed. Retry with the same request key."; setError(message); toast.error(message); return null; }
    finally { lock.current = false; setBusy(false); }
  }
  const Workspace = redesign ? "section" : "main";
  const workspaceClass = `${styles.workspace} ${redesign ? `${styles.redesign} ${catalog.page} ${catalog.content}` : styles.withSidebar} ${fontClassName}`;
  if (!query.data && query.isPending && redesign) return <OwnerPayrollLoading />;
  if (!query.data) return <Workspace className={workspaceClass} aria-busy={query.isPending}>{redesign ? <OwnerPayrollHeader onBack={onBack} /> : <h1>Payroll</h1>}<p role={query.isError ? "alert" : "status"}>{query.isError ? query.error.message : "Loading payroll…"}</p><button className={styles.secondary} onClick={() => void query.refetch()}>Refresh</button></Workspace>;
  const result = query.data;
  const data = result.data;
  const run = (runId ? data.runs.find(entry => entry.id === runId) : data.runs[0]);
  const runStatements = run?.statements.filter(entry => entry.status !== "VOID") ?? [];
  const statements = runStatements.filter(entry => employeeId === "all" || String(entry.employeeId) === employeeId);
  const contextEmployees = data.employees.filter(entry => employeeId === "all" || String(entry.id) === employeeId);
  const reviewed = statements.filter(entry => entry.status === "APPROVED" || entry.status === "PUBLISHED").length;
  const remaining = amount(sum(statements.filter(entry => entry.status === "PUBLISHED").map(entry => outstanding(entry.net, entry.paidAmount))));
  const action = (statement: StatementView) => command("REFRESH", { statementId: statement.id, expectedRevision: statement.revision });
  async function continuePreparation(id: string) {
    stop.current = false;
    await mutate(async () => {
      while (!stop.current) {
        const current = await getPayrollWorkspaceAction(page);
        if (!current.success) return { success: false, code: "UNAVAILABLE", error: current.error };
        const entry = current.data.runs.find(item => item.id === id);
        if (!entry) return { success: false, code: "NOT_FOUND", error: "Run not found. Refresh the run list." };
        setProgress(entry.preparedCount + " of " + entry.employeeCount + " employees prepared");
        if (entry.preparedCount >= entry.employeeCount) return { success: true, id: entry.id, revision: entry.revision };
        const saved = await prepareNextPayrollEmployeeAction(command("PREPARE_NEXT", { expectedRevision: entry.revision, runId: entry.id }));
        if (!saved.success) return saved;
      }
      return { success: true, id };
    }, "Preparation checkpoint saved");
  }
  async function download(format: "CSV" | "XLSX") {
    if (!run) return;
    try {
    const result = await exportPayrollRunAction({ runId: run.id, format });
    if (!result.success) { setError(result.error); toast.error(result.error); return; }
    const bytes = result.file.encoding === "base64" ? Uint8Array.from(atob(result.file.content), value => value.charCodeAt(0)) : result.file.content;
    const url = URL.createObjectURL(new Blob([bytes], { type: result.file.mime }));
    const link = document.createElement("a"); link.href = url; link.download = result.file.filename; link.click(); URL.revokeObjectURL(url);
    toast.success("Payroll export downloaded.");
    } catch { toast.error("Payroll export could not be downloaded. Please try again."); }
  }
  return <Workspace className={workspaceClass} aria-busy={busy}>
    {redesign ? <OwnerPayrollHeader onBack={onBack} description="Prepare pay, review the evidence, publish payslips, and record payments." actions={<div className={catalog.refresh}><DashboardRefreshButton pending={busy} refreshing={query.isFetching} onRefresh={() => void refreshTeamQueries(client, ["payroll-lifecycle", businessSlug, userId])} /></div>} /> : <header className={styles.header}><div><h1>Payroll</h1><p>Prepare pay, review the evidence, publish payslips, and record payments.</p></div><DashboardRefreshButton pending={busy} refreshing={query.isFetching} onRefresh={() => void refreshTeamQueries(client, ["payroll-lifecycle", businessSlug, userId])} /></header>}
    {data.mode !== "ACTIVE" && <div className={styles.notice}>{data.mode === "LEGACY" ? "Complete setup, then compare payroll with your existing records." : "Shadow comparison: calculations can be reviewed, but payslips and payments cannot be issued."}{!data.ruleReady && <p>Statutory rules are awaiting independent verification.</p>}</div>}
    {(error || query.isError) && <p role="alert" className={styles.notice + " " + styles.error}>{error || "Refresh failed. Saved data is shown; refresh before approving."}</p>}
    {progress && <p role="status" aria-live="polite">{progress}{busy && <button className={styles.secondary} onClick={() => { stop.current = true; }}>Pause after this employee</button>}</p>}
    <AnimatedFilterGroup className={styles.steps + " " + styles.noPrint} label="Payroll stages">{[["prepare", "1 · Choose period"], ["issues", "2 · Resolve issues"], ["review", "3 · Review and publish"], ["payments", "4 · Record payments"], ["setup", "Payroll setup"]].map(([value, label]) => <button key={value} aria-pressed={stage === value} onClick={() => navigate({ stage: value })}>{label}</button>)}</AnimatedFilterGroup>
    {runId && !run && stage !== "setup" && <p role="status" className={styles.notice}>The selected run is unavailable on this page. Choose another run or return to its history page.</p>}
    <div className={styles.toolbar + " " + styles.noPrint}><Menu label="Employee context" value={employeeId} onChange={value => navigate({ employee: value })} options={[{ value: "all", label: "All employees" }, ...data.employees.map(entry => ({ value: String(entry.id), label: entry.name }))]} /></div>
    {stage === "setup" ? <PayrollSetup result={result} busy={busy} mutate={mutate} selectedEmployee={employeeId} onSelectEmployee={value => navigate({ employee: value })} paySettingsContext={redesign ? { businessSlug, userId, fontClassName, onSaved: () => { onChanged?.(); void query.refetch(); } } : undefined} /> : <>
      {run && <div className={styles.toolbar}><span className={styles.help}>{run.preparedCount} of {run.employeeCount} employees prepared</span>{run.preparedCount < run.employeeCount && <button className={styles.primary} disabled={busy} onClick={() => void continuePreparation(run.id)}>Continue preparation</button>}<button className={styles.secondary} disabled={busy || !statements.some(entry => entry.status === "PUBLISHED")} onClick={() => void download("CSV")}>Export CSV</button><button className={styles.secondary} disabled={busy || !statements.some(entry => entry.status === "PUBLISHED")} onClick={() => void download("XLSX")}>Export Excel</button></div>}
      {stage === "prepare" && <PreparePeriod data={data} busy={busy} onPrepare={async input => { const saved = await mutate(() => preparePayrollAction(input), "Payroll period created"); if (saved) { navigate({ run: saved.id, stage: "issues" }); void continuePreparation(saved.id); } }} />}
      <section className={styles.panel}><h2>Payroll runs</h2><div className={styles.runs}>{data.runs.map(entry => <button key={entry.id} className={styles.secondary + (entry.id === run?.id ? " " + styles.selected : "")} aria-pressed={entry.id === run?.id} onClick={() => navigate({ run: entry.id })}>{entry.start} – {entry.end}<span className={styles.badge}>{entry.kind}</span></button>)}</div>{!data.runs.length && <p className={styles.help}>Choose a period to prepare your first run.</p>}<div className={styles.toolbar + " mt-4"}><button className={styles.secondary} disabled={page === 1 || busy} onClick={() => navigate({ page: page - 1, run: "" })}>Previous runs</button><button className={styles.secondary} disabled={!data.hasMore || busy} onClick={() => navigate({ page: page + 1, run: "" })}>More runs</button></div></section>
      {run && <><div className={styles.metrics}>{[["Employees", String(statements.length)], ["Reviewed", String(reviewed)], ["Planned payment", run.paymentDate], ["Remaining payments", php(String(remaining))]].map(([label, value]) => <div key={label} className={styles.metric}><span>{label}</span><strong>{value}</strong></div>)}</div>
        {stage === "issues" && <section className={styles.panel}><h2>Resolve exceptions</h2>{statements.map(statement => <div key={statement.id}>{statement.issues.map((issue, index) => <div key={issue.code + index} className={styles.issue}><p><strong>{statement.employeeName}</strong> · {issue.message}</p></div>)}<button className={styles.secondary} disabled={busy || statement.status === "PUBLISHED"} onClick={() => void mutate(() => refreshPayrollAction(action(statement)), "Statement recalculated")}>Recalculate {statement.employeeName}</button></div>)}{statements.every(entry => !entry.issues.length) && <p>No unresolved exceptions. Review the breakdown before publication.</p>}{data.canManageWorkforce ? <><AttendanceReview key={employeeId} employees={contextEmployees} busy={busy} onChanged={() => void query.refetch()} /><AttendanceCorrectionInbox businessSlug={businessSlug} /><LeaveReview businessSlug={businessSlug} onChanged={() => void query.refetch()} /></> : <p className={styles.help}>An owner with workforce access must resolve attendance and leave exceptions.</p>}<CommissionConfirmation historical={result.historical} busy={busy} mutate={mutate} /><AdjustmentReview key={"adjustments:" + employeeId} result={result} busy={busy} mutate={mutate} selectedEmployee={employeeId} /><BenefitsReview key={"benefits:" + employeeId} employees={contextEmployees} busy={busy} mutate={mutate} /><LeaveAwardsReview busy={busy} onChanged={() => void query.refetch()} /><ServiceChargeReview busy={busy} onChanged={() => void query.refetch()} /></section>}
        {(stage === "review" || stage === "payments") && <><BulkPayroll statements={statements} stage={stage} active={data.mode === "ACTIVE"} busy={busy} mutate={mutate} /><GovernmentExports /><section className={styles.details}>{statements.map(statement => <details key={statement.id}><summary><span>{statement.employeeName} <span className={styles.badge}>{statement.status} · {statement.paymentState}</span></span><strong>{php(statement.net)}</strong></summary><ReviewChanges statement={statement} /><StatementDetails statement={statement} />{stage === "review" ? <StatementReview statement={statement} active={data.mode === "ACTIVE"} busy={busy} mutate={mutate} /> : <PaymentForm key={statement.revision} statement={statement} busy={busy} mutate={mutate} />}</details>)}</section></>}
      </>}
    </>}
  </Workspace>;
}
type Mutate = (command: () => Promise<PayrollCommandResult>, message: string) => Promise<{ success: true; id: string; revision?: number } | null>;
function PreparePeriod({ data, busy, onPrepare }: { data: PayrollWorkspaceView; busy: boolean; onPrepare: (input: unknown) => Promise<void> }) {
  const [start, setStart] = useState(currentWorkPeriod(data.cadence, today()).start); const [end, setEnd] = useState(today()); const [paymentDate, setPaymentDate] = useState(today());
  const [kind, setKind] = useState("REGULAR"); const [employees, setEmployees] = useState(data.employees.map(entry => entry.id));
  const command = useCommandKeys();
  function submit(event: FormEvent) { event.preventDefault(); void onPrepare(command("PREPARE", { expectedRevision: data.revision, start, end, paymentDate, kind, employeeIds: employees })); }
  return <form className={styles.panel} onSubmit={submit}><h2>Choose a payroll period</h2><div className={styles.fields}><label>Work starts<input required type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Work ends<input required type="date" value={end} max={today()} onChange={event => setEnd(event.target.value)} /></label><label>Planned payment date<input required type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} /></label><Menu label="Run type" value={kind} onChange={setKind} options={[{ value: "REGULAR", label: "Regular payroll" }, { value: "OFF_CYCLE", label: "Off-cycle / adjustment" }, { value: "YEAR_END", label: "Year-end tax reconciliation" }, { value: "FINAL_PAY", label: "Final pay" }]} /></div><p className={styles.help}>Include confirmed work through the cutoff. Older commissions become payable here only after full customer payment.</p><PayrollScroll label="Employees included" className={styles.checkList}>{data.employees.map(entry => <label className={styles.choice} key={entry.id}><input type="checkbox" checked={employees.includes(entry.id)} onChange={event => setEmployees(event.target.checked ? [...employees, entry.id] : employees.filter(id => id !== entry.id))} />{entry.name}</label>)}</PayrollScroll><button className={styles.primary + " mt-4"} disabled={busy || !employees.length || data.mode === "LEGACY"}>Prepare payroll</button></form>;
}
function StatementReview({ statement, active, busy, mutate }: { statement: StatementView; active: boolean; busy: boolean; mutate: Mutate }) {
  const [checkedRevision, setCheckedRevision] = useState<number | null>(null);
  const checked = checkedRevision === statement.revision;
  const keyed = useCommandKeys();
  const command = (operation: string) => keyed(operation, { statementId: statement.id, expectedRevision: statement.revision });
  return <div className={styles.toolbar + " mt-4"}>{statement.status === "DRAFT" && <><label className={styles.choice}><input type="checkbox" checked={checked} onChange={event => setCheckedRevision(event.target.checked ? statement.revision : null)} />I reviewed the amounts and their sources.</label><button className={styles.primary} disabled={busy || !active || !checked || Boolean(statement.issues.length)} onClick={() => void mutate(() => approvePayrollAction(command("APPROVE")), "Statement approved")}>Approve</button></>}{statement.status === "APPROVED" && <button className={styles.primary} disabled={busy || !active} onClick={() => void mutate(() => publishPayrollAction(command("PUBLISH")), "Payslip published")}>Publish payslip</button>}{statement.status !== "PUBLISHED" && <><button className={styles.secondary} disabled={busy} onClick={() => void mutate(() => refreshPayrollAction(command("REFRESH")), "Updated amounts are ready for review")}>Refresh calculation</button><button className={styles.secondary} disabled={busy} onClick={() => void mutate(() => voidPayrollAction(command("VOID")), "Draft voided")}>Void draft</button></>}</div>;
}
function PaymentForm({ statement, busy, mutate }: { statement: StatementView; busy: boolean; mutate: Mutate }) {
  const [value, setValue] = useState(outstanding(statement.net, statement.paidAmount));
  const [date, setDate] = useState(statement.paymentDate); const [method, setMethod] = useState("BANK"); const [reference, setReference] = useState("");
  const command = useCommandKeys();
  const [preview, setPreview] = useState<Extract<Awaited<ReturnType<typeof previewPayrollPaymentDateAction>>, { success: true }>["data"] | null>(null);
  const [reconciliation, setReconciliation] = useState<{ id: string; identity: string } | null>(null);
  const [reason, setReason] = useState("");
  const [legacyTaxDelta, setLegacyTaxDelta] = useState("");
  const [message, setMessage] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const paymentIdentity = statement.revision + ":" + date + ":" + value;
  if (statement.status !== "PUBLISHED") return <p className={styles.help}>Publish this statement before recording a payment.</p>;
  if (statement.paymentState === "PAID") return <p className={styles.help}>Fully settled.</p>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await mutate(() => recordPayrollPaymentAction(command("PAYMENT", { expectedRevision: statement.revision, statementId: statement.id, amount: value, date, method, reference, reconciliationId: reconciliation?.identity === paymentIdentity ? reconciliation.id : undefined })), "Payment recorded");
    if (result) setReference("");
  }
  async function previewDate() {
    setPreviewBusy(true); setMessage("");
    try { const result = await previewPayrollPaymentDateAction({ statementId: statement.id, amount: value, date }); if (result.success) setPreview(result.data); else setMessage(result.error); }
    catch { setMessage("Payment-date review could not be loaded. Try again."); } finally { setPreviewBusy(false); }
  }
  async function approveDate() {
    if (!preview) return;
    const result = await mutate(() => reconcilePayrollPaymentDateAction(command("RECONCILE", { statementId: statement.id, expectedRevision: statement.revision, amount: value, date, expectedHash: preview.expectedHash, reason, legacyTaxDelta: preview.requiresIndependentTaxReview ? legacyTaxDelta : undefined })), "Payment-date reconciliation approved");
    if (result) setReconciliation({ id: result.id, identity: paymentIdentity });
  }
  return <form onSubmit={submit} className={styles.panel}><h3>Record an external payment</h3><p className={styles.help}>Remaining: {php(outstanding(statement.net, statement.paidAmount))}. Record money already paid outside ServiceFlow.</p><div className={styles.fields}><label>Amount<input required inputMode="decimal" value={value} onChange={event => { setValue(event.target.value); setPreview(null); }} /></label><label>Payment date<input required type="date" max={today()} value={date} onChange={event => { setDate(event.target.value); setPreview(null); }} /></label><Menu label="Payment method" value={method} onChange={setMethod} options={[{ value: "BANK", label: "Bank" }, { value: "CASH", label: "Cash" }, { value: "WALLET", label: "Wallet" }]} /><label>Payment reference<input required maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></label></div>
    <section className={styles.notice}><p>Review withholding for this installment, including changes in its amount or actual payment date.</p><button type="button" className={styles.secondary} disabled={busy || previewBusy} onClick={() => void previewDate()}>Review payment date</button>{preview && <><p>Original withholding portion: {preview.originalTaxPortion === null ? "Unavailable in the historical record" : php(preview.originalTaxPortion)} · Revised withholding: {preview.requiredTax === null ? "Independent review required" : php(preview.requiredTax)} · Adjustment: {preview.taxDelta === null ? "Enter the verified difference below" : php(preview.taxDelta)}</p><p className={styles.help}>A difference creates a separate approved adjustment. The original payslip stays fixed.</p>{preview.requiresIndependentTaxReview && <label className={styles.label}>Independently verified withholding difference<input value={legacyTaxDelta} onChange={event => setLegacyTaxDelta(event.target.value)} inputMode="decimal" placeholder="Explicit zero if none; negative for a refund" /></label>}<label className={styles.label}>Reconciliation authorization<input value={reason} onChange={event => setReason(event.target.value)} minLength={10} /></label><button type="button" className={styles.secondary} disabled={busy || reason.trim().length < 10} onClick={() => void approveDate()}>Approve date reconciliation</button>{reconciliation?.identity === paymentIdentity && <p>Reconciliation approved.</p>}</>}</section>
    {message && <p role="alert">{message}</p>}<button className={styles.primary + " mt-4"} disabled={busy || previewBusy}>Record payment</button></form>;
}
function PayrollSetup({ result, busy, mutate, selectedEmployee, onSelectEmployee, paySettingsContext }: { result: WorkspaceResult; busy: boolean; mutate: Mutate; selectedEmployee: string; onSelectEmployee: (value: string) => void; paySettingsContext?: { businessSlug: string; userId: string; fontClassName: string; onSaved: () => void } }) {
  const data = result.data;
  const employeeId = selectedEmployee === "all" ? String(data.employees[0]?.id ?? "") : selectedEmployee;
  const [cadence, setCadence] = useState(data.cadence);
  const [payDays, setPayDays] = useState(data.payDays.join(", "));
  const [openingReviewed, setOpeningReviewed] = useState(false);
  const command = useCommandKeys();
  const [packageId, setPackageId] = useState(data.rulePackageId ?? result.packages[0]?.id ?? "");
  const [sms, setSms] = useState(data.smsEnabled);
  const [governmentEffectiveFrom, setGovernmentEffectiveFrom] = useState(today());
  const [reviewedOpening, setReviewedOpening] = useState(false);
  const enablingGovernment = data.calculationPolicy === "SIMPLE";
  const employee = data.employees.find(entry => String(entry.id) === employeeId);
  return <>
    <form className={styles.panel} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const identifiers = Object.fromEntries(["tin", "sss", "philhealth", "pagibig"].map(field => [field, String(form.get("employer-" + field) ?? "")])); void mutate(() => savePayrollSettingsAction(command("SETTINGS", { expectedRevision: data.revision, cadence, payDays: cadence === "WEEKLY" ? [] : payDays.split(",").map(value => Number(value.trim())), smsEnabled: sms, rulePackageId: packageId, employerIdentifiers: Object.values(identifiers).some(Boolean) ? identifiers : undefined, ...(enablingGovernment ? { effectiveFrom: governmentEffectiveFrom, reviewedOpening } : {}) })), "Payroll settings saved"); }}>
      <h2>Business payroll setup</h2><div className={styles.fields}><Menu label="Payment schedule" value={cadence} onChange={setCadence} options={[{ value: "WEEKLY", label: "Weekly" }, { value: "SEMIMONTHLY", label: "Twice monthly" }, { value: "CUSTOM", label: "Custom valid cutoffs" }]} /><label>Payment days of month<input value={payDays} onChange={event => setPayDays(event.target.value)} disabled={cadence === "WEEKLY"} placeholder="15, 30" /></label><Menu label="Statutory rule package" value={packageId} onChange={setPackageId} options={result.packages.map(entry => ({ value: entry.id, label: entry.id + (entry.certified ? "" : " · awaiting verification") }))} /></div>
      <p className={styles.help}>Enter payment days separated by commas. Monthly salary rates still require a valid wage-payment schedule.</p><h3>Employer government identifiers</h3><p className={styles.help}>Leave all four blank to retain existing encrypted identifiers. Enter all applicable identifiers when replacing them.</p><div className={styles.fields}>{["tin", "sss", "philhealth", "pagibig"].map(field => <label key={field}>Employer {field.toUpperCase()}<input name={"employer-" + field} maxLength={30} autoComplete="off" /></label>)}</div>
      {enablingGovernment && <section className={styles.notice} aria-label="Enable government calculations"><h3>Enable government calculations</h3><p>Complete each person’s government profile and review their opening balances first. Include earlier simple-pay earnings, deductions, and payments so they are counted once.</p><label className={styles.label}>Government calculations from<input required type="date" className={styles.input} value={governmentEffectiveFrom} onChange={event => setGovernmentEffectiveFrom(event.target.value)} /></label><label className={styles.choice}><input type="checkbox" checked={reviewedOpening} onChange={event => setReviewedOpening(event.target.checked)} />I reviewed the opening balances for every affected person, including their earlier simple-pay earnings and payments.</label><p className={styles.help}>Earlier payslips keep their original calculation policy. New government calculations use the effective date you choose after the setup passes verification.</p></section>}
      {!result.packages.length && <p className={styles.notice}>An administrator must load the verified Philippine payroll rules before setup can continue.</p>}<label className={styles.choice}><input type="checkbox" checked={sms} onChange={event => setSms(event.target.checked)} />Send an optional SMS when a payslip is published.</label><p className={styles.help}>Employees receive an in-app notification. SMS contains a sign-in link and no salary amount.</p><button className={styles.primary} disabled={busy || !packageId || (enablingGovernment && (!governmentEffectiveFrom || !reviewedOpening))}>Save settings</button>
    </form>
    <section className={styles.panel}><h2>People and compensation</h2><Menu label="Employee to configure" value={employeeId} onChange={onSelectEmployee} options={data.employees.map(entry => ({ value: String(entry.id), label: entry.name }))} />{employee && <><div className={styles.details}>{employee.agreements.map(entry => <p key={entry.id} className={styles.help}>{entry.from} – {entry.to ?? "ongoing"} · {entry.basis} · {php(entry.rate)} · {entry.commissionRate}% commission</p>)}</div>{paySettingsContext ? <><p className={styles.help}>Pay is managed in People → Pay settings. This shortcut opens the same dated record and editor.</p><EmployeePaySettingsButton key={employee.id} employeeId={employee.id} employeeName={employee.name} disabled={busy} {...paySettingsContext} /></> : <CompensationForm key={employee.id} employee={employee} busy={busy} mutate={mutate} />}<ProfileForm key={"profile-" + employee.id} employee={employee} busy={busy} mutate={mutate} cadence={data.cadence} /></>}</section>
    <CommissionConfirmation historical={result.historical} busy={busy} mutate={mutate} /><section className={styles.panel}><h2>Business activation</h2>{data.reconciliation && <p>Historical records: {data.reconciliation.legacyCount} · Preserved: {data.reconciliation.migrated} · Unresolved: {data.reconciliation.unresolved}</p>}<button className={styles.secondary} disabled={busy || data.mode === "ACTIVE"} onClick={() => void mutate(() => reconcileLegacyPayrollAction(command("RECONCILE_BATCH", { expectedRevision: data.revision, confirmOpening: false })), "Legacy reconciliation checkpoint saved")}>Reconcile next historical batch</button><label className={styles.choice}><input type="checkbox" checked={openingReviewed} onChange={event => setOpeningReviewed(event.target.checked)} disabled={busy || data.mode === "ACTIVE"} />I reviewed the historical and opening balances.</label><button className={styles.secondary} disabled={busy || !openingReviewed || !data.reconciliation || data.reconciliation.unresolved !== 0 || data.mode === "ACTIVE"} onClick={() => void mutate(() => reconcileLegacyPayrollAction(command("CONFIRM_RECONCILIATION", { expectedRevision: data.revision, confirmOpening: true })), "Opening reconciliation reviewed")}>Confirm reconciled opening records</button><p className={styles.help}>Preserve historical payments, confirm opening/YTD records, and reconcile the shadow results before activating publication.</p><div className={styles.toolbar}><button className={styles.secondary} disabled={busy || data.mode !== "LEGACY" || !data.rulePackageId} onClick={() => void mutate(() => activatePayrollAction(command("ACTIVATE_SHADOW", { expectedRevision: data.revision, target: "SHADOW", confirmation: "RECONCILED" })), "Shadow comparison enabled")}>Enable shadow comparison</button><button className={styles.primary} disabled={busy || data.mode !== "SHADOW" || !data.ruleReady || !data.openingConfirmed} onClick={() => void mutate(() => activatePayrollAction(command("ACTIVATE", { expectedRevision: data.revision, target: "ACTIVE", confirmation: "RECONCILED" })), "Payroll activated")}>Activate reconciled payroll</button></div></section>
  </>;
}
function CompensationForm({ employee, busy, mutate }: { employee: PayrollWorkspaceView["employees"][number]; busy: boolean; mutate: Mutate }) {
  const [basis, setBasis] = useState("DAILY");
  const [commissionBasis, setCommissionBasis] = useState("ORIGINAL_PRICE");
  const command = useCommandKeys();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void mutate(() => saveCompensationAction(command("COMPENSATION", { expectedRevision: employee.revision, employeeId: employee.id, from: form.get("from"), to: form.get("to") || undefined, basis, rate: form.get("rate"), hours: form.get("hours"), monthlyDivisor: basis === "MONTHLY" ? form.get("divisor") : undefined, commissionRate: form.get("commissionRate"), commissionBasis })), "Compensation agreement saved");
  }
  return <form onSubmit={submit} className={styles.panel}><h3>Effective compensation agreement</h3><div className={styles.fields}><label>Apply this pay from<input name="from" type="date" min={employee.employmentStart ?? undefined} required /></label><label>Rate ends (optional)<input name="to" type="date" /></label><Menu label="Salary basis" value={basis} onChange={setBasis} options={["DAILY", "MONTHLY", "HOURLY"].map(value => ({ value, label: value[0] + value.slice(1).toLowerCase() }))} /><label>Salary rate<input name="rate" required inputMode="decimal" /></label><label>Normal daily hours<input name="hours" required defaultValue="8" inputMode="decimal" /></label>{basis === "MONTHLY" && <label>Verified monthly daily-rate divisor<input name="divisor" required inputMode="decimal" /></label>}<Menu label="Commission price basis" value={commissionBasis} onChange={setCommissionBasis} options={[{ value: "ORIGINAL_PRICE", label: "Original booked price" }, { value: "DISCOUNTED_PRICE", label: "Discounted booked price" }]} /><label>Commission percentage<input name="commissionRate" required defaultValue="0" inputMode="decimal" /></label></div><p className={styles.help}>Joined on is managed in the People profile. Effective dates preserve past earnings. Overlapping agreements are rejected.</p><button className={styles.primary} disabled={busy}>Save compensation</button></form>;
}
function ProfileForm({ employee, busy, mutate, cadence = "SEMIMONTHLY" }: { employee: PayrollWorkspaceView["employees"][number]; busy: boolean; mutate: Mutate; cadence?: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const command = useCommandKeys();
  const agencyFields = ["sss", "philhealth", "pagibig", "withholding", "overtime", "night", "holiday", "thirteenthMonth"] as const;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void mutate(() => savePayrollProfileAction(command("PROFILE", { expectedRevision: employee.revision, employeeId: employee.id, region: form.get("region"), wageCategory: form.get("category"), monthlyBasic: form.get("basic"), monthlyBasicFrom: form.get("basicFrom"), eligibilityFrom: form.get("eligibilityFrom"),
      identifiers: Object.fromEntries(["tin", "sss", "philhealth", "pagibig"].map(field => [field, form.get("id-" + field)])),
      eligibility: { ...Object.fromEntries(agencyFields.map(field => [field, form.get("eligible-" + field) === "on"])), exemptionEvidence: form.get("exemptionEvidence"), minimumWageExempt: form.get("minimumWageExempt") === "on" },
      opening: { year: Number(form.get("year")), taxable: form.get("taxable"), taxWithheld: form.get("withheld"), basicEarned: form.get("earned"), thirteenthPaid: form.get("thirteenth"), benefitsReceived: form.get("benefitsReceived"), previousEmployer: form.get("previousEmployer") === "on", confirmed, monthlyAssessments: [{ month: form.get("openingMonth"), gross: form.get("openingMonthGross"), ...Object.fromEntries(["sss", "philhealth", "pagibig"].flatMap(agency => ["Employee", "Employer"].map(share => [agency + share, form.get("opening-" + agency + share)]))) }], taxPeriodContexts: [{ period: taxPeriodKey(cadence, String(form.get("openingTaxDate"))), taxable: form.get("openingPeriodTaxable"), withheld: form.get("openingPeriodWithheld") }] },
    })), "Payroll profile saved");
  }
  return <form onSubmit={submit} className={styles.panel}><h3>Statutory profile and opening records</h3><p className={styles.help}>{employee.profileReady ? "Opening records are confirmed. Updates replace the profile only after another explicit confirmation." : "Enter verified records. Use zero only when the corresponding opening balance is zero."}</p><div className={styles.fields}><label>Opening tax year<input name="year" type="number" min="2020" max="2100" required defaultValue={Number(today().slice(0, 4))} /></label><label>Eligibility and location apply from<input name="eligibilityFrom" type="date" required /></label><label>Work region<input name="region" required placeholder="Verified rule-package region" /></label><label>Wage category<input name="category" required /></label><label>Monthly basic applies from<input name="basicFrom" type="month" required /></label><label>Monthly basic salary<input name="basic" required inputMode="decimal" /></label>{["tin", "sss", "philhealth", "pagibig"].map(field => <label key={field}>{field.toUpperCase()} identifier<input name={"id-" + field} autoComplete="off" maxLength={30} /></label>)}</div><div className={styles.choices}>{agencyFields.map(field => <label key={field} className={styles.choice}><input type="checkbox" name={"eligible-" + field} defaultChecked />{field === "thirteenthMonth" ? "Thirteenth-month pay" : field}</label>)}</div><div className={styles.fields}>{[["taxable", "YTD taxable compensation"], ["withheld", "YTD tax withheld"], ["earned", "YTD basic salary earned"], ["thirteenth", "Thirteenth-month pay already paid"], ["benefitsReceived", "YTD thirteenth-month and other benefits received"]].map(([name, label]) => <label key={name}>{label}<input name={name} required inputMode="decimal" /></label>)}</div><label className={styles.label}>Evidence for statutory exclusions or exemptions<input name="exemptionEvidence" maxLength={1000} /></label><label className={styles.choice}><input name="minimumWageExempt" type="checkbox" />Verified minimum-wage exemption</label><h4>Opening contribution month and payment period</h4><p className={styles.help}>Enter amounts assessed before this ledger began. Zero means none was assessed. Do not include statements already published in this workspace.</p><div className={styles.fields}><label>Contribution month<input name="openingMonth" type="month" required defaultValue={today().slice(0, 7)} /></label><label>Month-to-date SSS compensation basis<input name="openingMonthGross" inputMode="decimal" defaultValue="0" required /></label>{["sss", "philhealth", "pagibig"].flatMap(agency => ["Employee", "Employer"].map(share => <label key={agency + share}>{agency.toUpperCase()} {share.toLowerCase()} assessed<input name={"opening-" + agency + share} inputMode="decimal" defaultValue="0" required /></label>))}<label>Opening payment-period date<input name="openingTaxDate" type="date" required defaultValue={today()} /></label><label>Period taxable pay already assessed<input name="openingPeriodTaxable" inputMode="decimal" defaultValue="0" required /></label><label>Period withholding already assessed<input name="openingPeriodWithheld" inputMode="decimal" defaultValue="0" required /></label></div><label className={styles.choice}><input name="previousEmployer" type="checkbox" />Includes previous-employer records</label><label className={styles.choice}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I verified these eligibility and opening records.</label><div className="mt-4"><button className={styles.primary} disabled={busy || !confirmed}>Save statutory profile</button></div></form>;
}
function AdjustmentReview({ result, busy, mutate, selectedEmployee }: { result: WorkspaceResult; busy: boolean; mutate: Mutate; selectedEmployee: string }) {
  const [employeeId, setEmployeeId] = useState(selectedEmployee === "all" ? String(result.data.employees[0]?.id ?? "") : selectedEmployee);
  const [code, setCode] = useState("BONUS");
  const command = useCommandKeys();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const employee = result.data.employees.find(entry => String(entry.id) === employeeId); if (!employee) return;
    void mutate(() => createPayrollAdjustmentAction(command("CREATE_ADJUSTMENT", { expectedRevision: employee.revision, employeeId: employee.id, amount: form.get("amount"), code, reason: form.get("reason"), authorization: form.get("authorization"), effectiveOn: form.get("date") })), "Adjustment created for review");
  }
  return <section className={styles.panel}><h3>Adjustments and deductions</h3><p className={styles.help}>If pay cannot cover an authorized deduction, explicitly reduce the amount, defer it, or waive it before publication.</p>{result.adjustments.filter(entry => selectedEmployee === "all" || String(entry.employeeId) === selectedEmployee).map(entry => <AdjustmentDecision key={entry.id + ":" + entry.revision} entry={entry} employeeName={result.data.employees.find(employee => employee.id === entry.employeeId)?.name ?? "Employee"} busy={busy} mutate={mutate} />)}<form onSubmit={submit}><div className={styles.fields}><Menu value={employeeId} onChange={setEmployeeId} label="Adjustment employee" options={result.data.employees.map(entry => ({ value: String(entry.id), label: entry.name }))} /><Menu value={code} onChange={setCode} label="Adjustment type" options={["BONUS", "ALLOWANCE", "DEDUCTION", "RECOVERY", "OPENING", "FINAL_PAY"].map(value => ({ value, label: value.replaceAll("_", " ") }))} /><label>Signed amount<input name="amount" inputMode="decimal" required placeholder="Negative for deduction" /></label><label>Applies on<input name="date" type="date" required /></label><label>Reason<input name="reason" minLength={5} required /></label><label>Authorization / evidence<input name="authorization" minLength={5} required /></label></div><button className={styles.secondary + " mt-4"} disabled={busy}>Create adjustment for review</button></form></section>;
}
function AdjustmentDecision({ entry, employeeName, busy, mutate }: { entry: WorkspaceResult["adjustments"][number]; employeeName: string; busy: boolean; mutate: Mutate }) {
  const [reason, setReason] = useState("");
  const [reviewedAmount, setReviewedAmount] = useState(entry.amount);
  const command = useCommandKeys();
  const deduction = decimal(entry.amount).isNegative();
  let validAmount = false;
  try { const value = decimal(reviewedAmount); validAmount = /^-?\d+(\.\d{1,2})?$/.test(reviewedAmount) && !value.isZero() && (!deduction || (value.isNegative() && value.abs().lte(decimal(entry.amount).abs()))); } catch { /* Invalid entries stay editable. */ }
  const reduced = reviewedAmount !== entry.amount;
  function decide(disposition: string) {
    void mutate(() => decidePayrollAdjustmentAction(command("ADJUSTMENT_DECISION", { expectedRevision: entry.revision, adjustmentId: entry.id, disposition, reason, reviewedAmount: disposition === "APPROVED" ? reviewedAmount : undefined })), "Adjustment decision saved");
  }
  return <section className={styles.panel} aria-label={employeeName + " adjustment decision"}><p><strong>{employeeName}</strong> � {php(entry.amount)} � {entry.reason} <span className={styles.badge}>{entry.disposition}</span></p><div className={styles.fields}><label>Decision reason and authorization<input value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={1000} /></label>{deduction && <label>Deduction to approve (negative amount)<input inputMode="decimal" value={reviewedAmount} onChange={event => setReviewedAmount(event.target.value)} aria-describedby={"deduction-help-" + entry.id} /></label>}</div>{deduction && <p id={"deduction-help-" + entry.id} className={styles.help}>Enter a smaller negative amount to reduce the deduction. Zero requires an explicit waiver. The original proposed amount remains in the approval evidence.</p>}<div className={styles.toolbar + " mt-3"}><button type="button" className={styles.primary} disabled={busy || reason.trim().length < 5 || !validAmount} onClick={() => decide("APPROVED")}>{reduced ? "Approve reduced deduction" : "Approve amount"}</button><button type="button" className={styles.secondary} disabled={busy || reason.trim().length < 5} onClick={() => decide("DEFERRED")}>Defer</button><button type="button" className={styles.secondary} disabled={busy || reason.trim().length < 5} onClick={() => decide("WAIVED")}>Waive</button></div></section>;
}
type ReviewedStatement = StatementView & { previousReview?: { gross: string; deductions: string; net: string; employerCost: string; reviewHash?: string } };
function ReviewChanges({ statement }: { statement: ReviewedStatement }) {
  const previous = statement.previousReview;
  if (!previous || statement.status === "PUBLISHED") return null;
  return <section className={styles.notice} aria-label="Calculation changes"><h3>Updated calculation: review again</h3><p>Compare the prior review with these refreshed amounts. Open the breakdown to verify changed sources, even when totals match.</p><PayrollScroll label="Previous and current payroll totals"><table className={styles.table}><thead><tr><th scope="col">Amount</th><th scope="col">Previous review</th><th scope="col">Current calculation</th><th scope="col">Difference</th></tr></thead><tbody>{([["gross", "Gross pay"], ["deductions", "Deductions"], ["net", "Net pay"], ["employerCost", "Employer cost"]] as const).map(([field, label]) => <tr key={field}><th scope="row">{label}</th><td>{php(previous[field])}</td><td>{php(statement[field])}</td><td>{php(amount(decimal(statement[field]).minus(previous[field])))}</td></tr>)}</tbody></table></PayrollScroll></section>;
}
