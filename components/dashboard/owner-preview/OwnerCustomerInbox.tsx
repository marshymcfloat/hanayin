"use client";

import { CatalogDraftOverlay } from "@/components/dashboard/owner-preview/CatalogDraftOverlay";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, MessageCircle, Pause, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { CatalogEditorClose, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { OwnerConversationAssistant } from "@/components/dashboard/owner-preview/OwnerConversationAssistant";
import { OwnerPreviewRefreshControl } from "@/components/dashboard/owner-preview/OwnerPreviewRefreshControl";
import { useOwnerPreviewContext, useOwnerPreviewFetch, useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { setOwnerInboxTakeoverAction, updateOwnerInboxSettingsAction } from "@/features/social/customer-messaging/actions";
import type { InboxConversationDetail, InboxSnapshot, MessagingReadinessReason, MessagingSettings } from "@/features/social/customer-messaging/contracts";
import { toast } from "sonner";
import { InboxScrollArea } from "@/components/dashboard/design-study/OwnerInboxPresentation";
import inboxStyles from "@/components/dashboard/design-study/owner-inbox.module.css";
import { cn } from "@/lib/utils";

type InboxData = InboxSnapshot & { aiEntitled: boolean };
const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-[var(--inbox-focus,#72CF35)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
const panelClass = "min-w-0 rounded-[24px] border border-[var(--inbox-line,#E7E9E4)] bg-white shadow-[0_18px_45px_rgba(32,33,31,.045)]";
const modeLabels = { OFF: "Off", SUGGEST: "Suggestions only", AUTO: "Automatic replies" };
const deliveryLabels = { NONE: "No send recorded", PENDING: "Awaiting send confirmation", CONFIRMED: "Send confirmed", FAILED: "Send failed", UNKNOWN: "Send outcome unknown · needs review" };
const readinessItems: Array<{ label: string; reasons: MessagingReadinessReason[] }> = [
  { label: "Messaging permissions", reasons: ["CHANNEL_UNVERIFIED", "PERMISSIONS_UNVERIFIED"] },
  { label: "Secure webhook", reasons: ["WEBHOOK_UNCONFIGURED", "INTAKE_DISABLED"] },
  { label: "Reply worker", reasons: ["WORKER_DISABLED", "DELIVERY_DISABLED", "AI_UNAVAILABLE", "RATE_STORE_UNAVAILABLE", "GRAPH_VERSION_UNCONFIGURED", "PUBLIC_URL_UNCONFIGURED"] },
  { label: "Protected storage", reasons: ["SCHEMA_UNAVAILABLE", "ENCRYPTION_UNAVAILABLE"] },
  { label: "Pilot verification", reasons: ["PILOT_UNVERIFIED"] },
];

function formattedTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(date);
}

export function OwnerCustomerInboxSkeleton() {
  return <div aria-label="Loading Customer Inbox" role="status" aria-busy="true"><div aria-label="Loading inbox controls" className={cn(panelClass, "mb-4 h-28 bg-[var(--inbox-soft,#F5F6F3)] motion-safe:animate-pulse")} /><div className="grid min-h-[480px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"><div className={cn(panelClass, "p-5")}><div className="h-6 w-32 rounded bg-[var(--inbox-line,#ECEEE9)]" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="mt-5 h-16 rounded-[16px] bg-[var(--inbox-soft,#F5F6F3)] motion-safe:animate-pulse" />)}</div><div className={cn(panelClass, "hidden p-6 lg:block")}><div className="h-7 w-40 rounded bg-[var(--inbox-line,#ECEEE9)]" /><div className="mt-8 h-20 w-3/4 rounded-[16px] bg-[var(--inbox-soft,#F5F6F3)] motion-safe:animate-pulse" /><div className="ml-auto mt-5 h-20 w-3/4 rounded-[16px] bg-[var(--inbox-soft,#F5F6F3)] motion-safe:animate-pulse" /><span className="sr-only">Loading conversations</span></div></div></div>;
}

export function OwnerCustomerInboxRestricted({ message }: { message: string }) {
  return <section className={cn(panelClass, "p-6")} aria-labelledby="inbox-restricted"><ShieldCheck className="h-5 w-5 text-[var(--inbox-muted,#696C67)]" aria-hidden="true" /><h2 id="inbox-restricted" className="mt-3 text-lg font-bold">Customer Inbox access restricted</h2><p className="mt-2 max-w-xl text-base leading-6 text-[var(--inbox-muted,#696C67)]">{message}</p></section>;
}

export function OwnerCustomerInboxRoute({ redesign = false, fontClassName = "" }: { redesign?: boolean; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const revoke = useOwnerPreviewRevoke();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlPending, startControlTransition] = useTransition();
  const mounted = useRef(true);
  const controlSubmitting = useRef(false);
  const conversationHeading = useRef<HTMLHeadingElement>(null);
  const conversationButtons = useRef(new Map<string, HTMLButtonElement>());
  const lastSelectedId = useRef<string | null>(null);
  const { businessId, businessSlug, userId } = identity;
  const snapshotKey = useMemo(() => ownerPreviewKeys.section({ businessId, businessSlug, userId }, "inbox", "snapshot"), [businessId, businessSlug, userId]);
  const detailKey = useMemo(() => ownerPreviewKeys.section({ businessId, businessSlug, userId }, "inbox", "conversation", { conversationId: selectedId }), [businessId, businessSlug, userId, selectedId]);
  const endpoint = `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/inbox`;
  const snapshot = useQuery({
    queryKey: snapshotKey,
    queryFn: ({ signal }) => previewFetch<InboxData>(endpoint, { signal }),
    staleTime: 0, gcTime: 0, retry: false,
    refetchInterval: (query) => visible && query.state.data?.setupStatus === "READY" ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => previewFetch<InboxConversationDetail>(`${endpoint}?conversationId=${encodeURIComponent(selectedId ?? "")}`, { signal }),
    enabled: selectedId !== null && !!snapshot.data,
    staleTime: 0, gcTime: 0, retry: false,
    refetchInterval: visible && snapshot.data?.setupStatus === "READY" ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    mounted.current = true;
    function updateVisibility() { setVisible(document.visibilityState === "visible"); }
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", updateVisibility);
      void queryClient.cancelQueries({ queryKey: snapshotKey, exact: true });
      queryClient.removeQueries({ queryKey: snapshotKey, exact: true });
    };
  }, [queryClient, snapshotKey]);
  useEffect(() => () => {
    void queryClient.cancelQueries({ queryKey: detailKey, exact: true });
    queryClient.removeQueries({ queryKey: detailKey, exact: true });
  }, [queryClient, detailKey]);
  useEffect(() => {
    if (selectedId) {
      lastSelectedId.current = selectedId;
      conversationHeading.current?.focus();
    } else if (lastSelectedId.current) {
      conversationButtons.current.get(lastSelectedId.current)?.focus();
    }
  }, [selectedId]);

  async function settingsSave(settings: MessagingSettings) {
    const response = await updateOwnerInboxSettingsAction({ businessSlug: identity.businessSlug, settings });
    if (!mounted.current) return { success: false as const, error: "Inbox closed." };
    if (!response.success) {
      if ("reason" in response && (response.reason === "FORBIDDEN" || response.reason === "SOCIAL_REQUIRED")) revoke();
      toast.error(response.error);
      return response;
    }
    toast.success("Inbox settings saved.");
    void queryClient.invalidateQueries({ queryKey: snapshotKey, exact: true });
    return { success: true as const };
  }
  function pause() {
    if (!snapshot.data || controlSubmitting.current) return;
    controlSubmitting.current = true;
    setControlError(null);
    startControlTransition(async () => {
      try {
        const response = await settingsSave({ ...snapshot.data.settings, mode: "OFF", paused: true, aiConsent: false });
        if (mounted.current && !response.success) setControlError(response.error);
      } catch { if (mounted.current) { setControlError("Replies could not be paused. Please retry."); toast.error("Replies could not be paused. Please retry."); } }
      finally { controlSubmitting.current = false; }
    });
  }
  function takeover() {
    if (!detail.data || controlSubmitting.current) return;
    controlSubmitting.current = true;
    const conversationId = selectedId;
    setControlError(null);
    startControlTransition(async () => {
      try {
        const response = await setOwnerInboxTakeoverAction({ businessSlug: identity.businessSlug, conversationId, takeover: !detail.data.conversation.takeover });
        if (!mounted.current) return;
        if (!response.success) {
          if ("reason" in response && (response.reason === "FORBIDDEN" || response.reason === "SOCIAL_REQUIRED")) revoke();
          setControlError(response.error);
          toast.error(response.error);
          return;
        }
        toast.success(detail.data.conversation.takeover ? "Human takeover released." : "Human takeover enabled.");
        void queryClient.invalidateQueries({ queryKey: snapshotKey, exact: true });
        void queryClient.invalidateQueries({ queryKey: detailKey, exact: true });
      } catch { if (mounted.current) { setControlError("Conversation control could not be saved. Please retry."); toast.error("Conversation control could not be saved. Please retry."); } }
      finally { controlSubmitting.current = false; }
    });
  }

  if (!snapshot.data && snapshot.isPending) return <OwnerCustomerInboxSkeleton />;
  const refreshControl = <OwnerPreviewRefreshControl label="inbox" iconOnly isFetching={snapshot.isFetching || detail.isFetching} updatedAt={snapshot.dataUpdatedAt} error={snapshot.isError || detail.isError ? "Refresh failed. Retry to update the inbox." : null} onRefresh={() => void refreshTeamQueries(queryClient, ownerPreviewKeys.page(identity, "inbox"))} />;
  if (!snapshot.data) return <section className={cn(panelClass, "p-6")}><h2 className="text-lg font-bold">Customer Inbox unavailable</h2><p className="my-3 text-base text-[var(--inbox-muted,#696C67)]">Conversations could not load. Try refreshing.</p>{refreshControl}</section>;
  const data = snapshot.data;
  const selectedExists = data.conversations.some((conversation) => conversation.id === selectedId);

  return <div className={cn("space-y-4 text-[var(--inbox-ink,#20211F)]", redesign && inboxStyles.theme)}>
    <section className={cn(panelClass, "p-4 sm:p-5")} aria-label="Inbox controls">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--inbox-selected,#EFF9E8)]"><MessageCircle className="h-5 w-5 text-[var(--inbox-positive,#3D791E)]" aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words text-base font-bold">{data.channel?.verified ? data.channel.displayName : "Messenger"}</h2><p className="text-sm text-[var(--inbox-muted,#696C67)]">{data.settings.paused ? "Replies paused" : modeLabels[data.settings.mode]} · {data.channel?.verified ? "Channel verified" : "Messaging access unverified"}</p></div></div><div className="flex flex-wrap items-center gap-2">{refreshControl}<button type="button" onClick={pause} disabled={controlPending || data.settings.mode === "OFF" || data.settings.paused} className={cn(buttonClass, "border border-[var(--inbox-line,#E1E3DE)] bg-white hover:bg-[var(--inbox-soft,#F5F6F3)]")}><Pause className="h-4 w-4" aria-hidden="true" />Pause replies</button><InboxSettings key={`${identity.businessId}:${identity.userId}`} data={data} onSave={settingsSave} redesign={redesign} fontClassName={fontClassName} disabled={controlPending} /></div></div>
      {controlError ? <p role="alert" className="mt-3 text-sm font-semibold text-[#C74248]">{controlError}</p> : null}
      {data.setupStatus !== "READY" ? <div className="mt-4 border-t border-[var(--inbox-line,#ECEEE9)] pt-4"><h3 className="text-sm font-bold">Messaging setup required</h3><p className="mt-1 text-sm leading-6 text-[var(--inbox-muted,#696C67)]">A publishing connection does not grant inbox access. Automatic replies stay unavailable until the checks below are verified.</p><ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{readinessItems.map((item) => { const ready = !item.reasons.some((reason) => data.readinessReasons.includes(reason)); return <li key={item.label} className="flex items-start gap-2 rounded-[12px] bg-[var(--inbox-soft,#F7F8F5)] p-3">{ready ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--inbox-positive,#3D791E)]" aria-hidden="true" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--inbox-muted,#696C67)]" aria-hidden="true" />}<div><p className="text-sm font-semibold">{item.label}</p><p className="text-xs text-[var(--inbox-muted,#696C67)]">{ready ? "Verified" : "Needs verification"}</p></div></li>; })}</ul></div> : null}
    </section>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className={cn(panelClass, selectedId && selectedExists ? "hidden lg:block" : "")} aria-labelledby="inbox-conversations"><header className="flex items-center justify-between border-b border-[var(--inbox-line,#ECEEE9)] p-5"><div><h2 id="inbox-conversations" className="text-base font-bold">Conversations</h2><p className="mt-1 text-xs text-[var(--inbox-muted,#696C67)]">Read status unavailable</p></div><span className="text-sm text-[var(--inbox-muted,#696C67)]">{data.conversations.length}</span></header>{data.conversations.length ? <InboxScrollArea label="Conversation list"><ul className="p-2">{data.conversations.map((conversation) => <li key={conversation.id}><button type="button" ref={(node) => { if (node) conversationButtons.current.set(conversation.id, node); else conversationButtons.current.delete(conversation.id); }} aria-pressed={selectedId === conversation.id} onClick={() => { setSelectedId(conversation.id); setControlError(null); }} className={cn("flex min-h-[88px] w-full cursor-pointer items-start gap-3 rounded-[16px] p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--inbox-focus,#72CF35)] motion-reduce:transition-none", selectedId === conversation.id ? "bg-[var(--inbox-selected,#EFF9E8)]" : "hover:bg-[var(--inbox-soft,#F7F8F5)]")}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--inbox-soft,#F1F2EF)]"><UserRound className="h-4 w-4 text-[var(--inbox-muted,#696C67)]" aria-hidden="true" /></span><span className="min-w-0"><span className="block break-words text-base font-semibold">{conversation.title}</span><span className="mt-1 block text-xs text-[var(--inbox-muted,#696C67)]">{formattedTime(conversation.lastActivityAt)}</span><span className="mt-1 block text-xs font-semibold">{conversation.optedOut ? "Automation opted out" : conversation.takeover || conversation.status === "HUMAN" ? "Human review" : "Open"}</span></span></button></li>)}</ul></InboxScrollArea> : <div className="grid min-h-[360px] place-items-center p-6 text-center"><div><MessageCircle className="mx-auto h-6 w-6 text-[var(--inbox-muted,#696C67)]" aria-hidden="true" /><h3 className="mt-3 text-base font-semibold">No customer conversations</h3><p className="mt-2 text-sm leading-6 text-[var(--inbox-muted,#696C67)]">{data.setupStatus === "READY" ? "New Messenger messages will appear here." : "Verified Messenger messages will appear after inbox setup."}</p></div></div>}</section>
      <section className={cn(panelClass, !selectedId || !selectedExists ? "hidden lg:block" : "")} aria-label="Conversation details">
        {!selectedId || !selectedExists ? <div className="grid min-h-[450px] place-items-center p-6 text-center"><div><MessageCircle className="mx-auto h-7 w-7 text-[var(--inbox-muted,#696C67)]" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">Select a conversation</h2><p className="mt-2 text-sm text-[var(--inbox-muted,#696C67)]">Review messages, proposed replies, and human takeover.</p></div></div> : <><header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--inbox-line,#ECEEE9)] p-4 sm:p-5"><div className="flex min-w-0 items-center gap-2"><button type="button" aria-label="Back to conversations" onClick={() => setSelectedId(null)} className={cn(buttonClass, "h-11 w-11 px-0 lg:hidden")}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button><h2 ref={conversationHeading} tabIndex={-1} className="min-w-0 break-words rounded text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-[var(--inbox-focus,#72CF35)]">{data.conversations.find((conversation) => conversation.id === selectedId)?.title ?? "Conversation"}</h2></div>{detail.data ? <button type="button" onClick={takeover} disabled={controlPending || detail.data.conversation.optedOut} className={cn(buttonClass, "bg-[var(--inbox-accent,#20211F)] text-white hover:bg-[var(--inbox-accent-hover,#343633)]")}><UserRound className="h-4 w-4" aria-hidden="true" />{detail.data.conversation.takeover ? "Release takeover" : "Take over"}</button> : null}</header>{!detail.data ? <div className="min-h-[360px] p-5">{detail.isPending ? <div role="status" aria-label="Loading conversation" className="h-24 w-3/4 rounded-[16px] bg-[var(--inbox-soft,#F5F6F3)] motion-safe:animate-pulse" /> : <div role="alert"><p className="text-base text-[var(--inbox-muted,#696C67)]">Conversation unavailable.</p><button type="button" className={buttonClass} onClick={() => { void refreshTeamQueries(queryClient, detailKey); }}>Retry conversation</button></div>}</div> : <ConversationMessages key={selectedId} detail={detail.data} />}</>}
      </section>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[var(--inbox-soft,#F1F2EF)] p-4"><p className="max-w-2xl text-sm leading-6 text-[var(--inbox-muted,#696C67)]">When enabled, replies answer public service questions after two minutes without a human reply. Booking changes, payments, private records, and medical advice require a person.</p><OwnerConversationAssistant businessSlug={identity.businessSlug} redesign={redesign} fontClassName={fontClassName} /></div>
  </div>;
}

function ConversationMessages({ detail }: { detail: InboxConversationDetail }) {
  return <div className="space-y-4 p-4 sm:p-5"><div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-[var(--inbox-soft,#F1F2EF)] px-3 py-2">{deliveryLabels[detail.deliveryTruth]}</span>{detail.conversation.takeover ? <span className="rounded-full bg-[var(--inbox-selected,#EFF9E8)] px-3 py-2 text-[var(--inbox-positive,#315E18)]">Human takeover · automatic replies stopped</span> : null}{detail.conversation.optedOut ? <span className="rounded-full bg-[var(--inbox-soft,#F1F2EF)] px-3 py-2">Customer opted out · automatic replies stopped</span> : null}</div><InboxScrollArea label="Message history" messages resetKey={detail.conversation.id}><ol className="space-y-3 pr-2" aria-label="Recent messages">{detail.messages.map((message) => <li key={message.id} className={cn("max-w-[92%] rounded-[16px] p-4 sm:max-w-[85%]", message.direction === "INBOUND" ? "mr-auto bg-[var(--inbox-soft,#F5F6F3)]" : "ml-auto bg-[var(--inbox-selected,#EFF9E8)]")}><p className="mb-2 text-xs font-semibold text-[var(--inbox-muted,#696C67)]">{message.direction === "INBOUND" ? "Customer" : "Business"}</p><p className="whitespace-pre-wrap break-words text-base leading-6 [overflow-wrap:anywhere]">{message.text ?? "Message text expired or unavailable."}</p><p className="mt-2 text-xs leading-5 text-[var(--inbox-muted,#696C67)]">{formattedTime(message.occurredAt)}{message.direction === "OUTBOUND" ? ` · ${deliveryLabels[message.deliveryStatus]}` : ""}</p></li>)}</ol></InboxScrollArea>{!detail.messages.length ? <p className="py-8 text-center text-base text-[var(--inbox-muted,#696C67)]">No retained message text.</p> : null}{detail.draft ? <section className="rounded-[16px] border border-[var(--inbox-line,#DDE1D8)] p-4" aria-labelledby="inbox-proposed"><h3 id="inbox-proposed" className="text-sm font-bold">Proposed reply · not sent</h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-6 [overflow-wrap:anywhere]">{detail.draft.text}</p><p className="mt-2 text-xs text-[var(--inbox-muted,#696C67)]">{formattedTime(detail.draft.createdAt)}</p></section> : null}<p className="border-t border-[var(--inbox-line,#ECEEE9)] pt-4 text-sm leading-6 text-[var(--inbox-muted,#696C67)]">Reply in Messenger while you handle this conversation. A proposed reply is not send confirmation. A confirmed send means Messenger accepted or observed it; it does not confirm recipient delivery or reading. Unknown send outcomes need review before any resend.</p></div>;
}

function InboxSettings({ data, onSave, redesign, disabled, fontClassName }: { data: InboxData; redesign: boolean; disabled: boolean; fontClassName: string; onSave: (settings: MessagingSettings) => Promise<{ success: boolean; error?: string }> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [settings, setSettings] = useState<MessagingSettings>(data.settings);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const submitting = useRef(false);
  useEffect(() => () => { request.current += 1; }, []);
  function close(next: boolean) { if (submitting.current) return; if (!next) { request.current += 1; submitting.current = false; setOpen(false); setError(null); } }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const current = ++request.current;
    setError(null);
    startTransition(async () => {
      try {
        const response = await onSave(settings);
        if (request.current !== current) return;
        if (response.success) { submitting.current = false; close(false); }
        else setError(response.error ?? "Settings could not be saved. Please retry.");
      } catch { if (request.current === current) { setError("Settings could not be saved. Please retry."); toast.error("Settings could not be saved. Please retry."); } }
      finally { if (request.current === current) submitting.current = false; }
    });
  }
  return <><button type="button" disabled={disabled} data-catalog-focus="inbox-settings" onClick={() => { setSettings(data.settings); setError(null); setEditorSession(value => value + 1); setOpen(true); }} className={cn(buttonClass, "bg-[var(--inbox-accent,#20211F)] text-white hover:bg-[var(--inbox-accent-hover,#343633)]")}><Settings2 className="h-4 w-4" aria-hidden="true" />Inbox settings</button><CatalogDraftOverlay allowKeepDraft={false} busy={pending} key={editorSession} draftKey={JSON.stringify(settings)} onDiscard={() => {}} open={open} onOpenChange={close} title="Inbox settings" description="Choose when the assistant can help with Messenger conversations." restoreFocusKey="inbox-settings" className={redesign ? cn(inboxStyles.theme, inboxStyles.editor, fontClassName) : undefined}><InboxScrollArea editor label="Inbox settings fields"><form id={id} onSubmit={submit} className="space-y-5"><fieldset disabled={pending} className="space-y-2"><legend className="mb-2 text-sm font-bold">Reply mode</legend>{(["OFF", "SUGGEST", "AUTO"] as const).map((mode) => <label key={mode} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border p-3", settings.mode === mode ? "border-[var(--inbox-ink,#20211F)] bg-[var(--inbox-soft,#F7F8F5)]" : "border-[var(--inbox-line,#E1E3DE)]")}><input type="radio" name={`${id}-mode`} value={mode} checked={settings.mode === mode} disabled={mode !== "OFF" && (!data.aiEntitled || !settings.consent || !settings.aiConsent) || mode === "AUTO" && !data.canEnableAuto} onChange={() => setSettings({ ...settings, mode, paused: false })} className="h-4 w-4 shrink-0 accent-[var(--inbox-ink,#20211F)] focus-visible:outline-2 focus-visible:outline-[var(--inbox-focus,#72CF35)]" /><span className="min-w-0"><span className="block text-base font-semibold">{modeLabels[mode]}</span><span className="block text-sm text-[var(--inbox-muted,#696C67)]">{mode === "OFF" ? "No assistant suggestions or replies." : mode === "SUGGEST" ? "Prepare replies for review. Nothing is sent automatically." : "Reply after two minutes without a human reply, with verified safeguards."}</span></span></label>)}</fieldset>{!data.aiEntitled ? <p className="text-sm text-[var(--inbox-muted,#696C67)]">Your current plan does not include AI replies.</p> : null}{!data.canEnableAuto ? <p className="text-sm text-[var(--inbox-muted,#696C67)]">Automatic replies require verified permissions, webhook, worker, protected storage, and pilot checks.</p> : null}<section className="rounded-[16px] bg-[var(--inbox-soft,#F5F6F3)] p-4" aria-labelledby={`${id}-privacy`}><h3 id={`${id}-privacy`} className="text-sm font-bold">Message privacy</h3><p className="mt-2 text-sm leading-6 text-[var(--inbox-muted,#696C67)]">Incoming messages are used to answer public service, price, hours, and availability questions. Message text is encrypted and retained for up to 7 days. Minimal delivery metadata is retained for up to 30 days. A keyed stop-preference fingerprint remains while the channel is connected, including beyond 30 days, to honor opt-outs. It contains no message text or contact details.</p><label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 py-2"><input type="checkbox" checked={settings.consent} disabled={pending} onChange={(event) => setSettings({ ...settings, consent: event.target.checked, ...(!event.target.checked ? { mode: "OFF" as const, aiConsent: false } : {}) })} className="mt-1 h-4 w-4 shrink-0 accent-[var(--inbox-ink,#20211F)] focus-visible:outline-2 focus-visible:outline-[var(--inbox-focus,#72CF35)]" /><span className="text-base leading-6">Allow this inbox to process and retain customer messages for this purpose.</span></label><label className="flex min-h-11 cursor-pointer items-start gap-3 py-2"><input type="checkbox" checked={settings.aiConsent} disabled={pending || !data.aiEntitled || !settings.consent} onChange={(event) => setSettings({ ...settings, aiConsent: event.target.checked, ...(!event.target.checked ? { mode: "OFF" as const } : {}) })} className="mt-1 h-4 w-4 shrink-0 accent-[var(--inbox-ink,#20211F)] focus-visible:outline-2 focus-visible:outline-[var(--inbox-focus,#72CF35)]" /><span className="text-base leading-6">Allow customer message text to be processed by the external AI provider for reply suggestions.</span></label></section><p className="text-sm leading-6 text-[var(--inbox-muted,#696C67)]">Replies follow the customer’s explicit preference or clear language. Unclear messages receive a language clarification. Human takeover and customer opt-out stop automatic replies.</p>{settings.paused ? <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base"><input type="checkbox" checked={settings.paused} disabled={pending} onChange={(event) => setSettings({ ...settings, paused: event.target.checked })} className="h-4 w-4 accent-[var(--inbox-ink,#20211F)]" />Keep replies paused</label> : null}{error ? <p role="alert" className="text-sm font-semibold text-[#C74248]">{error}</p> : null}</form></InboxScrollArea><CatalogEditorFooter><CatalogEditorClose type="button" disabled={pending} className={cn(buttonClass, "border border-[var(--inbox-line,#E1E3DE)] bg-white hover:bg-[var(--inbox-soft,#F5F6F3)]")}>Cancel</CatalogEditorClose><button type="submit" form={id} disabled={pending} className={cn(buttonClass, "bg-[var(--inbox-accent,#20211F)] text-white hover:bg-[var(--inbox-accent-hover,#343633)]")}>{pending ? "Saving…" : "Save settings"}</button></CatalogEditorFooter></CatalogDraftOverlay></>;
}
