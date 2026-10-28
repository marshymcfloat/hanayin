"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { OwnerBusinessHoursStudy } from "@/components/dashboard/design-study/OwnerBusinessHoursStudy";
import { hoursInputError, operatingHours, resolveHoursRow, validHoursTime } from "@/features/businesses/business-hours-display";
import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Clock3,
  Copy,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateBusinessHours } from "@/features/businesses/actions/business-hours";
import type { BusinessHourInput } from "@/features/businesses/types/business-hours";
import type { OwnerBusinessHoursPreviewData } from "@/features/businesses/types/owner-business-hours-preview";

export type DaySchedule = {
  dayOfWeek: number;
  category: string;
  day: string;
  shortDay: string;
  open: string;
  close: string;
  enabled: boolean;
  allDay: boolean;
  inherited: boolean;
};

export function toSchedules(hours: BusinessHourInput[], categories: string[]): Record<string, DaySchedule[]> {
  return Object.fromEntries(
    categories.map((category) => [category, Array.from({ length: 7 }, (_, dayOfWeek) => {
      const { row, inherited } = resolveHoursRow(hours, category, dayOfWeek);
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return { dayOfWeek, category, day: names[dayOfWeek], shortDay: names[dayOfWeek].slice(0, 3), open: row?.open_time ?? "09:00", close: row?.close_time ?? "17:00", enabled: row ? !row.is_closed : false, allDay: !!row && row.open_time === row.close_time, inherited };
    })]),
  );
}

type EditableHours = Pick<DaySchedule, "open" | "close" | "enabled" | "allDay">;
type HoursPatches = Record<string, Record<number, Partial<EditableHours>>>;
type HoursDraft = {
  patches: HoursPatches;
  original: Record<string, DaySchedule[]>;
  baseSignature: string;
};

export function applyHoursPatches(server: Record<string, DaySchedule[]>, patches: HoursPatches): Record<string, DaySchedule[]> {
  const updated = Object.fromEntries(Object.entries(server).map(([category, days]) => [
    category,
    days.map((day) => ({ ...day, ...patches[category]?.[day.dayOfWeek], inherited: day.inherited && !patches[category]?.[day.dayOfWeek] })),
  ]));
  const defaults = Object.entries(updated).find(([category]) => category.toLowerCase() === "general")?.[1];
  if (!defaults) return updated;
  return Object.fromEntries(Object.entries(updated).map(([category, days]) => [category, days.map(day => {
    const fallback = defaults[day.dayOfWeek];
    return day.inherited && fallback ? { ...day, open: fallback.open, close: fallback.close, enabled: fallback.enabled, allDay: fallback.allDay } : day;
  })]));
}

function hasEditedFieldConflict(draft: HoursDraft, server: Record<string, DaySchedule[]>): boolean {
  return Object.entries(draft.patches).some(([category, days]) => Object.entries(days).some(([dayKey, patch]) => {
    const dayIndex = Number(dayKey);
    const original = draft.original[category]?.[dayIndex];
    const latest = server[category]?.[dayIndex];
    return !original || !latest || (Object.keys(patch) as Array<keyof EditableHours>).some((field) => original[field] !== latest[field]);
  }));
}

export function OwnerBusinessHoursPreview({ businessSlug, data, refreshControl, onSaved, redesign = false, fontClassName = "" }: {
  fontClassName?: string;
  redesign?: boolean;
  businessSlug: string;
  data: OwnerBusinessHoursPreviewData;
  refreshControl: ReactNode;
  onSaved: () => Promise<boolean>;
}) {
  const categories = useMemo(() => {
    const list = data.serviceCategories.length ? [...data.serviceCategories] : ["GENERAL"];
    if (redesign && !list.some(category => category.toLowerCase() === "general")) list.unshift("GENERAL");
    return redesign ? list.sort((a, b) => Number(b.toLowerCase() === "general") - Number(a.toLowerCase() === "general")) : list;
  }, [data.serviceCategories, redesign]);
  const serverSchedules = useMemo(() => toSchedules(data.hours, categories), [data.hours, categories]);
  const serverSignature = JSON.stringify({ hours: data.hours, categories });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<HoursDraft | null>(null);
  const [resetCategories, setResetCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedDay, setCopiedDay] = useState<string | null>(null);
  const saveLock = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const feedback = (text: string, success = false) => {
    if (redesign) { if (success) toast.success(text); else toast.error(text); }
    else setMessage(text);
  };

  const effectiveServer = resetCategories.length ? toSchedules(data.hours.filter(row => !resetCategories.includes(row.category)), categories) : serverSchedules;
  const schedules = draft ? applyHoursPatches(effectiveServer, draft.patches) : effectiveServer;
  const activeCategory = selectedCategory && categories.includes(selectedCategory) ? selectedCategory : categories[0];
  const serverChanged = Boolean(draft && draft.baseSignature !== serverSignature);
  const editedFieldConflict = Boolean(draft && (hasEditedFieldConflict(draft, serverSchedules) || (resetCategories.length && serverChanged)));

  const activeSchedule = schedules[activeCategory] ?? [];
  const openDays = activeSchedule.filter((day) => day.enabled).length;
  const weeklyHours = activeSchedule.reduce((total, day) => total + operatingHours(day.open, day.close, day.enabled, day.allDay), 0);
  const invalidDraft = redesign && Object.entries(draft?.patches ?? {}).some(([category, days]) => Object.keys(days).some(key => {
    const day = schedules[category]?.[Number(key)];
    return day && hoursInputError(day.open, day.close, day.enabled, day.allDay);
  }));
  useEffect(() => {
    if (!redesign || !draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [redesign, draft]);

  const updateDay = (index: number, change: Partial<EditableHours>) => {
    if (saving) return;
    if (change.allDay === undefined && (change.open !== undefined || change.close !== undefined)) change = { ...change, allDay: false };
    const day = activeSchedule[index];
    const inheritedBase = day?.inherited ? { open: day.open, close: day.close, enabled: day.enabled, allDay: day.allDay } : {};
    const separateWeek = redesign && activeCategory.toLowerCase() !== "general" ? Object.fromEntries(activeSchedule.map(row => [row.dayOfWeek, {open:row.open,close:row.close,enabled:row.enabled,allDay:row.allDay}])) : {};
    setDraft((current) => ({
      baseSignature: current?.baseSignature ?? serverSignature,
      original: current?.original ?? serverSchedules,
      patches: {
        ...current?.patches,
        [activeCategory]: {
          ...separateWeek,
          ...current?.patches[activeCategory],
          [index]: { ...inheritedBase, ...current?.patches[activeCategory]?.[index], ...change },
        },
      },
    }));
  };

  const save = async () => {
    if (saveLock.current) return;
    if (invalidDraft) { feedback("Check the highlighted hours before saving."); return; }
    if (editedFieldConflict) {
      feedback("The server changed a time you edited. Review the latest schedule before saving.");
      return;
    }
    saveLock.current = true;
    setSaving(true); setMessage(null);
    const payload = Object.values(schedules).flat()
      .filter(day => !redesign || draft?.patches[day.category]?.[day.dayOfWeek])
      .map(day => ({
        day_of_week: day.dayOfWeek,
        open_time: redesign && day.allDay ? "00:00" : redesign && !day.enabled && !validHoursTime(day.open) ? "09:00" : day.open,
        close_time: redesign && day.allDay ? "00:00" : redesign && !day.enabled && !validHoursTime(day.close) ? "17:00" : day.close,
        is_closed: !day.enabled,
        category: day.category,
      }));
    try {
      const result = redesign
        ? await updateBusinessHours(businessSlug, payload, { expectedHours: data.hours, resetCategories })
        : await updateBusinessHours(businessSlug, payload);
      if (!result.success) {
        feedback(result.error);
      } else {
        const refreshed = await onSaved();
        if (refreshed) {
          setDraft(null);
          setResetCategories([]);
          feedback("Business hours saved.", true);
        } else {
          feedback("Hours were saved, but could not be reloaded. Retry refresh to confirm.");
        }
      }
    } catch {
      feedback("Could not confirm this save. Your unsaved edits remain available.");
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  };

  const copyDay = (source: DaySchedule, targets?: number[]) => {
    if (saving) return;
    setDraft((current) => ({
      baseSignature: current?.baseSignature ?? serverSignature,
      original: current?.original ?? serverSchedules,
      patches: {
        ...current?.patches,
        [activeCategory]: { ...current?.patches[activeCategory], ...Object.fromEntries((current ? applyHoursPatches(serverSchedules, current.patches)[activeCategory] : serverSchedules[activeCategory]).filter(day => !targets || targets.includes(day.dayOfWeek)).map((day) => [
          day.dayOfWeek,
          { open: source.open, close: source.close, enabled: source.enabled, allDay: source.allDay },
        ])) },
      },
    }));
    setCopiedDay(source.day);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedDay(null), 1400);
  };

  if (redesign) return <OwnerBusinessHoursStudy fontClassName={fontClassName} categories={categories} activeCategory={activeCategory} onCategory={setSelectedCategory} schedules={schedules} days={activeSchedule} dirty={!!draft} saving={saving} conflict={editedFieldConflict} invalid={!!invalidDraft} serverChanged={serverChanged}
    onUseMain={targets => {
      if (saving) return;
      setResetCategories(current => Array.from(new Set([...current, ...targets])));
      setDraft(current => ({
        original: current?.original ?? serverSchedules, baseSignature: current?.baseSignature ?? serverSignature,
        patches: Object.fromEntries(Object.entries(current?.patches ?? {}).filter(([category]) => !targets.includes(category))),
      }));
    }}
    onResolve={() => setDraft(current => current && { ...current, original: serverSchedules, baseSignature: serverSignature })}
    onReset={() => { setDraft(null); setResetCategories([]); }}
    onSave={() => { void save(); }} onUpdate={updateDay} />;

  return (
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]">
        <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
          <header>
            <Link href={`/owner-dashboard-preview/${businessSlug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none transition-colors hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
            </Link>
            <p className="text-sm font-semibold text-[#696C67]">{data.businessName} · Availability settings</p>
            <h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">Business hours</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">Set when each service group can be booked and keep customer booking rules in sync.</p>
            <div className="mt-4">{refreshControl}</div>
            {serverChanged ? <div role="status" className="mt-3 rounded-xl bg-[#FFF8E8] px-3 py-2 text-xs font-semibold text-[#805D1E]">
              {editedFieldConflict ? "The server changed an edited time. Your draft is preserved; review the latest values before saving." : "Server hours changed while you have unsaved edits. Untouched hours use the latest server values."}
              {editedFieldConflict ? <button type="button" onClick={() => setDraft((current) => current && { ...current, original: serverSchedules, baseSignature: serverSignature })} className="ml-2 underline underline-offset-2">Keep my edits over latest</button> : null}
            </div> : null}
          </header>

          <section aria-label="Hours overview" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={CalendarRange} label="Open days" value={`${openDays} / 7`} detail={`${activeCategory} schedule`} tone="lime" />
            <Metric icon={Clock3} label="Weekly coverage" value={`${weeklyHours}h`} detail="Bookable operating time" tone="dark" />
            <Metric icon={CalendarRange} label="Schedule groups" value={`${categories.length}`} detail="Persisted service categories" tone="neutral" />
            <Metric icon={Timer} label="Sync status" value={saving ? "Saving" : "Ready"} detail={message ?? "Changes are saved to the schedule"} tone="lime" />
          </section>

          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]">
            <section aria-labelledby="weekly-schedule-heading" className="overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px]">
              <div className="border-b border-[#ECEEE9] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 id="weekly-schedule-heading" className="text-lg font-bold tracking-[-0.02em]">Weekly schedule</h2>
                    <p className="mt-1 text-xs leading-5 text-[#696C67]">Choose a service group, then adjust its open days and times.</p>
                  </div>
                  <div role="tablist" aria-label="Service group" className="flex max-w-full gap-1 overflow-x-auto rounded-[16px] bg-[#F5F6F3] p-1">
                    {categories.map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} onClick={() => setSelectedCategory(category)} className={cn("min-h-11 shrink-0 cursor-pointer rounded-[12px] px-4 text-xs font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[#72CF35]", activeCategory === category ? "bg-white text-[#20211F] shadow-[0_3px_12px_rgba(32,33,31,.08)]" : "text-[#696C67] hover:text-[#20211F]")}>{category}</button>)}
                  </div>
                </div>
              </div>

              <ul className="divide-y divide-[#ECEEE9]">
                {activeSchedule.map((day, index) => <ScheduleRow key={day.day} day={day} copied={copiedDay === day.day} saving={saving} onToggle={() => updateDay(index, { enabled: !day.enabled })} onTimeChange={(field, value) => updateDay(index, { [field]: value })} onCopy={() => copyDay(day)} />)}
              </ul>
            </section>

            <aside className="rounded-[24px] border border-[#DDE0D9] bg-[#F8F9F6] p-5 text-sm text-[#696C67] sm:rounded-[30px]">
              <h2 className="font-bold text-[#20211F]">Booking policies</h2>
              <p className="mt-2 leading-6">Booking-window, notice, slot, and payment controls are managed elsewhere and are not editable in this preview.</p>
              <button type="button" onClick={save} disabled={saving || editedFieldConflict} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#20211F] px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save business hours"}</button>
            </aside>
          </div>
        </div>
      </main>
  );
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Clock3; label: string; value: string; detail: string; tone: "lime" | "dark" | "neutral" }) {
  return <article className="min-w-0 rounded-[26px] border border-white bg-white p-4 shadow-[0_14px_38px_rgba(32,33,31,0.045)] lg:p-[18px]">
    <div className={cn("grid h-9 w-9 place-items-center rounded-[12px]", tone === "dark" ? "bg-[#20211F] text-white" : tone === "neutral" ? "bg-[#F0F1EE] text-[#424440]" : "bg-[#EFF9E8] text-[#4D8F24]")}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></div>
    <p className="mt-4 text-xs font-semibold text-[#696C67]">{label}</p>
    <p className="mt-2 truncate font-mono text-[clamp(1.6rem,2.15vw,2.1rem)] font-semibold leading-none tracking-[-0.055em]">{value}</p>
    <p className="mt-2.5 truncate text-[11px] font-medium text-[#696C67]">{detail}</p>
  </article>;
}

function ScheduleRow({ day, copied, saving, onToggle, onTimeChange, onCopy }: { day: DaySchedule; copied: boolean; saving: boolean; onToggle: () => void; onTimeChange: (field: "open" | "close", value: string) => void; onCopy: () => void }) {
  return <li className={cn("p-3 transition-colors sm:p-4", !day.enabled && "bg-[#FAFBF8]")}>
    <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3 md:grid-cols-[minmax(150px,.6fr)_minmax(280px,1fr)_44px]">
      <button type="button" role="switch" aria-checked={day.enabled} aria-label={`${day.enabled ? "Close" : "Open"} ${day.day}`} onClick={onToggle} disabled={saving} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] text-left outline-none focus-visible:ring-3 focus-visible:ring-[#72CF35] disabled:cursor-wait disabled:opacity-60">
        <span aria-hidden="true" className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", day.enabled ? "bg-[#72CF35]" : "bg-[#DDE0D9]")}><span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", day.enabled ? "translate-x-6" : "translate-x-1")} /></span>
        <span><span className="block text-sm font-bold"><span className="sm:hidden">{day.shortDay}</span><span className="hidden sm:inline">{day.day}</span></span><span className={cn("mt-0.5 block text-[11px] font-medium", day.enabled ? "text-[#4D8F24]" : "text-[#696C67]")}>{day.enabled ? "Open" : "Closed"}</span></span>
      </button>
      <div className="col-span-2 row-start-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:col-span-1 md:row-start-auto">
        <TimeField label={`${day.day} opening time`} value={day.open} disabled={!day.enabled || saving} onChange={(value) => onTimeChange("open", value)} />
        <span className="text-xs font-semibold text-[#92958F]">to</span>
        <TimeField label={`${day.day} closing time`} value={day.close} disabled={!day.enabled || saving} onChange={(value) => onTimeChange("close", value)} />
      </div>
      <button type="button" onClick={onCopy} disabled={!day.enabled || saving} aria-label={`Copy ${day.day} hours to every day`} title="Copy to every day" className="col-start-2 row-start-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#696C67] outline-none transition-colors hover:bg-[#EFF9E8] hover:text-[#315E18] focus-visible:ring-3 focus-visible:ring-[#72CF35] disabled:cursor-not-allowed disabled:opacity-35 md:col-start-auto md:row-start-auto">
        {copied ? <Check className="h-4 w-4 text-[#4D8F24]" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  </li>;
}

function TimeField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="block min-w-0"><span className="sr-only">{label}</span><input type="time" step={1800} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-11 w-full min-w-0 rounded-[13px] border border-[#DDE0D9] bg-[#F8F9F6] px-2 font-mono text-xs font-semibold outline-none transition-colors focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20 disabled:cursor-not-allowed disabled:text-[#92958F] sm:px-3 sm:text-sm" /></label>;
}
