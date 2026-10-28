"use client";

import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Clock3, Pencil, Store } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { hoursInputError, readableHoursTime } from "@/features/businesses/business-hours-display";
import type { DaySchedule } from "@/components/dashboard/owner-preview/OwnerBusinessHoursPreview";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import ui from "@/components/dashboard/design-study/owner-hours-editor.module.css";

type Change = Partial<Pick<DaySchedule, "open" | "close" | "enabled" | "allDay">>;
type Props = {
  fontClassName?: string; categories: string[]; activeCategory: string;
  onCategory: (category: string) => void; schedules: Record<string, DaySchedule[]>; days: DaySchedule[];
  dirty: boolean; saving: boolean; conflict: boolean; invalid: boolean; serverChanged: boolean;
  onUseMain: (categories: string[]) => void; onResolve: () => void; onReset: () => void;
  onSave: () => void; onUpdate: (index: number, change: Change) => void;
};

function period(day: DaySchedule) {
  if (!day.enabled) return "Closed";
  if (day.allDay) return "Open 24 hours";
  if (day.close < day.open) return `12:00 AM–${readableHoursTime(day.close)} · ${readableHoursTime(day.open)}–midnight`;
  return `${readableHoursTime(day.open)} – ${readableHoursTime(day.close)}`;
}

function groups(days: DaySchedule[]) {
  const result: { label: string; days: DaySchedule[] }[] = [];
  for (const index of [1, 2, 3, 4, 5, 6, 0]) {
    const day = days[index];
    if (!day) continue;
    const label = period(day);
    const last = result.at(-1);
    if (last?.label === label) last.days.push(day);
    else result.push({ label, days: [day] });
  }
  return result;
}

function dayLabel(days: DaySchedule[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 1) return days[0].day;
  if (days.length === 2) return `${days[0].shortDay} & ${days[1].shortDay}`;
  return `${days[0].shortDay} – ${days.at(-1)!.shortDay}`;
}

export function OwnerBusinessHoursStudy({ fontClassName = "", categories, activeCategory, onCategory, schedules, days, dirty, saving, conflict, invalid, serverChanged, onUseMain, onResolve, onReset, onSave, onUpdate }: Props) {
  const main = categories.find(category => category.toLowerCase() === "general")!;
  const services = categories.filter(category => category !== main);
  const separate = services.filter(category => schedules[category].some(day => !day.inherited));
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; selected: number[]; key: string; category: string } | null>(null);
  const mainDays = schedules[main];
  const matchingSeparateHours = separate.length > 0 && separate.every(category => schedules[category].every((day, index) => period(day) === period(mainDays[index])));
  const startEditing = (category: string, selected: number[], key: string) => {
    onCategory(category);
    setEditor({ open: true, selected, key, category });
  };
  return <div className={`${styles.page} ${ui.page}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Your business · Business hours</p><h1>One schedule. Your whole business.</h1><p className={styles.description}>Set your opening hours once. Only add separate hours for services that need them.</p></div><span className={ui.timezone}><Clock3 size={14} aria-hidden="true" /> Philippine time · UTC+8</span></header>
    {serverChanged && <div className={ui.notice} role="status">{conflict ? "Someone changed the saved hours. Review your draft before saving." : "Saved hours changed. Your edits are still here."}{conflict && <button className={styles.secondary} disabled={saving} onClick={onResolve}>Keep my changes</button>}</div>}
    <section className={ui.main} aria-labelledby="business-hours-heading">
      <div className={ui.cardHeading}><span className={ui.icon}><Store size={22} aria-hidden="true" /></span><div><h2 id="business-hours-heading">Business hours</h2><p>{separate.length ? `${separate.length} service ${separate.length === 1 ? "group has" : "groups have"} separate hours below.` : "All your services follow this schedule. You’re set."}</p></div><button className={styles.primary} disabled={saving} data-catalog-focus="hours-main" onClick={() => startEditing(main, [1,2,3,4,5,6,0], "hours-main")}><Pencil size={14} aria-hidden="true" /> Edit hours</button></div>
      <div className={ui.coverage}><Check size={14} aria-hidden="true" /><span>{separate.length ? "Used by services without separate hours, and any new services you add." : "Includes every service you have now, and any you add later."}</span></div>
      <ul className={ui.week}>{groups(mainDays).map(group => <li key={group.days[0].day}><span>{dayLabel(group.days)}</span><strong data-closed={!group.days[0].enabled}>{group.label}</strong><button disabled={saving} className={ui.editDay} aria-label={`Edit ${dayLabel(group.days)} hours`} data-catalog-focus={`hours-${group.days[0].day}`} onClick={() => startEditing(main, group.days.map(day => day.dayOfWeek), `hours-${group.days[0].day}`)}><Pencil size={14} aria-hidden="true" /></button></li>)}</ul>
      {mainDays.every(day => day.enabled && day.allDay) && <p className={ui.note}>Open 24/7 · every day, all day.</p>}
      {!mainDays.some(day => day.enabled) && <p className={ui.note}>No open days yet. Choose “Edit hours” to start accepting bookings.</p>}
    </section>
    <section className={ui.exceptions} aria-labelledby="separate-hours-heading">
      <button className={ui.disclosure} aria-expanded={expanded} aria-controls="separate-hours-list" onClick={() => setExpanded(!expanded)}><div><h2 id="separate-hours-heading">Different hours for some services?</h2><p>{separate.length ? `${separate.length} ${separate.length === 1 ? "group uses" : "groups use"} a separate schedule. Review them here.` : "Optional. Skip this if all services open and close together."}</p></div><ChevronDown size={18} className={expanded ? ui.rotated : ""} aria-hidden="true" /></button>
      {separate.length > 0 && !expanded && <div className={ui.tags}>{separate.map(category => <span key={category}>{category}</span>)}</div>}
      {matchingSeparateHours && <div className={ui.consolidate}><p>These services already have the same times, but their schedules are saved separately. Link them to your business hours so you only edit once.</p><button className={styles.secondary} disabled={saving} onClick={() => setConfirm(separate)}>Keep one schedule</button></div>}
      {expanded && <div id="separate-hours-list" className={ui.exceptionBody}>
        {services.length === 0 ? <p className={ui.note}>Your services will automatically use your business hours when you add them.</p> : services.map(category => {
          const custom = separate.includes(category);
          return <div className={ui.serviceRow} key={category}><div><h3>{category}</h3><p>{custom ? schedules[category].every(day => !day.inherited) ? "Uses separate hours" : "Some days have separate hours; the rest use business hours" : "Uses business hours · updates automatically"}</p>{custom && <small>{groups(schedules[category]).map(group => `${dayLabel(group.days)}: ${group.label}`).join(" · ")}</small>}</div><div className={ui.rowActions}>
            <button className={styles.secondary} data-catalog-focus={`hours-${category}`} disabled={saving} onClick={() => startEditing(category, [1,2,3,4,5,6,0], `hours-${category}`)}>{custom ? "Edit separate hours" : "Set different hours"}<ArrowUpRight size={13} aria-hidden="true" /></button>
            {custom && <button className={ui.textButton} disabled={saving} onClick={() => setConfirm([category])}>Use business hours</button>}
          </div></div>;
        })}
        {separate.length > 1 && !matchingSeparateHours && <button className={ui.textButton} disabled={saving} onClick={() => setConfirm(separate)}>Use business hours for all services</button>}
      </div>}
      {confirm && <div className={ui.confirm} role="group" aria-label="Confirm using business hours"><strong>Replace separate hours for {confirm.length === 1 ? confirm[0] : "all services"}?</strong><p>These services will follow your business hours, including future changes. Nothing is saved until you save changes.</p><div className={ui.rowActions}><button className={styles.secondary} onClick={() => setConfirm(null)}>Cancel</button><button className={styles.primary} onClick={() => { onUseMain(confirm); setConfirm(null); }}>Use business hours</button></div></div>}
    </section>
    <p className={ui.footnote}>These hours control when customers can book. Staff availability still applies. Existing bookings are not moved.</p>
    {dirty && <div className={ui.saveBar} role="group" aria-label="Save hours"><div role="status"><strong>{saving ? "Saving…" : "Changes ready to save"}</strong><small>{invalid ? "Check the edited times before saving." : "Your live hours haven’t changed yet."}</small></div><div className={ui.rowActions}><button className={styles.secondary} disabled={saving} onClick={onReset}>Discard changes</button><button className={styles.primary} disabled={saving || invalid || conflict} onClick={onSave}>Save changes</button></div></div>}
    {editor && <CatalogEditorOverlay open={editor.open} onOpenChange={open => setEditor(current => current && { ...current, open })} onExited={() => setEditor(null)} title={editor.category === main ? "Set your business hours" : `Hours for ${editor.category}`} description={editor.category === main ? "Choose days that share the same hours. You can edit the others separately." : "Only this service group will use these hours."} restoreFocusKey={editor.key} initialFocus="panel" className={`${fontClassName} ${ui.sheet}`}>
      <HoursPicker key={editor.key} initialDays={editor.selected} days={days} main={activeCategory === main} onApply={(selected, change) => { selected.forEach(day => onUpdate(day, change)); setEditor(current => current && { ...current, open: false }); }} fontClassName={fontClassName} />
    </CatalogEditorOverlay>}
  </div>;
}

function HoursPicker({ initialDays, days, main, onApply, fontClassName }: { initialDays: number[]; days: DaySchedule[]; main: boolean; onApply: (days: number[], change: Change) => void; fontClassName: string }) {
  const first = days[initialDays[0]];
  const [selected, setSelected] = useState(initialDays);
  const [mode, setMode] = useState(first.enabled ? first.allDay ? "all-day" : "hours" : "hours");
  const [open, setOpen] = useState(first.allDay ? "09:00" : first.open);
  const [close, setClose] = useState(first.allDay ? "17:00" : first.close);
  const error = hoursInputError(open, close, mode !== "closed", mode === "all-day");
  return <><ScrollArea className={ui.sheetScroll}><div className={ui.sheetBody}>
    <fieldset><legend>1. Which days?</legend><div className={ui.presets}><button onClick={() => setSelected([1,2,3,4,5,6,0])}>Every day</button><button onClick={() => setSelected([1,2,3,4,5])}>Mon–Fri</button><button onClick={() => setSelected([6,0])}>Sat–Sun</button></div><div className={ui.dayChoices}>{[1,2,3,4,5,6,0].map(day => <label key={day}><input type="checkbox" aria-label={days[day].day} checked={selected.includes(day)} onChange={event => setSelected(current => event.target.checked ? [...current, day] : current.filter(value => value !== day))}/><span>{days[day].shortDay}</span></label>)}</div></fieldset>
    <fieldset><legend>2. When are you open?</legend><Select value={mode} onValueChange={setMode}><SelectTrigger className={ui.mode} aria-label="Opening hours"><SelectValue/></SelectTrigger><SelectContent className={`${fontClassName} ${ui.menu}`}><SelectItem value="hours">Opening & closing time</SelectItem><SelectItem value="all-day">Open 24 hours</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select>
      {mode === "hours" ? <><div className={ui.times}><label>Opens at<input type="time" value={open} onChange={event => setOpen(event.target.value)} aria-invalid={!!error} aria-describedby="hours-picker-help"/></label><label>Closes at<input type="time" value={close} onChange={event => setClose(event.target.value)} aria-invalid={!!error} aria-describedby="hours-picker-help"/></label></div><p id="hours-picker-help" className={error ? ui.error : ui.note}>{error ?? (close < open ? "This opens twice on each selected day: midnight until closing time, then opening time until midnight." : "Times are in Philippine time (UTC+8).")}</p></> : <p className={ui.selectionNote}>{mode === "all-day" ? "Open all day, midnight to midnight. No closing time needed." : "Customers cannot book on these days."}</p>}
    </fieldset>
    <div className={ui.preview}><strong>{selected.length ? `${selected.length} ${selected.length === 1 ? "day" : "days"} selected` : "Choose at least one day"}</strong><p>{selected.map(day => days[day].shortDay).join(" · ")}</p><small>{main ? "Services using business hours will follow this change." : "Other service groups won’t change."} Unselected days stay as they are.</small></div>
  </div></ScrollArea><CatalogEditorFooter className={ui.sheetFooter}><span>This updates your draft. Save on the page when ready.</span><button className={styles.primary} disabled={!selected.length || !!error} onClick={() => onApply(selected, { enabled: mode !== "closed", allDay: mode === "all-day", open: mode === "all-day" ? "00:00" : open || "09:00", close: mode === "all-day" ? "00:00" : close || "17:00" })}>Use these hours</button></CatalogEditorFooter></>;
}
