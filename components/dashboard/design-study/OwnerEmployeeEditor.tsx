"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Root as ScrollAreaRoot, Viewport as ScrollAreaViewport } from "@radix-ui/react-scroll-area";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createEmployeeAction, deleteEmployeeAction, getEmployeeScheduleAction, resendEmployeeInviteAction, resetEmployeePasswordAction, updateEmployeeAction, upsertEmployeeScheduleAction } from "@/features/workforce/actions/employees";
import { createEmployeeSchema } from "@/features/workforce/employee-create-schema";
import { employeeScheduleInputSchema } from "@/features/workforce/employee-administration-schemas";
import type { EmployeeCreateInput, EmployeeScheduleRow } from "@/features/workforce/employee-administration-types";
import type { OwnerEmployeeEditorData } from "@/features/workforce/queries/owner-employee-editor";
import type { OwnerPreviewEmployee } from "@/features/workforce/types/owner-preview-directory";
import { StaffPermission, type StaffProfile } from "@/prisma/generated/prisma/enums";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOwnerPreviewContext, useOwnerPreviewFetch, useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import team from "@/components/dashboard/design-study/owner-employees.module.css";
import { CatalogInput } from "@/components/dashboard/owner-preview/CatalogInput";
import { useTeamDraftGuard } from "@/components/dashboard/design-study/useTeamDraftGuard";

export type EmployeeEditorMode = "profile" | "availability" | "schedule" | "invite" | "password" | "delete";
type Result = { success: boolean; error?: string; warning?: string };
const titles: Record<EmployeeEditorMode, string> = { profile: "Edit employee", availability: "Specialties & days off", schedule: "Weekly schedule", invite: "Resend invitation", password: "Reset password", delete: "Delete employee" };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const permissionLabels: Record<StaffPermission, string> = {
  BOOKING_CREATE: "Create bookings", BOOKING_MODIFY: "Modify bookings", BOOKING_CANCEL: "Cancel bookings", BOOKING_MARK_NO_SHOW: "Mark no-show", BOOKING_ADJUST_PRICE: "Adjust booking prices", PAYMENT_COLLECT: "Collect payments", PAYMENT_VERIFY: "Verify payments", QUEUE_CLAIM_SELF: "Claim available services", QUEUE_SERVE_SELF: "Complete own services", QUEUE_OVERRIDE_ALL: "Override queue assignments", CATALOG_MANAGE: "Manage services and packages", SOCIAL_POST_REQUEST_CREATE: "Request social posts", SOCIAL_POST_REVIEW: "Review social posts", SOCIAL_POST_PUBLISH: "Publish social posts",
};
type EditorProps = {
  employee: OwnerPreviewEmployee | null; mode: EmployeeEditorMode; open: boolean; onOpenChange: (open: boolean) => void; onExited: () => void; onChanged: () => void; fontClassName: string;
  onAvailability: (employee: OwnerPreviewEmployee, specialties: string[], days: number[]) => Promise<Result>;
  onPaySettings?: (employeeId: number) => void;
};

export function OwnerEmployeeEditor({ employee, mode, open, onOpenChange, onExited, onChanged, onAvailability, onPaySettings, fontClassName }: EditorProps) {
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const client = useQueryClient();
  const identity = useOwnerPreviewContext();
  const revoke = useOwnerPreviewRevoke();
  const guard = useTeamDraftGuard(() => onOpenChange(false));
  async function submit(task: () => Promise<Result>, message: string) {
    if (lock.current) return;
    lock.current = true; setSaving(true);
    try {
      const result = await task();
      if (!result.success) {
        toast.error(result.error || "The change could not be saved. Please try again.");
        if (result.error === "Forbidden" || result.error === "Unauthorized") revoke();
        return;
      }
      if (result.warning) toast.warning(result.warning); else toast.success(message);
      void client.invalidateQueries({ queryKey: ["payroll-lifecycle", identity.businessSlug, identity.userId] }).catch(() => {});
      onChanged(); onOpenChange(false);
    } catch { toast.error("The change could not be confirmed. Refresh before trying again."); }
    finally { lock.current = false; setSaving(false); }
  }
  const close = () => { if (!lock.current) guard.close(); };
  const common = { saving, submit, close, fontClassName, markChanged: guard.markChanged, onPaySettings };
  return <CatalogEditorOverlay open={open} onOpenChange={next => { if (!next) close(); }} onExited={onExited} title={!employee ? "Add employee" : titles[mode]} description={employee ? `Manage ${employee.name} for your business.` : "Create an employee account and send a temporary password by SMS."} restoreFocusKey={employee && mode !== "delete" ? `employees:${employee.id}` : "employees:create"} className={`${styles.editor} ${fontClassName}`}>
    {guard.confirmation}<div className={team.form} style={guard.confirming ? { display: "none" } : undefined} onChangeCapture={guard.markChanged}>
    {mode === "profile" || mode === "availability" ? <EmployeeProfileRead employee={employee} mode={mode} onAvailability={onAvailability} {...common} />
      : employee && mode === "schedule" ? <EmployeeScheduleRead employee={employee} {...common} />
      : employee ? <EmployeeAccountForm employee={employee} mode={mode} {...common} /> : null}
    </div>
  </CatalogEditorOverlay>;
}

type FormProps = { saving: boolean; submit: (task: () => Promise<Result>, message: string) => Promise<void>; close: () => void; fontClassName: string; markChanged: () => void; onPaySettings?: (employeeId: number) => void };
function FormFrame({ children, onSubmit, saving, close, label = "Save changes" }: { children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; label?: string } & Pick<FormProps, "saving" | "close">) {
  return <form onSubmit={onSubmit} className={team.form} aria-busy={saving}>
    <ScrollAreaRoot type="scroll" scrollHideDelay={800} className={styles.editorScroll}><ScrollAreaViewport data-slot="scroll-area-viewport" tabIndex={0} aria-label="Employee form fields" className="size-full"><div className={styles.editorFields}><fieldset className={team.fields} disabled={saving}>{children}</fieldset></div></ScrollAreaViewport><ScrollBar /></ScrollAreaRoot>
    <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} disabled={saving} onClick={close}>Cancel</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? "Saving…" : label}</button></CatalogEditorFooter>
  </form>;
}
function ReadState({ error, retry }: { error: boolean; retry: () => void }) {
  return <div className={team.editorStatus}>{error ? <><p role="alert">Employee settings could not be loaded.</p><button type="button" className={styles.secondary} onClick={retry}>Retry</button></> : <div role="status" aria-label="Loading employee settings" aria-busy="true"><div className={styles.skeleton} style={{ height: 44, marginBottom: 20 }} /><div className={styles.skeleton} style={{ height: 160 }} /></div>}</div>;
}
function EmployeeProfileRead({ employee, mode, onAvailability, ...props }: Pick<EditorProps, "employee" | "onAvailability"> & { mode: "profile" | "availability" } & FormProps) {
  const identity = useOwnerPreviewContext();
  const fetch = useOwnerPreviewFetch();
  const query = useQuery({ queryKey: ownerPreviewKeys.section(identity, "employees", "editor"), queryFn: ({ signal }) => fetch<OwnerEmployeeEditorData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/employees/editor`, { signal }), gcTime: 0, staleTime: 0, refetchOnWindowFocus: false });
  if (!query.data) return <ReadState error={query.isError} retry={() => { void query.refetch(); }} />;
  const target = employee ? query.data.employees.find(item => item.id === employee.id) : undefined;
  if (employee && !target) return <div className={team.editorStatus}><p role="alert">This employee is no longer available. Refresh the directory.</p><button type="button" className={styles.secondary} onClick={props.close}>Close</button></div>;
  return <EmployeeProfileForm data={query.data} target={target} employee={employee} availabilityOnly={mode === "availability"} onAvailability={onAvailability} {...props} />;
}
function EmployeeProfileForm({ data, target, employee, availabilityOnly, onAvailability, ...props }: { data: OwnerEmployeeEditorData; target?: OwnerEmployeeEditorData["employees"][number]; availabilityOnly: boolean } & Pick<EditorProps, "employee" | "onAvailability"> & FormProps) {
  const [draft, setDraftState] = useState(() => ({ name: target?.name ?? "", contact_number: target?.contact_number ?? "", employment_start: target?.employment_start ?? "", profile: target?.profile ?? "STAFF" as StaffProfile, permissions: target?.permissions ?? data.defaults.STAFF, specialties: target?.specialties ?? [], recurring_days_off: target?.recurring_days_off ?? [] }));
  const [setPayAfterCreate, setSetPayAfterCreate] = useState(false);
  const [employmentReview] = useState(() => ({ date: target?.employment_start ?? "", revision: target?.financialRevision }));
  const [error, setError] = useState("");
  function setDraft(next: typeof draft) { props.markChanged(); setError(""); setDraftState(next); }
  const categories = [...new Set([...data.categories, ...draft.specialties])];
  function toggle<T>(values: T[], value: T) { return values.includes(value) ? values.filter(item => item !== value) : [...values, value]; }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (availabilityOnly && employee) { void props.submit(() => onAvailability(employee, draft.specialties, draft.recurring_days_off), "Availability updated."); return; }
    const joinedChanged = draft.employment_start !== employmentReview.date;
    const input: EmployeeCreateInput = { ...draft, employment_start: data.canManagePayroll && joinedChanged ? draft.employment_start || null : undefined, daily_rate: 0, commission_percentage: 0 };
    const parsed = createEmployeeSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the employee details.");
      const field = event.currentTarget.elements.namedItem(String(parsed.error.issues[0]?.path[0]));
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    const { daily_rate: _legacyRate, commission_percentage: _legacyCommission, ...savedInput } = parsed.data;
    void props.submit(async () => {
      if (employee) return updateEmployeeAction(employee.id, { ...savedInput, ...(joinedChanged && data.canManagePayroll ? { expectedFinancialRevision: employmentReview.revision } : {}) });
      const result = await createEmployeeAction(parsed.data);
      if (result.success && setPayAfterCreate && "data" in result && result.data) props.onPaySettings?.(result.data.id);
      return result;
    }, employee ? "Employee updated." : "Employee created. Pay settings can be added separately.");
  }
  return <FormFrame {...props} onSubmit={save} label={employee ? "Save changes" : "Create employee"}>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {!availabilityOnly && <>
      <label className={team.field}>Full name<CatalogInput name="name" autoComplete="name" required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className={team.field}>Contact number<CatalogInput name="contact_number" type="tel" autoComplete="tel" required maxLength={50} value={draft.contact_number} onChange={event => setDraft({ ...draft, contact_number: event.target.value })} /><span className={team.help}>Philippine mobile number used for sign-in and invitations.</span></label>
      <label className={team.field}>Joined on<CatalogInput name="employment_start" type="date" aria-label="Joined on" disabled={!data.canManagePayroll} value={draft.employment_start} onChange={event => setDraft({ ...draft, employment_start: event.target.value })} /><span className={team.help}>{data.canManagePayroll ? "When this person joined your business. Leave blank if unknown; payroll will ask you to confirm it here when needed." : "Payroll permission is required to change this date."}</span></label>
      <p className={team.help}>Daily, hourly, or monthly pay and commission are managed separately in People → Pay settings. Existing rates are not changed by this form.</p>
      {!employee && data.canManagePayroll && props.onPaySettings && <label className={team.choice}><input type="checkbox" checked={setPayAfterCreate} onChange={event => setSetPayAfterCreate(event.target.checked)} />Set pay after creating this employee</label>}
      <label className={team.field}>Staff profile<Select disabled={props.saving} value={draft.profile} onValueChange={(profile: StaffProfile) => setDraft({ ...draft, profile, permissions: data.defaults[profile] })}><SelectTrigger className={styles.categorySelect} aria-label="Staff profile"><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${team.menu} ${props.fontClassName}`}>{(["STAFF", "MANAGER", "CASHIER"] as const).map(role => <SelectItem key={role} value={role}>{role[0] + role.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select></label>
      <section className={team.section}><h3>Permissions</h3><p>Changing a profile applies its default permissions. An empty selection also uses those defaults.</p><button type="button" className={styles.secondary} onClick={() => setDraft({ ...draft, permissions: data.defaults[draft.profile] })}>Use profile defaults</button><div className={team.permissions}>{Object.values(StaffPermission).map(permission => <label className={team.choice} key={permission}><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={() => setDraft({ ...draft, permissions: toggle(draft.permissions, permission) })} />{permissionLabels[permission]}</label>)}</div></section>
    </>}
    <section className={team.section}><h3>Service specialties</h3><p>{draft.specialties.length ? "Selected categories this employee can serve." : "Generalist: all service categories."}</p><button type="button" className={styles.secondary} onClick={() => setDraft({ ...draft, specialties: [] })}>Use all service categories</button><div className={team.choices}>{categories.map(category => <label key={category} className={team.choice}><input type="checkbox" checked={draft.specialties.includes(category)} onChange={() => setDraft({ ...draft, specialties: toggle(draft.specialties, category) })} />{category}</label>)}</div>{!categories.length && <p>No separate service categories yet.</p>}</section>
    <section className={team.section}><h3>Regular days off</h3><p>Customers cannot book this employee on selected days.</p><div className={team.choices}>{days.map((day, index) => <label className={team.choice} key={day}><input type="checkbox" checked={draft.recurring_days_off.includes(index)} onChange={() => setDraft({ ...draft, recurring_days_off: toggle(draft.recurring_days_off, index).sort() })} />{day}</label>)}</div></section>
  </FormFrame>;
}

function EmployeeScheduleRead({ employee, ...props }: { employee: OwnerPreviewEmployee } & FormProps) {
  const identity = useOwnerPreviewContext();
  const revoke = useOwnerPreviewRevoke();
  const query = useQuery({ queryKey: ownerPreviewKeys.section(identity, "employees", "schedule", { employeeId: employee.id }), queryFn: async () => {
    const result = await getEmployeeScheduleAction(employee.id);
    if (!result.success) { if (result.error === "Forbidden" || result.error === "Unauthorized") revoke(); throw new Error("Unable to load schedule"); }
    return result.data;
  }, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false });
  if (!query.data) return <ReadState error={query.isError} retry={() => { void query.refetch(); }} />;
  return <EmployeeScheduleForm employee={employee} initial={query.data} {...props} />;
}
function EmployeeScheduleForm({ employee, initial, ...props }: { employee: OwnerPreviewEmployee; initial: EmployeeScheduleRow[] } & FormProps) {
  const [rows, setRowsState] = useState(initial);
  const [error, setError] = useState("");
  function setRows(next: EmployeeScheduleRow[]) { props.markChanged(); setError(""); setRowsState(next); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsed = employeeScheduleInputSchema.safeParse({ employeeId: employee.id, rows });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check your shift times."); event.currentTarget.querySelector<HTMLInputElement>("input")?.focus(); return; }
    void props.submit(() => upsertEmployeeScheduleAction(employee.id, parsed.data.rows), "Schedule saved.");
  }
  return <FormFrame {...props} onSubmit={save}>{error && <p role="alert" className={styles.notice}>{error}</p>}<p className={team.help}>Days without shifts follow business hours when formal scheduling is off, or are unavailable when it is on. Regular days off still apply.</p>{days.map((day, index) => <section className={team.shift} key={day}><header><h3>{day}</h3><button type="button" className={styles.secondary} aria-label={`Add ${day} shift`} onClick={() => setRows([...rows, { day_of_week: index, start_time: "", end_time: "" }])}><Plus size={14} aria-hidden="true" />Add shift</button></header>{rows.map((row, rowIndex) => row.day_of_week === index && <div key={rowIndex} className={team.range}><label>Start<input type="time" required aria-label={`${day} start ${rowIndex + 1}`} value={row.start_time} onChange={event => setRows(rows.map((item, i) => i === rowIndex ? { ...item, start_time: event.target.value } : item))} /></label><label>End<input type="time" required aria-label={`${day} end ${rowIndex + 1}`} value={row.end_time} onChange={event => setRows(rows.map((item, i) => i === rowIndex ? { ...item, end_time: event.target.value } : item))} /></label><button type="button" className={styles.rowActions} aria-label={`Remove ${day} shift ${rowIndex + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== rowIndex))}><X size={16} aria-hidden="true" /></button></div>)}{!rows.some(row => row.day_of_week === index) && <p className={team.help}>No custom shifts</p>}</section>)}</FormFrame>;
}
function EmployeeAccountForm({ employee, mode, ...props }: { employee: OwnerPreviewEmployee; mode: EmployeeEditorMode } & FormProps) {
  const [password, setPassword] = useState("");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.submit(() => mode === "delete" ? deleteEmployeeAction(employee.id) : mode === "invite" ? resendEmployeeInviteAction(employee.id) : resetEmployeePasswordAction(employee.id, password), mode === "delete" ? "Employee deleted." : mode === "invite" ? "Invitation sent." : "Password reset.");
  }
  return <FormFrame {...props} onSubmit={save} label={titles[mode]}>
    {mode === "password" ? <><p className={team.help}>This replaces the employee’s current sign-in password.</p><label className={team.field}>New password<input type="password" autoComplete="new-password" required minLength={6} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /><span className={team.help}>At least 6 characters.</span></label></> : <p className={team.help}>{mode === "delete" ? `Delete ${employee.name} from this business? This cannot be undone. Existing records may prevent deletion.` : `Send a new temporary password to ${employee.contactNumber}? This replaces the current password and requires a password change at sign-in.`}</p>}
  </FormFrame>;
}
