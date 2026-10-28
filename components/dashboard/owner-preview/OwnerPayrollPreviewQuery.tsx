"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { OwnerPayrollPreview, OwnerPayrollRestricted } from "@/components/dashboard/owner-preview/OwnerPayrollPreview";
import { OwnerPreviewContentSkeleton } from "@/components/dashboard/owner-preview/OwnerPreviewContentSkeleton";
import { OwnerPreviewRefreshControl } from "@/components/dashboard/owner-preview/OwnerPreviewRefreshControl";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import type { OwnerPayrollPreviewData } from "@/features/payroll/types/owner-payroll-preview";
import { OwnerPayrollStudy } from "@/components/dashboard/design-study/OwnerPayrollStudy";
import { OwnerPayrollLoading } from "@/components/dashboard/design-study/OwnerPayrollLoading";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import { useEffect, useState } from "react";
import { PayrollWorkspace } from "@/components/payroll/PayrollWorkspace";
import { SimplePayrollWorkspace } from "@/components/payroll/SimplePayrollWorkspace";
import { useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";

export function OwnerPayrollPreviewRoute({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string } = {}) {
  const [lifecycle, setLifecycle] = useState(false);
  const [legacyWhileShadow, setLegacyWhileShadow] = useState(false);
  const [simpleSetup, setSimpleSetup] = useState(false);
  const [governmentSettings, setGovernmentSettings] = useState(false);
  useEffect(() => {
    const restore = () => {
      if (new URLSearchParams(window.location.search).has("stage")) setLifecycle(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const revoke = useOwnerPreviewRevoke();
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "payroll", "page"),
    queryFn: ({ signal }) => previewFetch<OwnerPayrollPreviewData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/payroll`, { signal }),
    // Compensation must not survive navigation after a permission change.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
  });
  if (!query.data && query.isPending) return redesign ? <OwnerPayrollLoading /> : <OwnerPreviewContentSkeleton />;

  const refreshControl = <OwnerPreviewRefreshControl label="payroll" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt} error={query.isError ? "Refresh failed; showing saved data if available." : null} onRefresh={() => { if (redesign) void refreshTeamQueries(queryClient, ownerPreviewKeys.section(identity, "payroll", "page")); else void query.refetch(); }} />;
  const changed = () => {
    for (const page of ["payroll", "employees", "attendance", "dashboard", "reports", "expenses"]) void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
  };
  if (redesign && query.data?.access === "granted" && !governmentSettings && (query.data.calculationPolicy === "SIMPLE" || simpleSetup)) return <SimplePayrollWorkspace businessSlug={identity.businessSlug} userId={identity.userId} fontClassName={fontClassName} onDenied={revoke} onChanged={changed} onGovernmentSettings={() => setGovernmentSettings(true)} />;
  if (redesign && governmentSettings && query.data?.access === "granted") return <PayrollWorkspace businessSlug={identity.businessSlug} userId={identity.userId} redesign fontClassName={fontClassName} initialStage="setup" onBack={() => setGovernmentSettings(false)} onDenied={revoke} onChanged={changed} />;
  if (query.data?.access === "granted" && (query.data.payrollMode === "ACTIVE" || (!legacyWhileShadow && (lifecycle || query.data.payrollMode === "SHADOW")))) return <>{query.data.payrollMode === "SHADOW" && <div className={styles.notice}><button className={styles.secondary} onClick={() => { setLifecycle(false); setLegacyWhileShadow(true); }}>Open existing payroll during comparison</button></div>}<PayrollWorkspace businessSlug={identity.businessSlug} userId={identity.userId} redesign={redesign} fontClassName={fontClassName} initialStage={lifecycle ? "setup" : "prepare"} onDenied={revoke} onChanged={() => {
    for (const page of ["payroll", "employees", "attendance", "dashboard", "reports", "expenses"]) void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
  }} /></>;
  const setupControl = query.data?.access === "granted" ? <div className={styles.notice}><p>{redesign ? "Start with earnings, manual deductions, payslips, and payments. Your existing pay records are preserved when you switch." : "Keep using your existing payroll while you configure and verify period-based payroll."}</p>{redesign && <button className={styles.primary} onClick={() => setSimpleSetup(true)}>Try simple pay tracking</button>}<button className={styles.secondary} onClick={() => { setLegacyWhileShadow(false); setLifecycle(true); }}>{redesign ? "Government payroll setup" : "Set up period-based payroll"}</button></div> : null;
  if (redesign) {
    if (!query.data || query.data.access === "restricted") return <section className={`${styles.page} ${fontClassName}`}><header className={styles.header}><div><p className={styles.eyebrow}>Your team</p><h1>Payroll</h1></div>{refreshControl}</header><div className={styles.empty}><div><h2>{query.data ? "Payroll access restricted" : "Payroll unavailable"}</h2><p>{query.data ? "Ask an authorized owner for payroll-management access." : "We could not load payroll. Please try refreshing."}</p></div></div></section>;
    return <OwnerPayrollStudy data={query.data} setupControl={setupControl} refreshControl={refreshControl} fontClassName={fontClassName} onChanged={() => {
      for (const page of ["payroll", "attendance", "dashboard", "reports", "expenses"]) void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
    }} />;
  }
  if (!query.data) return <main className="px-4 py-8 md:pl-[160px]"><h1 className="text-2xl font-bold">Payroll unavailable</h1><div className="mt-4">{refreshControl}</div></main>;
  if (query.data.access === "restricted") return <OwnerPayrollRestricted businessSlug={identity.businessSlug} businessName={identity.businessName} refreshControl={refreshControl} />;
  return <>{setupControl}<OwnerPayrollPreview businessSlug={identity.businessSlug} data={query.data} refreshControl={refreshControl} onChanged={() => { void queryClient.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "payroll", "page") }); }} /></>;
}
