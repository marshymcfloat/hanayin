"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { InboxScrollArea } from "@/components/dashboard/design-study/OwnerInboxPresentation";
import inboxStyles from "@/components/dashboard/design-study/owner-inbox.module.css";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { FlaskConical, MessageCircle, Play, ShieldCheck } from "lucide-react";
import {
  CatalogEditorClose, CatalogEditorFooter, CatalogEditorOverlay,
} from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import {
  getOwnerAssistantLabContextAction, simulateOwnerAssistantReplyAction,
} from "@/features/social/conversation-assistant/actions";
import type { AssistantIntent, AssistantPublicFacts } from "@/features/social/conversation-assistant/types";
import type { OwnerAssistantPreviewData } from "@/features/social/conversation-assistant/preview-service";

const scenarios: Array<{ value: AssistantIntent; label: string }> = [
  { value: "services", label: "Services and prices" },
  { value: "hours", label: "Business hours" },
  { value: "categories", label: "Service categories" },
  { value: "availability", label: "Booking availability" },
  { value: "recommendation", label: "Catalog recommendation" },
  { value: "booking_link", label: "Booking link" },
  { value: "clarify", label: "Ask for clarification" },
  { value: "handoff", label: "Human handoff" },
];
const statusLabels = { WAITING: "Waiting for two minutes", SUPPRESSED: "No reply should be sent", HANDOFF: "A person should review this", PROPOSED: "Proposed reply" };
const reasonLabels: Record<string, string> = {
  MODEL_UNAVAILABLE: "Jev is unavailable or disabled. No AI request was made unless explicitly permitted.",
  HUMAN_ALREADY_REPLIED: "A human reply stops the automatic reply.",
  HUMAN_REPLY_AFTER_INBOUND: "A human reply stops the automatic reply.",
  ASSISTANT_PAUSED: "Automatic replies are paused.",
  OWNER_PAUSED: "Automatic replies are paused.",
  CUSTOMER_OPTED_OUT: "The customer has opted out.",
  EXTERNAL_PROCESSING_NOT_CONSENTED: "External AI processing was not approved.",
  AVAILABILITY_UNAVAILABLE: "Availability could not be checked. Nothing is reserved or confirmed.",
  AVAILABILITY_NOT_CHECKED: "Choose a service and an explicit date to check availability.",
};
const controlClass = "mt-1 min-h-11 w-full min-w-0 rounded-[12px] border border-[var(--inbox-line,#DDE1D8)] bg-[var(--inbox-soft,#F8F9F6)] px-3 text-base text-[var(--inbox-accent,#20211F)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus,#72CF35)] disabled:opacity-60";
const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[var(--inbox-focus,#72CF35)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:text-sm";

function manilaDay(offset = 0) {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(Date.parse(`${today}T12:00:00+08:00`) + offset * 86_400_000).toISOString().slice(0, 10);
}

export function OwnerConversationAssistant({ businessSlug, redesign = false, fontClassName = "" }: { businessSlug: string; redesign?: boolean; fontClassName?: string }) {
  const formId = useId();
  const request = useRef(0);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [facts, setFacts] = useState<AssistantPublicFacts | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [mode, setMode] = useState<"POLICY" | "AI">("POLICY");
  const [message, setMessage] = useState("Hello, what services and prices do you offer?");
  const [scenario, setScenario] = useState<AssistantIntent>("services");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(120);
  const [humanReplied, setHumanReplied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<OwnerAssistantPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    if (next) return;
    request.current += 1;
    submitting.current = false;
    setOpen(false);
    setFacts(null);
    setResult(null);
    setError(null);
    setMessage("");
    setConsent(false);
    setMode("POLICY");
    setServiceId("");
    setDate("");
    setHumanReplied(false);
    setPaused(false);
    setOptedOut(false);
  }

  function loadFacts() {
    const current = ++request.current;
    setError(null);
    startTransition(async () => {
      try {
        const response = await getOwnerAssistantLabContextAction({ businessSlug });
        if (request.current !== current) return;
        if (!response.success) { setError(response.error); return; }
        setFacts(response.data.facts);
        setAiAvailable(response.data.aiPreviewAvailable);
      } catch {
        if (request.current === current) setError("Preview facts could not load. Please retry.");
      }
    });
  }

  function openLab() {
    setOpen(true);
    setMessage("Hello, what services and prices do you offer?");
    setScenario("services");
    setElapsedSeconds(120);
    loadFacts();
  }

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending || !facts || !message.trim()) return;
    submitting.current = true;
    const current = ++request.current;
    setError(null);
    setResult(null);
    const common = { businessSlug, message: message.trim(), elapsedSeconds, humanReplied, paused, optedOut };
    const input = mode === "POLICY"
      ? { ...common, mode, scenario, serviceId: serviceId ? Number(serviceId) : null, date: scenario === "availability" ? date || null : null }
      : { ...common, mode, consentForExternalProcessing: consent };
    startTransition(async () => {
      try {
        const response = await simulateOwnerAssistantReplyAction(input);
        if (request.current !== current) return;
        if (!response.success) { setError(response.error); return; }
        setResult(response.data);
      } catch {
        if (request.current === current) setError("Simulation failed. No messages were sent. Please retry.");
      } finally {
        if (request.current === current) submitting.current = false;
      }
    });
  }

  return (
    <>
      <section className="mt-4 flex flex-col gap-3 rounded-[22px] border border-[var(--inbox-line,#E5E8DF)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Customer conversation assistant lab">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[var(--inbox-selected,#EFF9E8)] text-[var(--inbox-positive,#4D8F24)]"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h2 className="text-sm font-bold">Customer auto-replies</h2><span className="rounded-full bg-[var(--inbox-soft,#F0F2ED)] px-2 py-0.5 text-[10px] font-bold text-[var(--inbox-muted,#696C67)]">Simulation only</span></div>
            <p className="mt-1 text-xs leading-5 text-[var(--inbox-muted,#696C67)]">Test two-minute timing and safe replies. Live messaging is not enabled.</p>
          </div>
        </div>
        <button type="button" data-catalog-focus="assistant-lab" onClick={openLab} className={`${buttonClass} shrink-0 self-start bg-[var(--inbox-accent,#20211F)] text-white hover:bg-[var(--inbox-accent-hover,#343633)] sm:self-auto`}><FlaskConical className="h-4 w-4" aria-hidden="true" /> Test auto-replies</button>
      </section>
      <CatalogEditorOverlay open={open} onOpenChange={close} title="Test customer auto-replies" description="An owner-only lab. No messages are sent and no bookings are created." restoreFocusKey="assistant-lab" className={redesign ? `${inboxStyles.theme} ${inboxStyles.editor} ${fontClassName}` : undefined}>
        <InboxScrollArea editor label="Simulation fields">
          <div className="flex items-start gap-2 rounded-[14px] bg-[var(--inbox-selected,#EFF9E8)] p-3 text-xs leading-5 text-[var(--inbox-positive,#315E18)]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Opt-in, messaging permissions, and a valid connection are assumed for this simulation only. Your real settings remain unchanged. A publishing connection does not verify messaging access.</p></div>
          {!facts ? (
            <div className="mt-4" aria-live="polite">
              {error ? <><p role="alert" className="text-sm text-[#B33A42]">{error}</p><button type="button" onClick={loadFacts} disabled={pending} className={`${buttonClass} mt-3 border border-[var(--inbox-line,#DDE1D8)]`}>Retry loading facts</button></> : <p className="text-sm text-[var(--inbox-muted,#696C67)]">Loading public services and hours…</p>}
            </div>
          ) : (
            <form id={formId} onSubmit={run} className="mt-4 space-y-4">
              <p className="text-xs text-[var(--inbox-muted,#696C67)]">{facts.name} · {facts.services.length} services · public prices and hours only</p>
              <fieldset disabled={pending}>
                <legend className="mb-1 text-xs font-semibold">Test mode</legend>
                <AnimatedFilterGroup label="Simulation mode" className={inboxStyles.segments}>
                  {([ ["POLICY", "Policy / template"], ["AI", "Jev preview"] ] as const).map(([value, label]) => <button key={value} type="button" disabled={pending} aria-pressed={mode === value} onClick={() => { setMode(value); setResult(null); }}>{label}</button>)}
                </AnimatedFilterGroup>
                <p className="mt-2 text-xs leading-5 text-[var(--inbox-muted,#696C67)]">{mode === "POLICY" ? "Choose a canned scenario. This tests rules and factual templates; it is not AI classification and never contacts a provider." : aiAvailable ? "Jev selects a bounded intent, service, and date. Application rules still control every reply." : "Jev preview is unavailable on this server. Timing and safety rules can still be tested without a provider request."}</p>
              </fieldset>
              <label className="block text-xs font-semibold" htmlFor={`${formId}-message`}>Synthetic customer message<textarea id={`${formId}-message`} maxLength={700} rows={3} required disabled={pending} value={message} onChange={(event) => { setMessage(event.target.value); setResult(null); }} className={`${controlClass} resize-y py-2.5 font-normal`} /></label>
              <p className="-mt-2 text-xs leading-5 text-[var(--inbox-muted,#696C67)]">Use invented messages only. Do not paste customer names, contacts, payment details, or medical information.</p>
              {mode === "POLICY" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold" htmlFor={`${formId}-scenario`}>Canned scenario<AssistantSelect id={`${formId}-scenario`} disabled={pending} value={scenario} redesign={redesign} fontClassName={fontClassName} onChange={(value) => { setScenario(value as AssistantIntent); setResult(null); }} options={scenarios} /></label>
                  <label className="block text-xs font-semibold" htmlFor={`${formId}-service`}>Public service<AssistantSelect id={`${formId}-service`} disabled={pending} value={serviceId || "unspecified"} redesign={redesign} fontClassName={fontClassName} onChange={(value) => { setServiceId(value === "unspecified" ? "" : value); setResult(null); }} options={[{ value: "unspecified", label: "Not specified" }, ...facts.services.map(service => ({ value: String(service.id), label: service.name }))]} /></label>
                  {scenario === "availability" ? <label className="block text-xs font-semibold" htmlFor={`${formId}-date`}>Explicit requested date<input id={`${formId}-date`} type="date" min={manilaDay()} max={manilaDay(13)} disabled={pending} value={date} onChange={(event) => { setDate(event.target.value); setResult(null); }} className={controlClass} /></label> : null}
                </div>
              ) : <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-[12px] border border-[var(--inbox-line,#DDE1D8)] p-3 text-xs leading-5"><input type="checkbox" disabled={pending} checked={consent} onChange={(event) => { setConsent(event.target.checked); setResult(null); }} className="mt-1 shrink-0 accent-[var(--inbox-focus,#72CF35)]" /><span>Allow this synthetic message to be processed by Jev, only if the separate server-side preview gate is enabled. This does not enable live customer messages.</span></label>}
              <label className="block text-xs font-semibold" htmlFor={`${formId}-elapsed`}>Time without a human reply<AssistantSelect id={`${formId}-elapsed`} disabled={pending} value={String(elapsedSeconds)} redesign={redesign} fontClassName={fontClassName} onChange={(value) => { setElapsedSeconds(Number(value)); setResult(null); }} options={[{ value: "30", label: "30 seconds" }, { value: "119", label: "1 minute 59 seconds" }, { value: "120", label: "2 minutes" }, { value: "300", label: "5 minutes" }, { value: "86400", label: "24 hours" }]} /></label>
              <fieldset disabled={pending} className="grid gap-1">
                <legend className="mb-1 text-xs font-semibold">Simulated safeguards</legend>
                {([ [humanReplied, setHumanReplied, "A person already replied"], [paused, setPaused, "Owner paused the assistant"], [optedOut, setOptedOut, "Customer opted out"] ] as const).map(([checked, setter, label]) => <label key={label} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-2 text-sm hover:bg-[var(--inbox-soft,#F8F9F6)]"><input type="checkbox" checked={checked} onChange={(event) => { setter(event.target.checked); setResult(null); }} className="h-4 w-4 accent-[var(--inbox-focus,#72CF35)]" />{label}</label>)}
              </fieldset>
              <p className="text-xs leading-5 text-[var(--inbox-muted,#696C67)]">The trigger is no human reply for two minutes. A read receipt is not proof that the owner has seen a customer&apos;s message. Slots are read-only suggestions, never reservations.</p>
              {error ? <p role="alert" className="rounded-[12px] bg-[#FFF0F0] p-3 text-sm text-[#B33A42]">{error}</p> : null}
              {result ? <section aria-live="polite" aria-label="Simulation result" className="rounded-[16px] border border-[var(--inbox-line,#DDE1D8)] bg-[var(--inbox-soft,#F8F9F6)] p-4"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold">{statusLabels[result.result.status]}</h3><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[var(--inbox-muted,#696C67)]">Not sent</span></div><p className="mt-2 text-xs leading-5 text-[var(--inbox-muted,#696C67)]">{reasonLabels[result.result.reason] ?? result.result.reason.toLowerCase().replaceAll("_", " ")}</p>{result.result.reply ? <p className="mt-3 whitespace-pre-wrap rounded-[12px] bg-white p-3 text-sm leading-6">{result.result.reply}</p> : null}<p className="mt-3 text-[11px] leading-5 text-[var(--inbox-muted,#696C67)]">{result.decisionSource === "OWNER_SELECTED_SCENARIO" ? "Owner-selected scenario · not an AI-generated decision" : result.decisionSource === "JEV" ? "Jev decision · reply assembled from verified public facts" : "No model decision"}. No conversation is saved.</p></section> : null}
            </form>
          )}
        </InboxScrollArea>
        <CatalogEditorFooter>
          <CatalogEditorClose className={`${buttonClass} border border-[var(--inbox-line,#DDE1D8)] bg-white`}>Close</CatalogEditorClose>
          <button type="submit" form={formId} disabled={pending || !facts || !message.trim()} className={`${buttonClass} bg-[var(--inbox-accent,#20211F)] text-white hover:bg-[var(--inbox-accent-hover,#343633)]`}><Play className="h-4 w-4" aria-hidden="true" />{pending ? "Testing…" : "Run simulation"}</button>
        </CatalogEditorFooter>
      </CatalogEditorOverlay>
    </>
  );
}

function AssistantSelect({ id, value, onChange, disabled, options, redesign, fontClassName }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean; options: Array<{ value: string; label: string }>; redesign: boolean; fontClassName: string }) {
  if (!redesign) return <select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={controlClass}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} className={controlClass}><SelectValue /></SelectTrigger><SelectContent className={`${inboxStyles.theme} ${inboxStyles.menu} ${fontClassName}`}>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}
