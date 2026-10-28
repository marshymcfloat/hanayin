"use client";

import { useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CatalogDraftOverlay } from "@/components/dashboard/owner-preview/CatalogDraftOverlay";
import { CatalogEditorClose, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useOwnerPreviewContext, useOwnerPreviewFetch, useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import type { OwnerEmployeeEditorData } from "@/features/workforce/queries/owner-employee-editor";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import team from "@/components/dashboard/design-study/owner-employees.module.css";

type Result = { success: boolean; error?: string };
type Props = {
  person: { id: number; name: string; specialties: string[]; recurringDaysOff?: number[] };
  kind: "employee" | "owner"; categories?: string[]; open: boolean; disabled?: boolean; fontClassName?: string;
  onDismiss: () => void; onDiscard: () => void; onPending: () => void; onSaved: () => void; onFailed: (error: string) => void;
  onSubmit: (specialties: string[], days: number[]) => Promise<Result>;
};
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function OwnerAvailabilityEditor({ person, kind, categories = [], open, disabled = false, fontClassName = "", onDismiss, onDiscard, onPending, onSaved, onFailed, onSubmit }: Props) {
  const [specialties, setSpecialties] = useState(person.specialties);
  const [daysOff, setDaysOff] = useState(person.recurringDaysOff ?? []);
  const lock = useRef(false);
  const revoke = useOwnerPreviewRevoke();
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  async function save() {
    if (lock.current || disabled) return;
    lock.current = true;
    onPending(); onDismiss();
    try {
      const result = await onSubmit(specialties, daysOff);
      if (!result.success) {
        if (result.error === "Forbidden" || result.error === "Unauthorized") { revoke(); return; }
        onFailed(result.error || "The change could not be saved. Review your draft and try again."); return;
      }
      onSaved();
      toast.success(kind === "employee" ? "Availability updated." : "Owner specialties updated.");
    } catch { onFailed("The change could not be saved. Review your draft and try again."); }
    finally { lock.current = false; }
  }
  const fields = (options: string[]) => <>
    <section className={team.section}><h3>Service specialties</h3><p>No selected specialties means all service categories.</p><button type="button" className={styles.secondary} onClick={() => setSpecialties([])}>Use all service categories</button><div className={team.choices}>{[...new Set([...options, ...person.specialties])].map(category => <label className={team.choice} key={category}><input type="checkbox" checked={specialties.includes(category)} onChange={() => setSpecialties(toggle(specialties, category))} />{category}</label>)}</div></section>
    {kind === "employee" && <section className={team.section}><h3>Regular days off</h3><p>Customers cannot book this employee on selected days.</p><div className={team.choices}>{days.map((day, index) => <label className={team.choice} key={day}><input type="checkbox" checked={daysOff.includes(index)} onChange={() => setDaysOff(toggle(daysOff, index).sort())} />{day}</label>)}</div></section>}
  </>;
  return <CatalogDraftOverlay open={open} onOpenChange={onDismiss} onDiscard={onDiscard} draftKey={JSON.stringify([specialties, daysOff])} title={kind === "employee" ? "Specialties & days off" : "Edit specialties"} description={`Manage ${person.name} for your business.`} restoreFocusKey={kind === "employee" ? `employees:${person.id}` : `owner-${person.id}`} className={`${styles.editor} ${fontClassName}`}>
    {kind === "employee" ? <EmployeeFields employeeId={person.id} disabled={disabled} save={save}>{fields}</EmployeeFields> : <AvailabilityForm disabled={disabled} save={save}>{fields(categories)}</AvailabilityForm>}
  </CatalogDraftOverlay>;
}

function AvailabilityForm({ children, disabled, save }: { children: ReactNode; disabled: boolean; save: () => Promise<void> }) {
  return <form className={team.form} onSubmit={event => { event.preventDefault(); void save(); }}><ScrollArea className={styles.editorScroll}><div className={styles.editorFields}><fieldset className={team.fields} disabled={disabled}>{children}</fieldset></div></ScrollArea><CatalogEditorFooter className={styles.editorFooter}><CatalogEditorClose className={styles.secondary}>Cancel</CatalogEditorClose><button type="submit" className={styles.primary} disabled={disabled}>Save changes</button></CatalogEditorFooter></form>;
}

// This reader unmounts when the sheet closes; private editor data retains gcTime: 0.
function EmployeeFields({ employeeId, disabled, save, children }: { employeeId: number; disabled: boolean; save: () => Promise<void>; children: (categories: string[]) => ReactNode }) {
  const identity = useOwnerPreviewContext();
  const fetch = useOwnerPreviewFetch();
  const query = useQuery({ queryKey: ownerPreviewKeys.section(identity, "employees", "editor"), queryFn: ({ signal }) => fetch<OwnerEmployeeEditorData>(`/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/employees/editor`, { signal }), gcTime: 0, staleTime: 0, refetchOnWindowFocus: false });
  if (!query.data) return <div className={team.editorStatus}>{query.isError ? <><p role="alert">Employee settings could not be loaded.</p><button className={styles.secondary} onClick={() => { void query.refetch(); }}>Retry</button></> : <p role="status">Loading employee settings…</p>}</div>;
  if (!query.data.employees.some(employee => employee.id === employeeId)) return <p role="alert" className={team.editorStatus}>This employee is no longer available. Refresh the directory.</p>;
  return <AvailabilityForm disabled={disabled} save={save}>{children(query.data.categories)}</AvailabilityForm>;
}
