"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, MoreHorizontal, Plus, Search, ShieldCheck, Users, Wallet } from "lucide-react";
import type { OwnerPreviewEmployee, OwnerPreviewEmployeesData } from "@/features/workforce/types/owner-preview-directory";
import { updateEmployeeAction } from "@/features/workforce/actions/employees";
import { useOptimisticCatalog } from "@/components/dashboard/owner-preview/useOptimisticCatalog";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OwnerEmployeeEditor, type EmployeeEditorMode } from "@/components/dashboard/design-study/OwnerEmployeeEditor";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import team from "@/components/dashboard/design-study/owner-employees.module.css";
import { useTeamAvailabilitySessions } from "@/components/dashboard/design-study/useTeamAvailabilitySessions";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { OwnerAvailabilityEditor } from "@/components/dashboard/design-study/OwnerAvailabilityEditor";
import { EmployeePaySettingsEditor } from "@/components/payroll/EmployeePaySettings";

export const employeeDayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const roles = ["STAFF", "MANAGER", "CASHIER"] as const;
const roleLabels = { ALL: "All roles", STAFF: "Staff", MANAGER: "Managers", CASHIER: "Cashiers" };

export function OwnerEmployeesStudy({ data, refreshControl, fontClassName = "", onChanged }: { data: OwnerPreviewEmployeesData; refreshControl: ReactNode; fontClassName?: string; onChanged: () => void }) {
  const identity = useOwnerPreviewContext();
  const scope = `${identity.userId}:${identity.businessId}:Employees`;
  const [search, setSearch] = useCatalogListState(scope, "search", "");
  const [role, setRole] = useCatalogListState(scope, "role", "ALL");
  const [limit, setLimit] = useCatalogListState(scope, "limit", 12);
  const [editor, setEditor] = useState<{ employee: OwnerPreviewEmployee | null; mode: EmployeeEditorMode } | null>(null);
  const [open, setOpen] = useState(false);
  const [payEmployeeId, setPayEmployeeId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payPending, setPayPending] = useState(false);
  const nextPay = useRef<number | null>(null);
  const drafts = useTeamAvailabilitySessions<OwnerPreviewEmployee>(open);
  const list = useRef<HTMLDivElement>(null);
  useCatalogScroll(scope, list);
  const directory = useOptimisticCatalog(data.employees);
  const visible = useMemo(() => directory.items.filter(employee => (role === "ALL" || employee.profile === role) && `${employee.name} ${employee.contactNumber} ${employee.specialties.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase())), [directory.items, role, search]);
  const shown = visible.slice(0, limit);
  const capture = useSelectionMotion(list, shown.map(employee => employee.id).join(","), "employee");
  function edit(employee: OwnerPreviewEmployee | null, mode: EmployeeEditorMode) {
    if (mode === "availability" && employee) { drafts.open(employee); return; }
    setEditor({ employee, mode }); setOpen(true);
  }
  function editPay(employeeId: number) { if (payPending) return; setPayEmployeeId(employeeId); setPayOpen(true); }
  async function updateAvailability(employee: OwnerPreviewEmployee, specialties: string[], recurringDaysOff: number[]) {
    capture();
    return directory.update({ ...employee, specialties, recurringDaysOff }, async () => {
      const result = await updateEmployeeAction(employee.id, { specialties, recurring_days_off: recurringDaysOff });
      return result.success ? { success: true as const, data: { ...employee, specialties, recurringDaysOff } } : result;
    });
  }
  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{data.businessName} · Your people</p><h1>Employees<span className={styles.titleDetail}>, in good company.</span></h1><p className={styles.description}>Your team, specialties, and working schedules. A place for every role.</p></div><div className={styles.actions}><div className={styles.refresh}>{refreshControl}</div><button type="button" className={styles.primary} data-catalog-focus="employees:create" onClick={() => edit(null, "profile")}><Plus size={17} aria-hidden="true" />Add employee</button></div></header>
    <section className={styles.summary} aria-label="Employee overview">{[{ label: "Team members", value: directory.items.length, detail: "Current employee accounts", icon: Users }, ...roles.map((profile, index) => ({ label: roleLabels[profile], value: directory.items.filter(employee => employee.profile === profile).length, detail: `${roleLabels[profile]} profile`, icon: [BriefcaseBusiness, ShieldCheck, Wallet][index] }))].map(({ label, value, detail, icon: Icon }) => <div key={label} className={styles.metric}><span className={styles.metricLabel}><Icon size={16} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    <div ref={list}><section className={styles.catalog} aria-labelledby="employee-directory-title">
      <div className={styles.toolbar}><div><h2 id="employee-directory-title">Team directory</h2><span className={styles.count}>{visible.length} of {directory.items.length} employees</span></div><div className={styles.filters}>
        <label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Search employees" placeholder="Search your team…" value={search} onChange={event => { capture(); setSearch(event.target.value); setLimit(12); }} /></label>
        <Select value={role} onValueChange={value => { capture(); setRole(value); setLimit(12); }}><SelectTrigger className={styles.select} aria-label="Filter employees by role"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${team.menu} ${fontClassName}`}>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div></div>
      <ul className={styles.list} data-employee-area>{shown.map(employee => <li className={styles.row} data-employee-row={employee.id} key={employee.id} aria-busy={directory.pendingIds.has(employee.id)}><div className={team.row}>
        <div className={styles.serviceIdentity}><span className={styles.serviceIcon} aria-hidden="true"><Users size={18} /></span><div className={styles.serviceCopy}><h3>{employee.name}</h3><div className={styles.metadata}><span className={styles.category}>{roleLabels[employee.profile] === "Managers" ? "Manager" : roleLabels[employee.profile] === "Cashiers" ? "Cashier" : "Staff"}</span><span>{employee.contactNumber}</span></div>{directory.pendingIds.has(employee.id) && <p className={styles.saving} role="status">Saving availability…</p>}</div></div>
        <div className={team.detail}><small>Service specialties</small><p>{employee.specialties.length ? employee.specialties.join(" · ") : "All service categories"}</p></div>
        <div className={team.detail}><small>Regular days off</small><p>{employee.recurringDaysOff.length ? employee.recurringDaysOff.map(day => employeeDayNames[day]).join(" · ") : "No fixed days off"}</p></div>
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={styles.rowActions} aria-label={`Manage ${employee.name}`} disabled={directory.pendingIds.has(employee.id)} data-catalog-focus={`employees:${employee.id}`}><MoreHorizontal size={19} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${team.menu} ${fontClassName}`}>{data.canManagePay && <DropdownMenuItem disabled={payPending} onSelect={() => editPay(employee.id)}>Pay settings</DropdownMenuItem>}{([['profile', 'Edit employee'], ['availability', 'Specialties & days off'], ['schedule', 'Weekly schedule'], ['invite', 'Resend invitation'], ['password', 'Reset password'], ['delete', 'Delete employee']] as const).map(([mode, label]) => <DropdownMenuItem key={mode} onSelect={() => edit(employee, mode)}>{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      </div></li>)}</ul>
      {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon}><Users size={25} aria-hidden="true" /></span><h3>{directory.items.length ? "No matching employees" : "Your team starts here"}</h3><p>{directory.items.length ? "Try a different name, specialty, or role." : "Add your first employee to manage their role and service specialties."}</p><button type="button" className={styles.secondary} onClick={() => directory.items.length ? (setSearch(""), setRole("ALL")) : edit(null, "profile")}>{directory.items.length ? "Clear filters" : "Add employee"}</button></div></div>}
      {visible.length > limit && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length}</span><button type="button" className={styles.secondary} onClick={() => { capture(); setLimit(value => value + 12); }}>Show more employees</button></div>}
    </section></div>
    {editor && <OwnerEmployeeEditor key={`${editor.employee?.id ?? "new"}:${editor.mode}`} {...editor} open={open} onOpenChange={setOpen} onExited={() => { setEditor(null); if (nextPay.current !== null) { editPay(nextPay.current); nextPay.current = null; } }} onChanged={onChanged} onAvailability={updateAvailability} onPaySettings={employeeId => { nextPay.current = employeeId; setOpen(false); }} fontClassName={fontClassName} />}
    {payEmployeeId !== null && <EmployeePaySettingsEditor key={payEmployeeId} employeeId={payEmployeeId} businessSlug={identity.businessSlug} userId={identity.userId} open={payOpen} onOpenChange={setPayOpen} onPendingChange={setPayPending} restoreFocusKey={shown.some(employee => employee.id === payEmployeeId) ? `employees:${payEmployeeId}` : "employees:create"} onSaved={onChanged} fontClassName={fontClassName} />}
    {drafts.sessions.filter(session => session.item && (session.state === "failed" || session.state === "draft") && session.id !== drafts.activeId).map(session => <button key={session.id} type="button" className={styles.secondary} disabled={open || drafts.activeId !== null} onClick={() => drafts.resume(session.id)}>Resume {session.item!.name} draft</button>)}
    {drafts.sessions.map(session => session.item && <OwnerAvailabilityEditor key={session.id} person={session.item} kind="employee" open={drafts.activeId === session.id} fontClassName={fontClassName} onDismiss={() => drafts.dismiss(session.id)} onDiscard={() => drafts.status(session.id, "saved")} onPending={() => drafts.status(session.id, "pending")} onSaved={() => { drafts.status(session.id, "saved"); onChanged(); }} onFailed={error => drafts.failed(session.id, error)} onSubmit={(specialties, days) => updateAvailability(session.item!, specialties, days)} />)}
  </div></div>;
}
