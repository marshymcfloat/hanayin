"use client";
import { conditionalSaleSchema, conditionalSaleSummary, matchesServiceRule, type ConditionalSale } from "@/features/catalog/offer-definitions";
import { ServiceRuleEditor } from "@/components/dashboard/owner-preview/ServiceRuleEditor";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";

import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Megaphone,
  Percent,
  Plus,
  Search,
  Ticket,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createOwnerSaleEventPreviewAction,
  deleteOwnerSaleEventPreviewAction,
  updateOwnerSaleEventPreviewAction,
} from "@/features/catalog/actions/owner-sale-event-preview";
import {
  publishSocialPostAction,
  retrySocialPostTargetAction,
} from "@/features/social/actions/social";
import { DiscountType, SocialPlatform } from "@/prisma/generated/prisma/enums";
import {
  canPublishLinkedSocialPost,
  filterOwnerSaleEventPreviewEvents,
  saleEventPreviewStatus,
  socialPostNeedsAttention,
  type OwnerSaleEventPreviewData,
  type OwnerSaleEventPreviewEvent,
  type OwnerSaleEventPreviewResult,
  type OwnerSaleEventPreviewStatus,
} from "@/features/catalog/types/owner-sale-event-preview";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OwnerSaleEventsStudy } from "@/components/dashboard/design-study/OwnerSaleEventsStudy";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import offers from "@/components/dashboard/design-study/owner-sale-events.module.css";

const SaleEventDesignContext = createContext<{ fontClassName: string; restoreFocus?: () => void } | null>(null);

const primaryButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#20211F] px-4 text-xs font-bold text-white outline-none transition-colors hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#E1E3DE] bg-white px-4 text-xs font-semibold text-[#555852] outline-none transition-colors hover:bg-[#F5F6F3] focus-visible:ring-3 focus-visible:ring-[#72CF35] disabled:cursor-not-allowed disabled:opacity-40";
const fieldClass =
  "mt-1.5 h-11 w-full rounded-[12px] border border-[#DDE0D9] bg-[#F8F9F6] px-3.5 text-sm text-[#20211F] outline-none placeholder:text-[#9A9D97] focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20";
const shell =
  "min-w-0 overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px]";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.06em] text-[#696C67]";
const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const numberFormatter = new Intl.NumberFormat("en-PH");

type Props = {
  result: OwnerSaleEventPreviewResult;
  redesign?: boolean;
  fontClassName?: string;
  onChanged?: (events?: OwnerSaleEventPreviewEvent[]) => void;
};
type Notice = { tone: "success" | "error"; text: string } | null;
type FormState = {
  conditionalRule?: ConditionalSale | null;
  expectedRevision?: number;
  id?: number;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  discountType: DiscountType;
  discountValue: string;
  slotLimit: string;
  serviceIds: number[];
  packageIds: number[];
  createSocialDraft: boolean;
  targetPlatforms: SocialPlatform[];
};

function toDateTimeLocal(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function initialForm(data: OwnerSaleEventPreviewData): FormState {
  const start = new Date(data.now);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    title: "",
    description: "",
    startDate: toDateTimeLocal(start),
    endDate: toDateTimeLocal(end),
    discountType: DiscountType.PERCENTAGE,
    discountValue: "10",
    slotLimit: "",
    serviceIds: [],
    packageIds: [],
    createSocialDraft: false,
    targetPlatforms: data.connectedPlatforms,
  };
}
function formForEvent(event: OwnerSaleEventPreviewEvent): FormState {
  return {
    conditionalRule: event.conditionalRule, expectedRevision: event.revision,
    id: event.id,
    title: event.title,
    description: event.description ?? "",
    startDate: toDateTimeLocal(event.startDate),
    endDate: toDateTimeLocal(event.endDate),
    discountType: event.discountType,
    discountValue: String(event.discountValue),
    slotLimit: event.slotLimit === null ? "" : String(event.slotLimit),
    serviceIds: event.services.map((item) => item.id),
    packageIds: event.packages.map((item) => item.id),
    createSocialDraft: false,
    targetPlatforms: [],
  };
}
function statusLabel(status: OwnerSaleEventPreviewStatus) {
  return status === "active"
    ? "Active"
    : status === "upcoming"
      ? "Upcoming"
      : "Ended";
}
function socialLabel(event: OwnerSaleEventPreviewEvent) {
  const post = event.socialPosts[0];
  if (!post) return "No linked draft";
  if (socialPostNeedsAttention(post)) return "Needs attention";
  if (post.status === "PUBLISHED") return "Published";
  if (post.status === "PUBLISHING") return "Publishing";
  if (post.status === "READY") return "Ready to publish";
  return "Draft";
}
function statusTone(status: OwnerSaleEventPreviewStatus | "social") {
  if (status === "active") return "bg-[#EFF9E8] text-[#315E18]";
  if (status === "social") return "bg-[#F1F2EF] text-[#62655F]";
  return status === "ended"
    ? "bg-[#FFF0F0] text-[#C74248]"
    : "bg-[#F1F2EF] text-[#62655F]";
}
function Status({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-1 text-[10px] font-semibold leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}
function Discount({ event }: { event: OwnerSaleEventPreviewEvent }) {
  return (
    <span className="font-mono text-lg font-semibold tracking-[-0.04em]">
      {event.discountType === DiscountType.PERCENTAGE
        ? `${numberFormatter.format(event.discountValue)}%`
        : `₱${numberFormatter.format(event.discountValue)}`}{" "}
      <span className="font-[var(--font-body)] text-[10px] font-medium tracking-normal text-[#696C67]">
        off
      </span>
    </span>
  );
}

export function OwnerSaleEventsPreview({ result, onChanged, redesign = false, fontClassName = "" }: Props) {
  const data = result.success ? result.data : null;
  const [events, setEvents] = useState<OwnerSaleEventPreviewEvent[]>(
    data?.events ?? [],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OwnerSaleEventPreviewStatus>(
    "all",
  );
  const [editor, setEditor] = useState<FormState | null>(null);
  const [details, setDetails] = useState<OwnerSaleEventPreviewEvent | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<OwnerSaleEventPreviewEvent | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const focusKey = useRef("create");
  function restoreFocus() {
    queueMicrotask(() => {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      const target = document.querySelector<HTMLElement>(`[data-sale-event-focus="${focusKey.current}"]`) ?? document.querySelector<HTMLElement>('[data-sale-event-focus="create"]');
      target?.focus();
    });
  }
  const [notice, setNotice] = useState<Notice>(
    result.success ? null : { tone: "error", text: result.error },
  );
  useEffect(() => {
    if (data && !mutationLock.current) setEvents(data.events);
  }, [data]);
  const visible = useMemo(
    () => filterOwnerSaleEventPreviewEvents(events, query, status),
    [events, query, status],
  );
  const metrics = useMemo(
    () => ({
      active: events.filter((event) => event.status === "active").length,
      upcoming: events.filter((event) => event.status === "upcoming").length,
      bookings: events.reduce((total, event) => total + event.bookings, 0),
      attention: events.reduce(
        (total, event) =>
          total + event.socialPosts.filter(socialPostNeedsAttention).length,
        0,
      ),
    }),
    [events],
  );
  function showNotice(tone: "success" | "error", text: string) {
    if (redesign) toast[tone](text);
    else setNotice({ tone, text });
  }
  function openCreate() {
    focusKey.current = "create";
    if (data && !mutationLock.current) setEditor(initialForm(data));
  }
  function openEdit(event: OwnerSaleEventPreviewEvent) {
    if (mutationLock.current || event.id < 0) return;
    focusKey.current = `event-${event.id}`;
    setDetails(null);
    setEditor(formForEvent(event));
  }
  function optimisticEvent(
    form: FormState,
    current?: OwnerSaleEventPreviewEvent,
  ): OwnerSaleEventPreviewEvent {
    const startDate = new Date(form.startDate).toISOString();
    const endDate = new Date(form.endDate).toISOString();
    return {
      id: current?.id ?? -Math.max(1, Date.now()),
      conditionalRule: form.conditionalRule ?? null, revision: (current?.revision ?? 0) + 1,
      title: form.title.trim(),
      description: form.description.trim() || null,
      startDate,
      endDate,
      status: saleEventPreviewStatus(
        startDate,
        endDate,
        new Date(data?.now ?? Date.now()),
      ),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      slotLimit: form.slotLimit ? Number(form.slotLimit) : null,
      bookings: current?.bookings ?? 0,
      services: (data?.availableServices ?? []).filter((item) =>
        form.serviceIds.includes(item.id),
      ),
      packages: (data?.availablePackages ?? []).filter((item) =>
        form.packageIds.includes(item.id),
      ),
      socialPosts: current?.socialPosts ?? [],
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !data || mutationLock.current) return;
    const form = editor;
    const discountValue = Number(form.discountValue);
    if (!form.title.trim()) return showNotice("error", "Add an event title.");
    if (!form.startDate || !form.endDate)
      return showNotice("error", "Start and end dates are required.");
    if (!Number.isFinite(Date.parse(form.startDate)) || !Number.isFinite(Date.parse(form.endDate)))
      return showNotice("error", "Enter valid start and end dates.");
    if (form.slotLimit && (!Number.isInteger(Number(form.slotLimit)) || Number(form.slotLimit) <= 0 || Number(form.slotLimit) > 2147483647))
      return showNotice("error", "Enter a positive whole-number slot limit.");
    if (new Date(form.endDate) < new Date(form.startDate))
      return showNotice("error", "End date must not precede start date.");
    if (
      !Number.isFinite(discountValue) ||
      discountValue < 0 ||
      (form.discountType === DiscountType.PERCENTAGE && discountValue > 100)
    )
      return showNotice("error", "Enter a valid discount value.");
    if (form.conditionalRule && (!conditionalSaleSchema.safeParse(form.conditionalRule).success || form.conditionalRule.groups.some(rule => !data.availableServices.some(service => matchesServiceRule(rule, { ...service, price: service.price ?? 0 }))))) return showNotice("error", "Choose two valid service groups with eligible services.");
    if (!form.conditionalRule && form.serviceIds.length === 0 && form.packageIds.length === 0)
      return showNotice("error", "Select at least one service or package.");
    const current = form.id
      ? events.find((item) => item.id === form.id)
      : undefined;
    const optimistic = optimisticEvent(form, current);
    mutationLock.current = true;
    const previous = events;
    setEvents((items) =>
      form.id
        ? items.map((item) => (item.id === form.id ? optimistic : item))
        : [optimistic, ...items],
    );
    setPending(form.id ? `update:${form.id}` : "create");
    setNotice(null);
    try {
      const input = {
        businessSlug: data.business.slug,
        conditionalRule: form.conditionalRule ?? null, expectedRevision: form.expectedRevision,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        startDate: new Date(form.startDate),
        endDate: new Date(form.endDate),
        discountType: form.discountType,
        discountValue,
        serviceIds: form.conditionalRule ? [] : form.serviceIds,
        packageIds: form.conditionalRule ? [] : form.packageIds,
        slotLimit: form.slotLimit ? Number(form.slotLimit) : null,
      };
      const response = form.id
        ? await updateOwnerSaleEventPreviewAction({ ...input, id: form.id })
        : await createOwnerSaleEventPreviewAction({
            ...input,
            createSocialDraft: form.createSocialDraft,
            targetPlatforms: form.targetPlatforms,
          });
      if (!response.success) {
        setEvents(previous);
        showNotice("error", response.error || "Sale event could not be saved.");
        return;
      }
      // The create action does not return a persisted ID. Remove the temporary
      // row until the authoritative query resolves, including on refetch failure.
      if (!form.id) setEvents(previous);
      setEditor(null);
      showNotice(
        "success",
        form.id ? "Sale event updated." : redesign ? "Sale event created." : "Sale event created. Refresh to see the saved offer.",
      );
      onChanged?.(
        form.id
          ? previous.map((item) => (item.id === form.id ? optimistic : item))
          : undefined,
      );
    } catch {
      setEvents(previous);
      showNotice(
        "error",
        "Sale event could not be saved. Your changes were rolled back.",
      );
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }
  async function confirmDelete() {
    if (!deleteTarget || !data || mutationLock.current) return;
    mutationLock.current = true;
    const target = deleteTarget;
    const previous = events;
    setEvents((items) => items.filter((item) => item.id !== target.id));
    setDeleteTarget(null);
    setDetails(null);
    setPending(`delete:${target.id}`);
    setNotice(null);
    try {
      const response = await deleteOwnerSaleEventPreviewAction(
        target.id,
        data.business.slug,
      );
      if (!response.success) {
        setEvents(previous);
        showNotice(
          "error",
          response.error || "Sale event could not be deleted.",
        );
        return;
      }
      showNotice("success", `${target.title} was deleted.`);
      onChanged?.(previous.filter((item) => item.id !== target.id));
    } catch {
      setEvents(previous);
      showNotice("error", "Sale event could not be deleted. It was restored.");
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }
  async function publish(postId: string) {
    if (!data || mutationLock.current) return;
    const post = events.flatMap((event) => event.socialPosts).find((item) => item.id === postId);
    if (!post || !canPublishLinkedSocialPost(post)) return;
    mutationLock.current = true;
    setPending(`publish:${postId}`);
    setNotice(null);
    try {
      const response = await publishSocialPostAction({
        businessSlug: data.business.slug,
        postId,
      });
      if (!response.success) {
        showNotice("error", response.error || "Publish request was rejected.");
        return;
      }
      showNotice(
        "success",
        "Publish request queued. The channel state will reconcile from the server.",
      );
      onChanged?.();
    } catch {
      showNotice(
        "error",
        "Publish request failed. No provider success was assumed.",
      );
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }
  async function retry(targetId: string) {
    if (!data || mutationLock.current) return;
    mutationLock.current = true;
    setPending(`retry:${targetId}`);
    setNotice(null);
    try {
      const response = await retrySocialPostTargetAction({
        businessSlug: data.business.slug,
        targetId,
      });
      if (!response.success) {
        showNotice("error", response.error || "Retry request was rejected.");
        return;
      }
      showNotice(
        "success",
        "Retry queued. The channel state will reconcile from the server.",
      );
      onChanged?.();
    } catch {
      showNotice("error", "Retry failed. No provider success was assumed.");
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  if (!data)
    return (
      <PreviewFrame businessSlug="" active="sale-events" redesign={redesign} fontClassName={fontClassName} restoreFocus={restoreFocus}>
        <section
          className="mx-auto mt-12 max-w-xl rounded-[26px] border border-[#F0C8C8] bg-white p-8 text-center shadow-[0_14px_38px_rgba(32,33,31,0.045)]"
          role="alert"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-[#C74248]" />
          <h1 className="mt-3 text-lg font-bold">
            Sale events are unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#696C67]">
            {notice?.text ?? "Refresh and try again."}
          </p>
        </section>
      </PreviewFrame>
    );
  return (
    <PreviewFrame businessSlug={data.business.slug} active="sale-events" redesign={redesign} fontClassName={fontClassName} restoreFocus={restoreFocus}>
      {redesign ? <OwnerSaleEventsStudy data={data} events={events} pending={pending} fontClassName={fontClassName} onCreate={openCreate} onEdit={openEdit} onDetails={event => { focusKey.current = `event-${event.id}`; setDetails(event); }} onDelete={event => { focusKey.current = `event-${event.id}`; setDeleteTarget(event); }} /> : <>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/owner-dashboard-preview/${data.business.slug}`}
            className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
          <p className="text-sm font-semibold text-[#696C67]">
            {data.business.name} · Offers & promotion
          </p>
          <h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">
            Sale events
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#696C67] sm:text-base">
            Manage offers, booking limits, and promotion from the live catalog.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={cn(primaryButton, "shrink-0 self-start sm:self-auto")}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create sale event
        </button>
      </header>
      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-5 rounded-[14px] px-3 py-2.5 text-sm font-semibold",
            notice.tone === "error"
              ? "bg-[#FFF0F0] text-[#C74248]"
              : "bg-[#EFF9E8] text-[#315E18]",
          )}
        >
          {notice.text}
        </p>
      ) : null}
      <section
        aria-label="Sale event overview"
        className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Metric
          label="Active offers"
          value={metrics.active}
          detail="Within their offer dates"
          icon={Percent}
          tone="lime"
        />
        <Metric
          label="Upcoming offers"
          value={metrics.upcoming}
          detail="Scheduled to start later"
          icon={CalendarDays}
          tone="neutral"
        />
        <Metric
          label="Bookings claimed"
          value={metrics.bookings}
          detail="Non-cancelled bookings"
          icon={Ticket}
          tone="dark"
        />
        <Metric
          label="Posts needing attention"
          value={metrics.attention}
          detail="Review delivery state"
          icon={Megaphone}
          tone="coral"
        />
      </section>
      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]">
        <section className={shell} aria-labelledby="offer-library-heading">
          <div className="border-b border-[#ECEEE9] p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="offer-library-heading"
                className="text-lg font-bold tracking-[-0.02em]"
              >
                Offer library
              </h2>
              <p className="text-xs text-[#696C67]">
                {visible.length} of {events.length} offers
              </p>
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_132px] gap-2">
              <label className="relative min-w-0">
                <span className="sr-only">Search sale events</span>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92958F]"
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search offers"
                  className={cn(fieldClass, "mt-0 pl-10")}
                />
              </label>
              <select
                aria-label="Filter sale events by status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as typeof status)
                }
                className={cn(fieldClass, "mt-0 px-3 text-xs font-semibold")}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="ended">Ended</option>
              </select>
            </div>
          </div>
          {visible.length ? (
            <ul className="divide-y divide-[#ECEEE9]">
              {visible.map((event) => (
                <OfferRow
                  key={event.id}
                  event={event}
                  pending={pending?.endsWith(String(event.id)) ?? false}
                  onDetails={() => setDetails(event)}
                  onEdit={() => openEdit(event)}
                  onDelete={() => setDeleteTarget(event)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              filtered={Boolean(query.trim() || status !== "all")}
              onClear={() => {
                setQuery("");
                setStatus("all");
              }}
              onCreate={openCreate}
              hasCatalog={
                data.availableServices.length + data.availablePackages.length >
                0
              }
            />
          )}
        </section>
        <aside
          className={cn(shell, "p-5")}
          aria-labelledby="promotion-health-heading"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#EFF9E8] text-[#4D8F24]">
              <Megaphone className="h-[17px] w-[17px]" aria-hidden="true" />
            </div>
            <h2
              id="promotion-health-heading"
              className="text-base font-bold tracking-tight"
            >
              Promotion health
            </h2>
          </div>
          <Status
            className={
              data.socialPublishingEnabled && data.connectedPlatforms.length
                ? "bg-[#EFF9E8] text-[#315E18]"
                : "bg-[#FFF0F0] text-[#C74248]"
            }
          >
            {data.socialPublishingEnabled && data.connectedPlatforms.length
              ? "Social ready"
              : "Social setup needed"}
          </Status>
          <p className="mt-4 text-sm leading-6 text-[#696C67]">
            {data.socialPublishingEnabled && data.connectedPlatforms.length
              ? `${data.connectedPlatforms.length} connected channel${data.connectedPlatforms.length === 1 ? "" : "s"} available for linked drafts.`
              : data.socialPublishingEnabled
                ? "Connect Facebook or Instagram before preparing a social draft."
                : "Social drafts require the enabled social plan and a connected channel."}
          </p>
          <dl className="mt-5 space-y-3 rounded-[16px] bg-[#F7F8F5] p-3.5">
            <div className="flex justify-between gap-2">
              <dt className="text-xs text-[#696C67]">Active offers</dt>
              <dd className="font-mono text-xs font-semibold">
                {metrics.active}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-xs text-[#696C67]">Upcoming offers</dt>
              <dd className="font-mono text-xs font-semibold">
                {metrics.upcoming}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-[#E7E9E4] pt-3">
              <dt className="text-xs text-[#696C67]">Needs attention</dt>
              <dd className="font-mono text-xs font-semibold text-[#C74248]">
                {metrics.attention}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      </>}
      <EventEditor
        data={data}
        form={editor}
        pending={Boolean(
          pending?.startsWith("create") || pending?.startsWith("update"),
        )}
        onChange={setEditor}
        onSubmit={submit}
      />
      <EventDetails
        event={details ? events.find(event => event.id === details.id) ?? null : null}
        pending={pending}
        onClose={() => setDetails(null)}
        onEdit={() => details && openEdit(details)}
        onDelete={() => details && setDeleteTarget(details)}
        onPublish={publish}
        onRetry={retry}
      />
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={redesign ? event => { event.preventDefault(); restoreFocus(); } : undefined} className={cn("rounded-[22px] border-[#E1E3DE]", redesign && styles.editor, redesign && offers.dialog, fontClassName)}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.title ?? "sale event"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the sale event. Linked social posts are retained by
              the backend, but the event link may be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={redesign ? styles.secondary : secondaryButton}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={Boolean(pending)}
              className={cn(primaryButton, "bg-[#C74248] hover:bg-[#A83139]")}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PreviewFrame>
  );
}

function PreviewFrame({
  children,
  redesign,
  fontClassName = "",
  restoreFocus,
}: {
  businessSlug: string;
  active: "sale-events";
  restoreFocus?: () => void;
  redesign?: boolean;
  fontClassName?: string;
  children: ReactNode;
}) {
  if (redesign) return <SaleEventDesignContext.Provider value={{ fontClassName, restoreFocus }}>{children}</SaleEventDesignContext.Provider>;
  return (
    <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]">
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
        {children}
      </div>
    </main>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: "lime" | "neutral" | "dark" | "coral";
}) {
  return (
    <article className="min-w-0 rounded-[26px] border border-white bg-white p-4 shadow-[0_14px_38px_rgba(32,33,31,0.045)] lg:p-[18px]">
      <div
        className={cn(
          "grid h-9 w-9 place-items-center rounded-[12px]",
          tone === "dark"
            ? "bg-[#20211F] text-white"
            : tone === "coral"
              ? "bg-[#FFF0F0] text-[#C74248]"
              : tone === "lime"
                ? "bg-[#EFF9E8] text-[#4D8F24]"
                : "bg-[#F0F1EE] text-[#424440]",
        )}
      >
        <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-xs font-semibold text-[#696C67]">{label}</h2>
      <p className="mt-2 font-mono text-[clamp(1.6rem,2.15vw,2.1rem)] font-semibold leading-none tracking-[-0.055em]">
        {value}
      </p>
      <p className="mt-2.5 text-[11px] leading-4 text-[#696C67]">{detail}</p>
    </article>
  );
}
function OfferRow({
  event,
  pending,
  onDetails,
  onEdit,
  onDelete,
}: {
  event: OwnerSaleEventPreviewEvent;
  pending: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      aria-busy={pending || undefined}
      className={cn(
        "p-4 transition-colors hover:bg-[#FAFBF8] sm:p-5",
        pending && "bg-[#F8FBEF] opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold sm:text-[15px]">{event.title}</h3>
            <Status className={statusTone(event.status)}>
              {statusLabel(event.status)}
            </Status>
            {pending ? (
              <Status className="bg-[#EAF1FF] text-[#2D5AA6]">Saving…</Status>
            ) : null}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#696C67]">
            {event.description || "No description provided."}
          </p>
        </div>
        <div className="shrink-0">
          <Discount event={event} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...event.services, ...event.packages].slice(0, 3).map((item) => (
          <span
            key={`${item.id}-${item.name}`}
            className="max-w-full rounded-full border border-[#E1E3DE] bg-[#F8F9F6] px-2 py-1 text-[10px] font-medium leading-4 text-[#62655F]"
          >
            {item.name}
          </span>
        ))}
        {event.services.length + event.packages.length > 3 ? (
          <span className="rounded-full border border-[#E1E3DE] bg-[#F8F9F6] px-2 py-1 text-[10px] font-medium">
            +{event.services.length + event.packages.length - 3} more
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] bg-[#F7F8F5] p-3 sm:grid-cols-[1fr_1fr_1.2fr] sm:bg-transparent sm:p-0">
        <div>
          <p className={labelClass}>Offer dates</p>
          <p className="mt-1.5 text-xs font-semibold leading-5">
            {dateFormatter.format(new Date(event.startDate))} –{" "}
            {dateFormatter.format(new Date(event.endDate))}
          </p>
        </div>
        <div>
          <p className={cn(labelClass, "mb-1.5")}>Capacity</p>
          <p className="text-xs font-semibold">
            <span className="font-mono">
              {event.bookings}
              {event.slotLimit !== null ? ` / ${event.slotLimit}` : ""}
            </span>{" "}
            <span className="font-normal text-[#696C67]">bookings</span>
          </p>
          {event.slotLimit !== null ? (
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-[#E7E9E4]"
              role="progressbar"
              aria-label={`${event.title} booking slots claimed`}
              aria-valuemin={0}
              aria-valuemax={event.slotLimit}
              aria-valuenow={Math.min(event.bookings, event.slotLimit)}
            >
              <div
                className="h-full rounded-full bg-[#72CF35]"
                style={{
                  width: `${Math.min(100, (event.bookings / event.slotLimit) * 100)}%`,
                }}
              />
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-[#696C67]">No slot limit</p>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className={cn(labelClass, "mb-2")}>Social post</p>
          <Status
            className={
              socialLabel(event) === "Needs attention"
                ? "bg-[#FFF0F0] text-[#C74248]"
                : socialLabel(event) === "Published"
                  ? "bg-[#EFF9E8] text-[#315E18]"
                  : statusTone("social")
            }
          >
            {socialLabel(event)}
          </Status>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#ECEEE9] pt-2">
        <p className="text-[11px] text-[#696C67]">
          {event.services.length} services · {event.packages.length} packages
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className={cn(secondaryButton, "min-h-10 px-3")}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${event.title}`}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-full text-[#696C67] outline-none hover:bg-[#FFF0F0] hover:text-[#C74248] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDetails}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#20211F] outline-none hover:bg-[#F5F6F3] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
          >
            Details
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
function EmptyState({
  filtered,
  onClear,
  onCreate,
  hasCatalog,
}: {
  filtered: boolean;
  onClear: () => void;
  onCreate: () => void;
  hasCatalog: boolean;
}) {
  return (
    <div className="px-6 py-14 text-center sm:py-16">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#EFF9E8] text-[#4D8F24]">
        <Percent className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-base font-bold">
        {filtered
          ? "No matching sale events"
          : hasCatalog
            ? "Your first offer starts here"
            : "Catalog items are needed first"}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#696C67]">
        {filtered
          ? "Try another search or status filter."
          : hasCatalog
            ? "Create an offer from services or packages already in your catalog."
            : "Add a service or package before creating a sale event."}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClear}
          className={cn(secondaryButton, "mt-5")}
        >
          Clear filters
        </button>
      ) : hasCatalog ? (
        <button
          type="button"
          onClick={onCreate}
          className={cn(primaryButton, "mt-5")}
        >
          Create sale event
        </button>
      ) : null}
    </div>
  );
}

function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const design = useContext(SaleEventDesignContext);
  const fontClassName = design?.fontClassName ?? null;
  return (
    <DialogContent
      showCloseButton={false}
      onCloseAutoFocus={design ? event => { event.preventDefault(); design.restoreFocus?.(); } : undefined}
      className={cn(fontClassName !== null && styles.editor, fontClassName !== null && offers.dialog, fontClassName, "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] border-[#E1E3DE] bg-white p-0 text-[#20211F] shadow-[0_28px_80px_rgba(23,24,23,0.24)] sm:max-w-[760px]")}
    >
      <DialogHeader className="relative shrink-0 border-b border-[#ECEEE9] px-5 py-4 pr-16 text-left">
        <DialogTitle className="text-lg font-bold tracking-[-0.025em]">
          {title}
        </DialogTitle>
        <DialogDescription className="mt-1 text-xs leading-5 text-[#696C67]">
          {description}
        </DialogDescription>
        <DialogClose asChild>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute right-2 top-3 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#696C67] outline-none hover:bg-[#F5F6F3] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </DialogClose>
      </DialogHeader>
      {children}
    </DialogContent>
  );
}

function EventScroll({ children }: { children: ReactNode }) {
  return <ScrollArea type="scroll" scrollHideDelay={800} className={offers.scroll} ref={node => {
    const viewport = node?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) { viewport.tabIndex = 0; viewport.setAttribute("aria-label", "Sale event content"); }
  }}>{children}</ScrollArea>;
}

function EventEditor({
  data,
  form,
  pending,
  onChange,
  onSubmit,
}: {
  data: OwnerSaleEventPreviewData;
  form: FormState | null;
  pending: boolean;
  onChange: (form: FormState | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const design = useContext(SaleEventDesignContext);
  const fontClassName = design?.fontClassName ?? null;
  const [catalogSearch, setCatalogSearch] = useState("");
  const matchesCatalog = (item: { name: string; category: string }) => !design || `${item.name} ${item.category}`.toLowerCase().includes(catalogSearch.trim().toLowerCase());
  if (!form) return null;
  const update = (patch: Partial<FormState>) => onChange({ ...form, ...patch });
  const toggle = (
    key: "serviceIds" | "packageIds" | "targetPlatforms",
    value: number | SocialPlatform,
  ) => {
    const values = form[key] as Array<number | SocialPlatform>;
    const next = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
    update({ [key]: next } as Partial<FormState>);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onChange(null);
      }}
    >
      <ModalShell
        title={form.id ? "Edit sale event" : "Create sale event"}
        description="Choose the dates, discount, and services included. You can also prepare a social post."
        onClose={() => {
          if (!pending) onChange(null);
        }}
      >
        <EventScroll>
        <form
          id="sale-event-form"
          onSubmit={onSubmit}
          className="p-5"
        >
          <fieldset disabled={pending} className={offers.fields}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-xs font-semibold text-[#555852]">
              Event title
              <input
                required
                value={form.title}
                onChange={(event) => update({ title: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="sm:col-span-2 text-xs font-semibold text-[#555852]">
              Description
              <textarea
                value={form.description}
                onChange={(event) =>
                  update({ description: event.target.value })
                }
                className={cn(fieldClass, "h-24 resize-none py-3")}
              />
            </label>
            <label className="text-xs font-semibold text-[#555852]">
              Bookings open from
              <input
                required
                type="datetime-local"
                value={form.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-semibold text-[#555852]">
              Bookings open until
              <input
                required
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => update({ endDate: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-semibold text-[#555852]">
              Discount type
              <Select value={form.discountType} onValueChange={value => update({ discountType: value as DiscountType })} disabled={pending}>
                <SelectTrigger className={fontClassName !== null ? styles.categorySelect : fieldClass} aria-label="Discount type"><SelectValue /></SelectTrigger>
                <SelectContent className={cn(fontClassName !== null && styles.menu, fontClassName)}><SelectItem value={DiscountType.PERCENTAGE}>Percentage</SelectItem><SelectItem value={DiscountType.FLAT}>Fixed amount</SelectItem></SelectContent>
              </Select>
            </label>
            <label className="text-xs font-semibold text-[#555852]">
              Discount value
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.discountValue}
                onChange={(event) =>
                  update({ discountValue: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-semibold text-[#555852]">
              Slot limit{" "}
              <span className="font-normal text-[#696C67]">optional</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.slotLimit}
                onChange={(event) => update({ slotLimit: event.target.value })}
                className={fieldClass}
                placeholder="Unlimited"
              />
            </label>
          </div>
          <AnimatedFilterGroup label="Sale type" className="relative my-4 flex flex-wrap gap-1 rounded-xl bg-[#F1EAF8] p-1">{([false, true] as const).map(conditional => <button key={String(conditional)} type="button" aria-pressed={Boolean(form.conditionalRule) === conditional} className="relative z-10 min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold" onClick={() => update({ conditionalRule: conditional ? { version: 1, groups: [{ kind: "SERVICES", serviceIds: [] }, { kind: "SERVICES", serviceIds: [] }], target: "BOTH" } : null })}>{conditional ? "Book together" : "Standard sale"}</button>)}</AnimatedFilterGroup>
          {form.conditionalRule && <div className="grid gap-4">{form.conditionalRule.groups.map((rule, index) => <ServiceRuleEditor key={index} label={index === 0 ? "First service group" : "Second service group"} rule={rule} services={data.availableServices} fontClassName={fontClassName ?? ""} onChange={next => { if (!form.conditionalRule) return; const groups: ConditionalSale["groups"] = [...form.conditionalRule.groups]; groups[index] = next; update({ conditionalRule: { ...form.conditionalRule, groups } }); }} />)}<label className="grid gap-2 text-sm">Discount applies to<Select value={form.conditionalRule.target} onValueChange={target => { if (form.conditionalRule) update({ conditionalRule: { ...form.conditionalRule, target: target as ConditionalSale["target"] } }); }}><SelectTrigger className={styles.categorySelect}><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName ?? ""}`}><SelectItem value="BOTH">Both services</SelectItem><SelectItem value="FIRST">First group only</SelectItem><SelectItem value="SECOND">Second group only</SelectItem></SelectContent></Select></label><p className="rounded-2xl bg-[#F4EDF9] p-4 text-sm leading-6">{conditionalSaleSummary(form.conditionalRule, form.discountType, Number(form.discountValue) || 0)}</p></div>}
          {!form.conditionalRule && <fieldset className="mt-5 rounded-[16px] border border-[#E1E3DE] p-4">
            <legend className="px-1 text-xs font-bold">Applies to</legend>
            <p className="mb-3 text-xs text-[#696C67]">
              Select at least one service or package.
            </p>
            {design && <div className="mb-4"><label className="grid gap-2 text-xs">Search services and packages<input className={fieldClass} value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="Search by name or category…"/></label><p className="mt-2 text-xs" role="status">{form.serviceIds.length} services · {form.packageIds.length} packages selected. Searching keeps your selections.</p>{!data.availableServices.some(matchesCatalog) && !data.availablePackages.some(matchesCatalog) && <p className="mt-2 text-xs">No matching services or packages.</p>}</div>}
            {data.availableServices.length ? (
              <div>
                <p className={labelClass}>Services</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {data.availableServices.filter(matchesCatalog).map((item) => (
                    <label
                      key={item.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-2 text-sm hover:bg-[#F7F8F5]"
                    >
                      <input
                        type="checkbox"
                        checked={form.serviceIds.includes(item.id)}
                        onChange={() => toggle("serviceIds", item.id)}
                        className="h-4 w-4 accent-[#20211F]"
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#C74248]">
                No services are available.
              </p>
            )}
            {data.availablePackages.length ? (
              <div className="mt-4 border-t border-[#ECEEE9] pt-4">
                <p className={labelClass}>Packages</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {data.availablePackages.filter(matchesCatalog).map((item) => (
                    <label
                      key={item.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-2 text-sm hover:bg-[#F7F8F5]"
                    >
                      <input
                        type="checkbox"
                        checked={form.packageIds.includes(item.id)}
                        onChange={() => toggle("packageIds", item.id)}
                        className="h-4 w-4 accent-[#20211F]"
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 border-t border-[#ECEEE9] pt-4 text-xs text-[#696C67]">
                No packages are available.
              </p>
            )}
          </fieldset>
          }
          {!form.id ? (
            <fieldset className="mt-4 rounded-[16px] border border-[#E1E3DE] p-4">
              <legend className="px-1 text-xs font-bold">
                Linked social draft
              </legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={form.createSocialDraft}
                  disabled={
                    !data.socialPublishingEnabled ||
                    data.connectedPlatforms.length === 0
                  }
                  onChange={(event) =>
                    update({ createSocialDraft: event.target.checked })
                  }
                  className="h-4 w-4 accent-[#20211F]"
                />
                Prepare a draft for connected channels
              </label>
              <p className="mt-2 text-xs leading-5 text-[#696C67]">
                {!data.socialPublishingEnabled
                  ? "Social drafts require the enabled social plan."
                  : data.connectedPlatforms.length === 0
                    ? "No connected Facebook or Instagram channel is available."
                    : "The draft is created with the sale event and can be published after review."}
              </p>
              {form.createSocialDraft ? (
                <div className="mt-3 grid gap-1 sm:grid-cols-2">
                  {data.connectedPlatforms.map((platform) => (
                    <label
                      key={platform}
                      className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.targetPlatforms.includes(platform)}
                        onChange={() => toggle("targetPlatforms", platform)}
                        className="h-4 w-4 accent-[#20211F]"
                      />
                      {platform === SocialPlatform.FACEBOOK_PAGE
                        ? "Facebook Page"
                        : "Instagram Business"}
                    </label>
                  ))}
                </div>
              ) : null}
            </fieldset>
          ) : null}
          </fieldset>
        </form>
        </EventScroll>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[#ECEEE9] bg-[#FAFBF8] px-5 py-3">
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={pending}
            className={fontClassName !== null ? styles.secondary : secondaryButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="sale-event-form"
            disabled={pending}
            className={fontClassName !== null ? styles.primary : primaryButton}
          >
            {pending
              ? "Saving…"
              : form.id
                ? "Save changes"
                : "Create sale event"}
          </button>
        </div>
      </ModalShell>
    </Dialog>
  );
}

function EventDetails({
  event,
  pending,
  onClose,
  onEdit,
  onDelete,
  onPublish,
  onRetry,
}: {
  event: OwnerSaleEventPreviewEvent | null;
  pending: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const design = useContext(SaleEventDesignContext);
  if (!event) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalShell
        title={event.title}
        description={event.description || "Sale event details"}
        onClose={onClose}
      >
        <EventScroll><div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Discount event={event} />
            <Status className={statusTone(event.status)}>
              {statusLabel(event.status)}
            </Status>
          </div>
          <dl className="grid gap-4 rounded-[16px] bg-[#F7F8F5] p-4 sm:grid-cols-3">
            <div>
              <dt className={labelClass}>Starts</dt>
              <dd className="mt-2 text-xs font-semibold leading-5">
                {dateFormatter.format(new Date(event.startDate))}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Ends</dt>
              <dd className="mt-2 text-xs font-semibold leading-5">
                {dateFormatter.format(new Date(event.endDate))}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Capacity</dt>
              <dd className="mt-2 text-xs font-semibold">
                {event.bookings}
                {event.slotLimit !== null ? ` / ${event.slotLimit}` : ""}{" "}
                bookings
              </dd>
            </div>
          </dl>
          <section>
            <p className={labelClass}>Eligible catalog</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...event.services, ...event.packages].map((item) => (
                <span
                  key={`${item.id}-${item.name}`}
                  className="rounded-full border border-[#E1E3DE] bg-[#F8F9F6] px-2 py-1 text-[10px] font-medium"
                >
                  {item.name}
                </span>
              ))}
            </div>
          </section>
          <section className="border-t border-[#ECEEE9] pt-4">
            <h3 className="text-sm font-bold">Linked social drafts</h3>
            {event.socialPosts.length ? (
              <ul className="mt-3 space-y-3">
                {event.socialPosts.map((post) => (
                  <li key={post.id} className="rounded-[16px] bg-[#F7F8F5] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-bold">{post.title}</p>
                      <Status
                        className={
                          socialPostNeedsAttention(post)
                            ? "bg-[#FFF0F0] text-[#C74248]"
                            : post.status === "PUBLISHED"
                              ? "bg-[#EFF9E8] text-[#315E18]"
                              : "bg-[#F1F2EF] text-[#62655F]"
                        }
                      >
                        {socialLabel(event)}
                      </Status>
                    </div>
                    <p className="mt-2 text-xs text-[#696C67]">
                      {post.targets
                        .map((target) =>
                          target.platform === SocialPlatform.FACEBOOK_PAGE
                            ? "Facebook Page"
                            : "Instagram Business",
                        )
                        .join(" · ") || "No channels"}
                    </p>
                    {post.lastError ? (
                      <p className="mt-2 text-xs leading-5 text-[#C74248]">
                        {post.lastError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {socialPostNeedsAttention(post)
                        ? post.targets
                            .filter((target) => target.status === "FAILED")
                            .map((target) => (
                              <button
                                key={target.id}
                                type="button"
                                disabled={Boolean(pending)}
                                onClick={() => onRetry(target.id)}
                                className={design ? styles.secondary : secondaryButton}
                              >
                                {pending === `retry:${target.id}`
                                  ? "Retrying…"
                                  : "Retry channel"}
                              </button>
                            ))
                        : null}
                      {canPublishLinkedSocialPost(post) ? (
                        <button
                          type="button"
                          disabled={Boolean(pending)}
                          onClick={() => onPublish(post.id)}
                          className={design ? styles.secondary : secondaryButton}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          {pending === `publish:${post.id}`
                            ? "Queueing…"
                            : "Publish post"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-[16px] bg-[#F7F8F5] p-4 text-xs leading-5 text-[#696C67]">
                No social draft is linked to this offer.
              </p>
            )}
          </section>
        </div>
        </EventScroll>
        <div className="flex shrink-0 justify-between gap-2 border-t border-[#ECEEE9] bg-[#FAFBF8] px-5 py-3">
          <div className="flex gap-2">
            <button type="button" disabled={Boolean(pending)} onClick={onEdit} className={design ? styles.secondary : secondaryButton}>
              Edit
            </button>
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={onDelete}
              className={cn(design ? styles.secondary : secondaryButton, "text-[#C74248]")}
            >
              Delete
            </button>
          </div>
          <button type="button" onClick={onClose} className={design ? styles.primary : primaryButton}>
            Done
          </button>
        </div>
      </ModalShell>
    </Dialog>
  );
}
