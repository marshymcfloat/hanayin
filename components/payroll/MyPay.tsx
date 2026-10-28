"use client";
import { useEffect, useState } from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getMyPayAction, getMyPublishedStatementAction } from "@/features/payroll/actions/lifecycle";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { amount, decimal, outstanding, sum } from "@/features/payroll/money";
import { StatementDetails, php } from "./StatementDetails";
import styles from "./payroll.module.css";
import { AttendanceCorrectionRequest } from "./AttendanceCorrectionRequest";

export function MyPay({ businessSlug, userId, initialStatementId = "" }: { businessSlug: string; userId: string; initialStatementId?: string }) {
  return <MyPayScope key={businessSlug + ":" + userId + ":" + initialStatementId} businessSlug={businessSlug} userId={userId} initialStatementId={initialStatementId} />;
}
function MyPayScope(props: { businessSlug: string; userId: string; initialStatementId: string }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}><MyPayContent {...props} /></QueryClientProvider>;
}
function MyPayContent({ businessSlug, userId, initialStatementId }: { businessSlug: string; userId: string; initialStatementId: string }) {
  const [page, setPage] = useState(1); const [statementId, setStatementId] = useState(initialStatementId);
  const session = useSession(); const router = useRouter();
  const query = useQuery({ queryKey: ["my-pay", businessSlug, userId, page], queryFn: async () => {
    const result = await getMyPayAction(page); if (!result.success) throw new Error(result.error); return result.data;
  }, gcTime: 0, staleTime: 0, refetchInterval: 30000 });
  const detail = useQuery({ queryKey: ["my-pay-statement", businessSlug, userId, statementId], queryFn: async () => { const result = await getMyPublishedStatementAction(statementId); if (!result.success) throw new Error(result.error); return result.data; }, enabled: Boolean(statementId), gcTime: 0, staleTime: 0 });
  if (session.status !== "authenticated" || session.data.user.id !== userId || session.data.user.role !== "EMPLOYEE") return <section className={styles.workspace}><p role="status">Verify your employee session to view pay records.</p></section>;
  if (!query.data || query.isError) return <section className={styles.workspace}><p role={query.isError ? "alert" : "status"}>{query.isError ? "Pay records are unavailable. Sign in again or refresh." : "Loading your pay records…"}</p><button className={styles.secondary} onClick={() => void query.refetch()}>Refresh</button></section>;
  const selected = detail.isError ? null : detail.data ?? query.data.statements.find(entry => entry.id === statementId);
  if (selected) return <section className={styles.workspace}><button className={styles.secondary + " " + styles.noPrint} onClick={() => { setStatementId(""); router.replace("/app/" + businessSlug + "/my-pay", { scroll: false }); }}>Back to My Pay</button><StatementDetails statement={selected} print /></section>;
  const estimates = query.data.estimated;
  const payable = amount(sum(estimates.filter(entry => entry.payable).map(entry => entry.amount)));
  const awaiting = amount(sum(estimates.filter(entry => !entry.payable && entry.code === "COMMISSION").map(entry => entry.amount)));
  const simpleEstimate = Boolean(query.data.estimate && "calculationPolicy" in query.data.estimate && query.data.estimate.calculationPolicy === "SIMPLE");
  return <section className={styles.workspace}>
    <header className={styles.header}><div><p>Your earnings, saved payslips, and recorded payments.</p></div><button className={styles.secondary} onClick={() => void query.refetch()}>Refresh</button></header>
    <div className={styles.metrics}><div className={styles.metric}><span>Estimated gross earnings</span><strong>{php(query.data.estimate?.gross ?? String(payable))}</strong></div><div className={styles.metric}><span>Commissions awaiting customer payment</span><strong>{php(String(awaiting))}</strong></div>{query.data.estimate && <div className={styles.metric}><span>Estimated take-home pay</span><strong>{php(query.data.estimate.net)}</strong></div>}{"outstandingTotal" in query.data && typeof query.data.outstandingTotal === "string" && <div className={styles.metric}><span>Outstanding published pay</span><strong>{php(query.data.outstandingTotal)}</strong></div>}</div>
    <p className={styles.help}>{query.data.estimate && <>Work period: {query.data.estimate.start} – {query.data.estimate.end}. </>}Estimates can change after work and deductions are reviewed. Saved payslips show the approved amounts.</p>
    {simpleEstimate && <p className={styles.notice}>Government contributions and tax are not calculated automatically. Manual additions and deductions appear on the payslip as recorded.</p>}
    {Boolean(query.data.estimate?.issues.length) && <section className={styles.notice} aria-label="Estimate review needed"><h2>Estimated pay needs review</h2><ul>{query.data.estimate?.issues.map((issue, index) => <li key={issue.code + index}>{issue.message}</li>)}</ul></section>}
    {detail.isError && <p role="alert">{detail.error.message}</p>}{statementId && detail.isPending && <p role="status">Loading selected payslip…</p>}
    <section className={styles.panel}><h2>Your payslips</h2>{query.data.statements.map(statement => <div className={styles.issue} key={statement.id}><div><strong>{statement.periodStart} – {statement.periodEnd}{query.data.notifications.some(entry => entry.statementId === statement.id) && <span className={styles.badge}>New payslip</span>}</strong><p className={styles.help}>{statement.calculationPolicy === "SIMPLE" ? decimal(statement.net).eq(0) ? "No payment due" : statement.paymentState === "PAID" ? "Paid" : decimal(statement.paidAmount).gt(0) ? "Partly paid" : "Ready to pay" : statement.paymentState} · Net {php(statement.net)} · Paid {php(statement.paidAmount)} · Remaining {php(outstanding(statement.net, statement.paidAmount))}</p></div><button className={styles.secondary} onClick={() => { setStatementId(statement.id); router.replace("/app/" + businessSlug + "/my-pay?statement=" + statement.id, { scroll: false }); }}>View payslip</button></div>)}{!query.data.statements.length && <p>No published payslips yet.</p>}<div className={styles.toolbar + " mt-4"}><button className={styles.secondary} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className={styles.secondary} disabled={!query.data.hasMore} onClick={() => setPage(page + 1)}>More payslips</button></div></section>
    <section className={styles.panel}><h2>Leave balances</h2>{query.data.leave.map(entry => <p key={entry.id}>{entry.code} · {decimal(entry.granted).minus(entry.used).toString()} remaining · through {entry.until}</p>)}{!query.data.leave.length && <p className={styles.help}>No verified leave entitlement records yet.</p>}<a className={styles.secondary} href={"/app/" + businessSlug + "/attendance"}>Request leave</a><a className={styles.secondary + " ml-2"} href={"/app/" + businessSlug + "/attendance"}>View attendance</a></section><AttendanceCorrectionRequest />
  </section>;
}

