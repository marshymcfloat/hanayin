"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, CheckCircle2, ChevronRight, FileText, MinusCircle, Plus, Search, Settings2, UserRound, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import { OwnerPayrollLoading } from "@/components/dashboard/design-study/OwnerPayrollLoading";
import { OwnerPayrollHeader } from "@/components/dashboard/design-study/OwnerPayrollHeader";
import catalog from "@/components/dashboard/design-study/owner-services.module.css";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";
import { confirmHistoricalPayrollCommissionAction, createSimplePayrollAdjustmentAction, decidePayrollAdjustmentAction, getPayrollWorkspaceAction, preparePayrollAction, prepareNextPayrollEmployeeAction, recordPayrollPaymentAction, refreshPayrollAction, reconcileLegacyPayrollAction, saveSimplePayrollSettingsAction, saveSimplePayslipAction } from "@/features/payroll/actions/lifecycle";
import { exportPayrollRunAction } from "@/features/payroll/actions/exports";
import type { PayrollCommandResult, PayrollWorkspaceView } from "@/features/payroll/v2/contracts";
import { amount, decimal, outstanding, sum } from "@/features/payroll/money";
import { useCommandKeys } from "@/components/payroll/useCommandKeys";
import { php, StatementDetails } from "@/components/payroll/StatementDetails";
import { payrollToday, SimpleMenu, SimplePayrollEditor, simpleCompensation, simpleDates, simpleEditorFocusKey, simplePayment, simpleStatus, type SimpleEditor } from "@/components/payroll/SimplePayrollSheets";
import { CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { PayrollScroll } from "@/components/payroll/PayrollScroll";
import { EmployeePaySettingsEditor } from "@/components/payroll/EmployeePaySettings";
import styles from "@/components/payroll/simple-payroll.module.css";

type WorkspaceResult = Extract<Awaited<ReturnType<typeof getPayrollWorkspaceAction>>, { success: true }>;
type Props = { businessSlug: string; userId: string; fontClassName?: string; onDenied?: () => void; onChanged?: () => void; onGovernmentSettings: () => void };

export function SimplePayrollWorkspace({ businessSlug, userId, fontClassName = "", onDenied, onChanged, onGovernmentSettings }: Props) {
  const client = useQueryClient();
  const command = useCommandKeys();
  const lock = useRef(false);
  const pendingFocusKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [runId, setRunId] = useState("");
  const [editor, setEditor] = useState<SimpleEditor | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [commandBusy, setBusy] = useState(false);
  const [payPending, setPayPending] = useState(false);
  const [payEmployeeId, setPayEmployeeId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const busy = commandBusy || payPending;
  const [pendingLabel, setPendingLabel] = useState("");
  const [pendingStatementId, setPendingStatementId] = useState("");
  const [failedDraft, setFailedDraft] = useState<SimpleEditor | null>(null);
  const setupLinkHandled = useRef(false);
  const queryKey = ["payroll-lifecycle", businessSlug, userId, page];
  const query = useQuery({ queryKey, queryFn: async () => {
    const result = await getPayrollWorkspaceAction(page);
    if (!result.success) throw new Error(result.error);
    return result;
  }, gcTime: 0, staleTime: 0, refetchInterval: busy ? false : 30_000 });

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (busy || editorOpen || !pendingFocusKey.current) return;
    const key = pendingFocusKey.current;
    const frame = requestAnimationFrame(() => {
      pendingFocusKey.current = null;
      const active = document.activeElement;
      if (document.querySelector('[data-testid="catalog-editor-overlay"]') || active && active !== document.body && active.isConnected && !active.matches(":disabled") && !active.closest("[inert]")) return;
      Array.from(document.querySelectorAll<HTMLElement>("[data-catalog-focus]")).find(target => target.dataset.catalogFocus === key && target.getClientRects().length > 0 && !target.matches(":disabled"))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, editorOpen]);
  useEffect(() => {
    if (query.error?.message.includes("access has changed") || query.error?.message === "Forbidden") onDenied?.();
  }, [query.error, onDenied]);
  useEffect(() => {
    if (!query.data || setupLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const employee = query.data.data.employees.find(entry => String(entry.id) === params.get("employee"));
    if (params.get("stage") === "setup" && employee) {
      setupLinkHandled.current = true;
      setPayEmployeeId(employee.id);
      setPayOpen(true);
    }
  }, [query.data]);

  function open(next: SimpleEditor) {
    if (lock.current || payPending) return;
    if (next.kind === "compensation") { setEditorOpen(false); setPayEmployeeId(next.draft.employeeId); setPayOpen(true); return; }
    setEditor(next); setEditorOpen(true);
  }
  function recover(draft: SimpleEditor) { if (!mounted.current || lock.current) return; open(draft); }
  async function refresh() {
    await refreshTeamQueries(client, ["payroll-lifecycle", businessSlug, userId]);
  }
  async function perform(operation: () => Promise<PayrollCommandResult>, message: string, label: string, draft?: SimpleEditor, statementId = "") {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true); setPendingLabel(label); setPendingStatementId(statementId);
    if (draft) { pendingFocusKey.current = simpleEditorFocusKey(draft); setEditorOpen(false); }
    try {
      const result = await operation();
      if (!result.success) {
        if (result.code === "FORBIDDEN") { setFailedDraft(null); setEditor(null); setEditorOpen(false); onDenied?.(); toast.error(result.error); }
        else {
          if (draft) setFailedDraft(draft);
          toast.error(result.error, draft ? { action: { label: "Review draft", onClick: () => recover(draft) } } : undefined);
        }
        return null;
      }
      if (draft) setFailedDraft(current => current === draft ? null : current);
      toast.success(message);
      onChanged?.();
      return result;
    } catch {
      if (draft) setFailedDraft(draft);
      toast.error("The request could not be confirmed. Review the draft and retry safely.", draft ? { action: { label: "Review draft", onClick: () => recover(draft) } } : undefined);
      return null;
    } finally {
      await client.invalidateQueries({ queryKey: ["payroll-lifecycle", businessSlug, userId] });
      lock.current = false;
      if (mounted.current) { setBusy(false); setPendingLabel(""); setPendingStatementId(""); }
    }
  }

  async function readWorkspace(requestedPage = page): Promise<WorkspaceResult> {
    const result = await getPayrollWorkspaceAction(requestedPage);
    if (!result.success) throw new Error(result.error);
    if (mounted.current) client.setQueryData(["payroll-lifecycle", businessSlug, userId, requestedPage], result);
    return result;
  }

  async function preparePeople(id: string, requestedPage = page): Promise<PayrollCommandResult> {
    for (let count = 0; count < 500; count++) {
      const current = await readWorkspace(requestedPage);
      const run = current.data.runs.find(entry => entry.id === id);
      if (!run) return { success: false, code: "NOT_FOUND", error: "The draft period could not be found. Refresh payroll." };
      if (run.preparedCount >= run.employeeCount) return { success: true, id: run.id, revision: run.revision };
      setPendingLabel(`Preparing pay · ${run.preparedCount} of ${run.employeeCount} people`);
      const saved = await prepareNextPayrollEmployeeAction(command("SIMPLE_PREPARE_NEXT", { runId: run.id, expectedRevision: run.revision }));
      if (!saved.success) return saved;
    }
    return { success: false, code: "BLOCKED", error: "Preparation is saved. Continue this period to prepare the remaining people." };
  }

  async function startSimple(draft: Extract<SimpleEditor, { kind: "setup" }>): Promise<PayrollCommandResult> {
    let current = await readWorkspace();
    const setup = await saveSimplePayrollSettingsAction(command("SIMPLE_SETUP", { ...draft.draft, expectedRevision: current.data.revision, phase: "SETUP", confirmation: "RECONCILED" }));
    if (!setup.success) return setup;
    let previous = -1;
    for (let batch = 0; batch < 50; batch++) {
      current = await readWorkspace();
      if (current.data.openingConfirmed && current.data.reconciliation?.unresolved === 0) break;
      if (previous >= 0 && current.data.reconciliation?.unresolved === previous) return { success: false, code: "BLOCKED", error: "Some earlier pay records need review before switching. Your setup is saved; review the existing payroll records and resume." };
      previous = current.data.reconciliation?.unresolved ?? -1;
      setPendingLabel("Preserving and checking previous pay records…");
      const reconciled = await reconcileLegacyPayrollAction(command("SIMPLE_RECONCILE", { expectedRevision: current.data.revision, confirmOpening: true }));
      if (!reconciled.success) return reconciled;
    }
    current = await readWorkspace();
    return saveSimplePayrollSettingsAction(command("SIMPLE_ACTIVATE", { ...draft.draft, expectedRevision: current.data.revision, phase: "ACTIVATE", confirmation: "RECONCILED" }));
  }

  async function refreshPayChecks(employeeId: number, statementId?: string) {
    try {
      const fresh = await readWorkspace();
      const affected = fresh.data.runs.filter(run => run.calculationPolicy === "SIMPLE").flatMap(run => run.statements).filter(statement => !["PUBLISHED", "VOID"].includes(statement.status) && statement.employeeId === employeeId);
      if (statementId) affected.sort((first, second) => Number(second.id === statementId) - Number(first.id === statementId));
      for (const statement of affected) {
        const saved = await perform(() => refreshPayrollAction(command("SIMPLE_REFRESH_PAY_CHECK", { statementId: statement.id, expectedRevision: statement.revision })), "Draft payslip updated after source review.", "Refreshing affected draft pay…", undefined, statement.id);
        if (!saved) { toast.warning("The source review is saved. Refresh the affected draft before saving its payslip."); return; }
      }
    } catch { toast.warning("The source review is saved. Refresh the affected draft before saving its payslip."); }
  }

  async function submit() {
    const draft = editor;
    if (!draft || busy || !query.data) return;
    const statements = query.data.data.runs.flatMap(run => run.statements);
    const statement = "statementId" in draft ? statements.find(entry => entry.id === draft.statementId) : null;
    if (draft.kind === "dates") {
      const requestDraft = { ...draft, expectedRevision: draft.expectedRevision ?? query.data.data.revision };
      await perform(async () => {
        const created = await preparePayrollAction(command("SIMPLE_PREPARE", { ...draft.draft, expectedRevision: requestDraft.expectedRevision }));
        if (!created.success) return created;
        setPage(1); setRunId(created.id);
        return preparePeople(created.id, 1);
      }, "Draft payslips are ready to review.", "Preparing draft payslips…", requestDraft);
    } else if (draft.kind === "setup") {
      await perform(() => startSimple(draft), "Simple pay tracking is ready.", "Starting simple pay tracking…", draft);
    } else if (draft.kind === "review" && statement) {
      await perform(() => saveSimplePayslipAction(command("SIMPLE_SAVE", { statementId: statement.id, expectedRevision: draft.expectedRevision, payment: draft.recordPayment ? draft.payment ?? simplePayment(statement) : undefined })), draft.recordPayment ? "Payslip saved and payment recorded." : decimal(statement.net).eq(0) ? "Payslip saved. No payment due." : "Payslip saved. Ready to pay.", draft.recordPayment ? "Confirming payslip and payment…" : "Saving payslip…", draft, statement.id);
    } else if (draft.kind === "payment" && statement) {
      await perform(() => recordPayrollPaymentAction(command("SIMPLE_PAYMENT", { ...draft.draft, statementId: statement.id, expectedRevision: draft.expectedRevision })), "Payment recorded.", "Confirming payment…", draft, statement.id);
    } else if (draft.kind === "recovery") {
      const { adjustmentId, expectedRevision, disposition, reason, reviewedAmount } = draft.draft;
      const saved = await perform(() => decidePayrollAdjustmentAction(command("SIMPLE_ADJUSTMENT_DECISION", { adjustmentId, expectedRevision, disposition, reason, reviewedAmount: disposition === "APPROVED" ? reviewedAmount : undefined })), "Adjustment decision saved.", "Confirming adjustment decision…", draft, draft.statementId);
      if (saved) await refreshPayChecks(draft.draft.employeeId, draft.statementId);
    } else if (draft.kind === "commission") {
      const { serviceId, expectedRevision, rate, base, payableOn, evidence } = draft.draft;
      const saved = await perform(() => confirmHistoricalPayrollCommissionAction(command("SIMPLE_COMMISSION_CONFIRM", { serviceId, expectedRevision, rate, base, payableOn: payableOn || undefined, evidence })), "Commission evidence recorded.", "Confirming commission evidence…", draft, draft.statementId);
      if (saved) await refreshPayChecks(draft.draft.employeeId, draft.statementId);
    } else if (draft.kind === "adjustment" && statement) {
      const correction = Boolean(draft.draft.originalStatementId);
      const saved = await perform(() => createSimplePayrollAdjustmentAction(command("SIMPLE_ADJUSTMENT", draft.draft)), correction ? "Correction saved for next payroll." : "Adjustment saved.", correction ? "Saving correction…" : "Saving adjustment…", draft, statement.id);
      if (saved && !correction) {
        try {
          const fresh = await readWorkspace();
          const current = fresh.data.runs.flatMap(run => run.statements).find(entry => entry.id === statement.id);
          if (current) {
            const refreshed = await perform(() => refreshPayrollAction(command("SIMPLE_REFRESH_ADJUSTED", { statementId: current.id, expectedRevision: current.revision })), "Draft payslip updated.", "Updating draft payslip…", undefined, current.id);
            if (!refreshed) toast.warning("The adjustment is saved. Refresh this draft before saving the payslip.");
          }
        } catch { toast.warning("The adjustment is saved. Refresh this draft before saving the payslip."); }
      }
    }
  }

  async function download(run: PayrollWorkspaceView["runs"][number]) {
    try {
      const result = await exportPayrollRunAction({ runId: run.id, format: "CSV" });
      if (!result.success) { toast.error(result.error); return; }
      const bytes = result.file.encoding === "base64" ? Uint8Array.from(atob(result.file.content), value => value.charCodeAt(0)) : result.file.content;
      const url = URL.createObjectURL(new Blob([bytes], { type: result.file.mime }));
      const link = document.createElement("a"); link.href = url; link.download = result.file.filename; link.click(); URL.revokeObjectURL(url);
      toast.success("Payroll export downloaded.");
    } catch { toast.error("Payroll could not be exported. Try again."); }
  }

  if (!query.data && query.isPending) return <OwnerPayrollLoading />;
  if (!query.data) return <section className={`${catalog.page} ${catalog.content} ${styles.workspace} ${fontClassName}`}><OwnerPayrollHeader /><div className={styles.empty}><div><h2>Payroll could not be loaded</h2><p>Refresh to check your access and try again.</p><button className={styles.secondary} onClick={() => void query.refetch()}>Refresh payroll</button></div></div></section>;
  const data = query.data.data;
  const active = data.mode === "ACTIVE" && data.calculationPolicy === "SIMPLE";
  const simpleRuns = data.runs.filter(run => run.calculationPolicy === "SIMPLE" || run.kind === "LEGACY");
  const run = simpleRuns.find(entry => entry.id === runId) ?? simpleRuns[0];
  const statements = run?.statements.filter(statement => statement.status !== "VOID") ?? [];
  const published = statements.filter(statement => statement.status === "PUBLISHED");
  const visible = statements.filter(statement => statement.employeeName.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = data.runs.flatMap(entry => entry.statements).find(entry => entry.id === detailId);
  const setup: SimpleEditor = { kind: "setup", draft: { cadence: data.cadence as "WEEKLY" | "SEMIMONTHLY" | "CUSTOM", payDays: data.payDays.length ? data.payDays : [15, 30], smsEnabled: data.smsEnabled, effectiveFrom: data.simpleEffectiveFrom ?? payrollToday() } };
  const reviewPending = statements.some(statement => statement.status !== "PUBLISHED");
  const pendingChecks = query.data.adjustments.filter(entry => entry.disposition === "PENDING").length + (query.data.historical?.count ?? 0);
  const steps = ["Choose dates", "Review pay", "Save payslips"];
  const needsTerms = data.employees.filter(employee => !employee.agreements.length);
  const matchingTerms = needsTerms.filter(employee => employee.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section className={`${catalog.page} ${catalog.content} ${styles.workspace} ${fontClassName}`} aria-busy={busy}>
    <OwnerPayrollHeader actions={<><div className={catalog.refresh}><DashboardRefreshButton pending={busy} refreshing={query.isFetching} onRefresh={() => void refresh()} /></div><button className={styles.secondary} disabled={busy} data-catalog-focus="payroll-settings" onClick={() => open({ kind: "settings" })}><Settings2 size={15} aria-hidden="true" />Payroll settings</button>{active && <button className={styles.primary} disabled={busy || !data.employees.length} data-catalog-focus="payroll-dates" onClick={() => open({ kind: "dates", draft: simpleDates(data) })}><Plus size={16} aria-hidden="true" />Prepare pay</button>}</>} />
    <section className={catalog.summary} aria-label={active ? "Payroll overview" : "Payroll setup overview"}>{(active ? [
      { label: "Earnings", value: php(amount(sum(statements.map(statement => statement.gross)))), detail: "In the selected work period", icon: Banknote },
      { label: "Deductions", value: php(amount(sum(statements.map(statement => statement.deductions)))), detail: "Manual amounts you recorded", icon: MinusCircle },
      { label: "Ready to pay", value: php(amount(sum(published.map(statement => outstanding(statement.net, statement.paidAmount))))), detail: "From saved payslips", icon: Wallet },
      { label: "Recorded payments", value: php(amount(sum(published.map(statement => statement.paidAmount)))), detail: "Money already paid", icon: CheckCircle2 },
    ] : [
      { label: "Team members", value: data.employees.length, detail: "People in your payroll workspace", icon: Users },
      { label: "Pay terms added", value: data.employees.length - needsTerms.length, detail: "Recorded compensation terms", icon: CheckCircle2 },
      { label: "Needs pay terms", value: needsTerms.length, detail: "Set how each person earns", icon: UserRound },
      { label: "Simple tracking", value: "Not active", detail: "Your existing payroll stays unchanged", icon: Wallet },
    ]).map(({ label, value, detail, icon: Icon }) => <div className={catalog.metric} key={label}><span className={catalog.metricLabel}><Icon size={16} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    {query.isError && <p role="alert" className={`${styles.notice} ${styles.error}`}>Refresh failed. Saved data is shown; refresh before saving pay.</p>}
    {pendingLabel && <div role="status" aria-live="polite" className={styles.pendingNotice}><FileText size={17} aria-hidden="true" /><span>{pendingLabel} Amounts and payment statuses update after confirmation.</span></div>}
    {failedDraft && !busy && <div className={styles.pendingNotice}><span>A draft needs your attention.</span><button className={styles.textButton} onClick={() => recover(failedDraft)}>Resume draft</button></div>}
    {pendingChecks > 0 && <div className={styles.pendingNotice}><span>{pendingChecks} pay {pendingChecks === 1 ? "check needs" : "checks need"} review before saving affected payslips.</span><button type="button" className={styles.secondary} disabled={busy} data-catalog-focus="payroll-checks" onClick={() => open({ kind: "checks" })}>Review pay checks</button></div>}
    {!active ? <section className={styles.setup} aria-labelledby="simple-pay-setup"><span className={catalog.serviceIcon}><Wallet size={21} aria-hidden="true" /></span><div><h2 id="simple-pay-setup">Start with the everyday essentials.</h2><p>Track earnings, additions, deductions, and money paid. Government calculations are available later in Payroll settings.</p><p>Previous payslips and payments are checked before switching. Your existing payroll stays in place until that check is complete.</p></div><button className={styles.primary} disabled={busy} data-catalog-focus="payroll-setup" onClick={() => open(setup)}>{data.calculationPolicy === "SIMPLE" && data.mode === "SHADOW" ? "Resume simple pay setup" : "Set up simple pay tracking"}<ChevronRight size={15} aria-hidden="true" /></button></section> : <>
      <ol className={styles.steps} aria-label="Prepare payroll">{steps.map((step, index) => <li key={step} className={index === (!run ? 0 : reviewPending ? 1 : 2) ? styles.currentStep : undefined}><span className={styles.stepNumber}>{index < (!run ? 0 : reviewPending ? 1 : 2) ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{step}</li>)}</ol>
      <div className={styles.toolbar}><div className={styles.heading}><h2>Your team’s pay</h2><p>{statements.length ? `${statements.length} payslips in this period` : "Choose dates to prepare pay"}</p></div><div className={styles.filters}><label className={styles.search}><Search size={15} aria-hidden="true" /><span className="sr-only">Find an employee</span><input placeholder="Find a person…" value={search} onChange={event => setSearch(event.target.value)} /></label>{simpleRuns.length > 0 && <SimpleMenu label="Work period" className={styles.runSelect} value={run?.id ?? ""} onChange={setRunId} disabled={busy} options={simpleRuns.map(entry => ({ value: entry.id, label: entry.start + " – " + entry.end + (entry.kind === "OFF_CYCLE" ? " · Extra pay" : "") }))} />}</div></div>
      {run && run.calculationPolicy === "SIMPLE" && run.preparedCount < run.employeeCount && <div className={styles.pendingNotice}><span>{run.preparedCount} of {run.employeeCount} people prepared.</span><button className={styles.secondary} disabled={busy} onClick={() => void perform(() => preparePeople(run.id), "Draft payslips are ready to review.", "Continuing preparation…")}>Continue preparation</button></div>}
      {run?.kind === "LEGACY" && <p className={styles.notice}>Earlier pay record. The original recorded amounts and payment history are preserved. Government payroll settings retain the existing payment workflow for these historical records.</p>}
      <ul className={styles.list}>{visible.map(statement => <li key={statement.id} className={styles.row} aria-busy={pendingStatementId === statement.id}>
        <div className={styles.identity}><span className={styles.personIcon}><UserRound size={19} aria-hidden="true" /></span><div><strong>{statement.employeeName}</strong><span className={`${styles.status} ${simpleStatus(statement) === "Paid" ? styles.paid : ""}`}>{simpleStatus(statement)}</span>{pendingStatementId === statement.id && <span className={styles.pending}>Awaiting confirmation</span>}{statement.issues.length > 0 && <ul className={styles.issues}>{statement.issues.map((issue, index) => <li key={issue.code + index}>{issue.message}</li>)}</ul>}</div></div>
        <div className={styles.value}><small>Earnings</small><strong>{php(statement.gross)}</strong></div><div className={styles.value}><small>Deductions</small><strong>{php(statement.deductions)}</strong></div><div className={`${styles.value} ${styles.net}`}><small>{statement.status === "PUBLISHED" ? "Remaining" : "Take-home pay"}</small><strong>{php(statement.status === "PUBLISHED" ? outstanding(statement.net, statement.paidAmount) : statement.net)}</strong></div>
        <div className={styles.rowActions}><button className={statement.status === "PUBLISHED" ? styles.secondary : styles.primary} disabled={busy} data-catalog-focus={"payroll-" + statement.id} onClick={() => statement.status === "PUBLISHED" ? setDetailId(statement.id) : open({ kind: "review", statementId: statement.id, expectedRevision: statement.revision })}>{statement.status === "PUBLISHED" ? "View payslip" : "Review pay"}</button>{run?.calculationPolicy === "SIMPLE" && statement.status === "PUBLISHED" && <><button className={styles.secondary} disabled={busy || !data.employees.some(employee => employee.id === statement.employeeId)} onClick={() => open({ kind: "adjustment", statementId: statement.id, draft: { employeeId: statement.employeeId, expectedRevision: data.employees.find(employee => employee.id === statement.employeeId)!.revision, originalStatementId: statement.id, label: "", amount: "", reason: "", earnedOn: payrollToday() } })}>Add correction</button>{decimal(outstanding(statement.net, statement.paidAmount)).gt(0) && <button className={styles.primary} disabled={busy} onClick={() => open({ kind: "payment", statementId: statement.id, expectedRevision: statement.revision, draft: simplePayment(statement) })}>Record payment</button>}</>}</div>
      </li>)}</ul>
      {!visible.length && <div className={styles.empty}><div><FileText size={36} aria-hidden="true" /><h3>{search ? "No matching people" : "A clear payday starts here."}</h3><p>{search ? "Try another name." : "Choose a work period. We’ll bring confirmed work and captured commissions together for you to review."}</p>{!search && <button className={styles.primary} disabled={busy || !data.employees.length} onClick={() => open({ kind: "dates", draft: simpleDates(data) })}>Choose dates</button>}</div></div>}
      <div className={styles.footer}><p>Government contributions and tax are not calculated automatically. Manual amounts stay identified on each payslip.</p><div className={styles.actions}>{run && <button className={styles.secondary} disabled={busy || !published.length} onClick={() => void download(run)}>Export payroll</button>}<button className={styles.secondary} disabled={busy || page === 1} onClick={() => { setPage(page - 1); setRunId(""); }}>Previous periods</button><button className={styles.secondary} disabled={busy || !data.hasMore} onClick={() => { setPage(page + 1); setRunId(""); }}>Earlier periods</button></div></div>
    </>}
    {needsTerms.length > 0 && <section className={styles.payTerms} aria-labelledby="pay-terms-title"><div className={catalog.toolbar}><div><h2 id="pay-terms-title">Set how your people earn</h2><p className={catalog.count}>Add pay terms before preparing their first payslip.</p></div>{!active && <label className={catalog.search}><Search size={16} aria-hidden="true" /><input aria-label="Find an employee" placeholder="Search your team…" value={search} onChange={event => setSearch(event.target.value)} /></label>}</div><ul className={catalog.list}>{matchingTerms.map(employee => <li className={catalog.row} key={employee.id}><div className={styles.termsRow}><div className={catalog.serviceIdentity}><span className={catalog.serviceIcon}><UserRound size={18} aria-hidden="true" /></span><div className={catalog.serviceCopy}><h3>{employee.name}</h3><span className={catalog.metadata}>Needs pay terms</span></div></div><button className={styles.secondary} disabled={busy} data-catalog-focus={"pay-terms-" + employee.id} onClick={() => open({ kind: "compensation", draft: simpleCompensation(employee) })}>Set pay terms<span className="sr-only"> for {employee.name}</span><ChevronRight size={14} aria-hidden="true" /></button></div></li>)}</ul>{!matchingTerms.length && <div className={styles.empty}><div><h3>No matching people</h3><p>Try another name.</p><button className={styles.secondary} onClick={() => setSearch("")}>Clear search</button></div></div>}</section>}
    {editor && <SimplePayrollEditor editor={editor} open={editorOpen} data={data} checks={query.data} busy={busy} onChange={next => { if (next.kind === "compensation") open(next); else setEditor(next); }} onClose={() => setEditorOpen(false)} onSubmit={() => void submit()} onGovernmentSettings={() => { setEditorOpen(false); onGovernmentSettings(); }} onRefreshStatement={statement => { setEditorOpen(false); void perform(() => refreshPayrollAction(command("SIMPLE_REFRESH", { statementId: statement.id, expectedRevision: statement.revision })), "Draft payslip refreshed.", "Refreshing draft payslip…", { kind: "review", statementId: statement.id, expectedRevision: statement.revision }, statement.id); }} />}
    {payEmployeeId !== null && <EmployeePaySettingsEditor key={payEmployeeId} employeeId={payEmployeeId} businessSlug={businessSlug} userId={userId} open={payOpen} onOpenChange={setPayOpen} onPendingChange={setPayPending} onSaved={onChanged} onDenied={onDenied} restoreFocusKey={needsTerms.some(employee => employee.id === payEmployeeId) ? `pay-terms-${payEmployeeId}` : "payroll-settings"} fontClassName={fontClassName} />}
    {selected && <CatalogEditorOverlay open={Boolean(detailId)} onOpenChange={next => { if (!next) setDetailId(""); }} title="Payslip" description="Saved earnings, deductions, and recorded payments." restoreFocusKey={"payroll-" + selected.id} className={styles.editor} initialFocus="panel"><PayrollScroll label="Saved payslip" className={styles.sheetBody}><StatementDetails statement={selected} print /></PayrollScroll></CatalogEditorOverlay>}
  </section>;
}

