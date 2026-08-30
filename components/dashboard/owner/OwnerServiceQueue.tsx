"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatPH } from "@/lib/date-utils";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import {
  CheckCircle2,
  Clock,
  Inbox,
  RefreshCcw,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  claimServiceAsOwnerAction,
  getOwnerClaimedServicesAction,
  getPendingServicesAction,
  markServiceServedAsOwnerAction,
  unclaimServiceAsOwnerAction,
  unserveServiceAsOwnerAction,
} from "@/lib/server actions/dashboard";
import { ScrollArea } from "@/components/ui/scroll-area";

export type OwnerPendingService = {
  id: number;
  service: {
    name: string;
    duration: number | null;
  };
  booking: {
    customer: {
      name: string;
    } | null;
    is_anonymous_walk_in?: boolean | null;
    customer_label?: string | null;
    scheduled_at?: Date | null;
    created_at?: Date | null;
  };
  scheduled_at: Date | null;
  price: number;
  package_id: number | null;
  package: {
    name: string;
  } | null;
};

export type OwnerClaimedService = OwnerPendingService & {
  claimed_at: Date | null;
  status: AvailedServiceStatus;
};

type OwnerClaimedResponse =
  | { success: true; data: OwnerClaimedService[] }
  | { success: false; error: string };
type OwnerClaimedQueryResponse =
  | OwnerClaimedResponse
  | { success: boolean; error?: string; data?: OwnerClaimedService[] };

function isScheduleConflictDetails(
  value: unknown,
): value is { serviceName: string; scheduledAt: string } {
  if (!value || typeof value !== "object") return false;

  const details = value as Record<string, unknown>;
  return (
    typeof details.serviceName === "string" &&
    typeof details.scheduledAt === "string"
  );
}

export default function OwnerServiceQueue({
  businessSlug,
  pendingServices: initialPending,
  claimedServices: initialClaimed,
  className,
  variant = "card",
}: {
  businessSlug: string;
  pendingServices: OwnerPendingService[];
  claimedServices: OwnerClaimedService[];
  className?: string;
  variant?: "card" | "embedded";
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pending" | "claimed">("pending");
  const [actionState, setActionState] = useState<{
    id: number | null;
    type: "claim" | "serve" | "unclaim" | "unserve" | null;
  }>({ id: null, type: null });
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Track IDs being hidden optimistically so background refetches don't flash them back
  const [hiddenClaimedIds, setHiddenClaimedIds] = useState<Set<number>>(
    new Set(),
  );
  const [hiddenPendingIds, setHiddenPendingIds] = useState<Set<number>>(
    new Set(),
  );

  const hideClaimedId = (id: number) =>
    setHiddenClaimedIds((prev) => new Set([...prev, id]));
  const revealClaimedId = (id: number) =>
    setHiddenClaimedIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  const hidePendingId = (id: number) =>
    setHiddenPendingIds((prev) => new Set([...prev, id]));
  const revealPendingId = (id: number) =>
    setHiddenPendingIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  const pendingKey = ["owner-pending-services", businessSlug];
  const claimedKey = ["owner-claimed-services", businessSlug];

  const { data: pendingServices = [] } = useQuery({
    queryKey: pendingKey,
    queryFn: () => getPendingServicesAction(),
    initialData: initialPending,
    refetchInterval: 5000,
  });

  const { data: claimedResponse } = useQuery<OwnerClaimedQueryResponse>({
    queryKey: claimedKey,
    queryFn: () => getOwnerClaimedServicesAction(),
    initialData: { success: true, data: initialClaimed },
    refetchInterval: 5000,
  });

  const claimedServices = useMemo(() => {
    if (
      claimedResponse &&
      typeof claimedResponse === "object" &&
      "success" in claimedResponse &&
      "data" in claimedResponse &&
      claimedResponse.success &&
      Array.isArray(claimedResponse.data)
    ) {
      return claimedResponse.data;
    }
    return [];
  }, [claimedResponse]);

  const visiblePending = useMemo(
    () => pendingServices.filter((item) => !hiddenPendingIds.has(item.id)),
    [pendingServices, hiddenPendingIds],
  );

  const visibleClaimed = useMemo(
    () => claimedServices.filter((item) => !hiddenClaimedIds.has(item.id)),
    [claimedServices, hiddenClaimedIds],
  );

  const setAction = (id: number, type: typeof actionState.type) =>
    setActionState({ id, type });

  const clearAction = () => setActionState({ id: null, type: null });

  const getPendingCache = () =>
    queryClient.getQueryData<OwnerPendingService[]>(pendingKey) ??
    pendingServices;

  const getClaimedCache = () => {
    const cached = queryClient.getQueryData<OwnerClaimedResponse>(claimedKey);
    if (cached && cached.success) return cached.data;
    return claimedServices;
  };

  const setPendingCache = (items: OwnerPendingService[]) => {
    queryClient.setQueryData(pendingKey, items);
  };

  const setClaimedCache = (items: OwnerClaimedService[]) => {
    queryClient.setQueryData(claimedKey, { success: true, data: items });
  };

  const refreshLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: pendingKey }),
      queryClient.invalidateQueries({ queryKey: claimedKey }),
    ]);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshLists();
    setIsRefreshing(false);
  };

  const handleClaim = async (serviceId: number) => {
    const previousPending = getPendingCache();
    const previousClaimed = getClaimedCache();
    const target = previousPending.find((item) => item.id === serviceId);

    setAction(serviceId, "claim");
    hidePendingId(serviceId);
    if (target) {
      const optimisticClaim: OwnerClaimedService = {
        ...target,
        claimed_at: new Date(),
        status: "CLAIMED",
      };
      setPendingCache(previousPending.filter((item) => item.id !== serviceId));
      setClaimedCache([optimisticClaim, ...previousClaimed]);
      setActiveTab("claimed");
    }

    const result = await claimServiceAsOwnerAction(serviceId);
    clearAction();

    if (result.success) {
      toast.success("Service claimed");
      await refreshLists();
      revealPendingId(serviceId);
    } else {
      revealPendingId(serviceId);
      setPendingCache(previousPending);
      setClaimedCache(previousClaimed);
      if ("code" in result && result.code === "SCHEDULE_CONFLICT") {
        const conflict =
          "conflict" in result && isScheduleConflictDetails(result.conflict)
            ? result.conflict
            : null;
        const description = conflict
          ? `You already have ${conflict.serviceName} scheduled at ${formatPH(conflict.scheduledAt, "h:mm a")}. Finish, unclaim, reschedule, or reassign it first.`
          : result.error;
        toast.error("Schedule conflict", { description });
        await refreshLists();
      } else {
        toast.error("Unable to claim service", {
          description: result.error || "Please try again.",
        });
      }
    }
  };

  const handleUnclaim = async (serviceId: number) => {
    const previousPending = getPendingCache();
    const previousClaimed = getClaimedCache();
    const target = previousClaimed.find((item) => item.id === serviceId);

    setAction(serviceId, "unclaim");
    hideClaimedId(serviceId);
    if (target) {
      const pendingItem: OwnerPendingService = {
        id: target.id,
        service: target.service,
        booking: target.booking,
        scheduled_at: target.scheduled_at,
        price: target.price,
        package_id: target.package_id,
        package: target.package,
      };
      setClaimedCache(previousClaimed.filter((item) => item.id !== serviceId));
      setPendingCache([pendingItem, ...previousPending]);
    }

    const result = await unclaimServiceAsOwnerAction(serviceId);
    clearAction();

    if (result.success) {
      toast.success("Service returned to queue");
      await refreshLists();
      revealClaimedId(serviceId);
    } else {
      revealClaimedId(serviceId);
      setPendingCache(previousPending);
      setClaimedCache(previousClaimed);
      toast.error(result.error || "Unable to unclaim service");
    }
  };

  const handleServe = async (serviceId: number) => {
    const previousClaimed = getClaimedCache();

    setAction(serviceId, "serve");
    hideClaimedId(serviceId);
    setClaimedCache(previousClaimed.filter((item) => item.id !== serviceId));

    const result = await markServiceServedAsOwnerAction(serviceId);
    clearAction();

    if (result.success) {
      toast.success("Service marked as served");
      await refreshLists();
      revealClaimedId(serviceId);
    } else {
      revealClaimedId(serviceId);
      setClaimedCache(previousClaimed);
      toast.error(result.error || "Unable to mark service as served");
    }
  };

  const handleUnserve = async (serviceId: number) => {
    const previousClaimed = getClaimedCache();
    const target = previousClaimed.find((item) => item.id === serviceId);

    setAction(serviceId, "unserve");
    if (target) {
      setClaimedCache(
        previousClaimed.map((item) =>
          item.id === serviceId ? { ...item, status: "CLAIMED" } : item,
        ),
      );
    }

    const result = await unserveServiceAsOwnerAction(serviceId);
    clearAction();

    if (result.success) {
      toast.success("Service moved back to claimed");
      await refreshLists();
    } else {
      setClaimedCache(previousClaimed);
      toast.error(result.error || "Unable to revert service");
    }
  };

  const getDisplayTime = (item: OwnerPendingService | OwnerClaimedService) =>
    item.booking.scheduled_at ?? item.booking.created_at ?? item.scheduled_at;

  const renderTime = (date: Date | null | undefined) =>
    date ? formatPH(date, "h:mm a") : "Walk-in";

  const isEmbedded = variant === "embedded";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        !isEmbedded && "rounded-2xl border border-border shadow-sm bg-card",
        className,
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div>
          <p className="text-sm font-bold text-foreground leading-none">
            Queue
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide font-medium">
            Owner Service Queue
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="Refresh queue"
          className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
        >
          <RefreshCcw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
        </button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "pending" || value === "claimed") setActiveTab(value);
        }}
        className="flex flex-1 min-h-0 flex-col"
      >
        <div className="shrink-0 px-4 pb-2">
          <TabsList className="w-full grid grid-cols-2 rounded-xl bg-muted/60 p-1 h-8">
            <TabsTrigger
              value="pending"
              className="rounded-lg h-full text-[11px] font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm cursor-pointer"
            >
              Pending
              {visiblePending.length > 0 && (
                <span className="ml-1.5 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full tabular-nums">
                  {visiblePending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="claimed"
              className="rounded-lg h-full text-[11px] font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm cursor-pointer"
            >
              In Progress
              {visibleClaimed.length > 0 && (
                <span className="ml-1.5 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full tabular-nums">
                  {visibleClaimed.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-3 pb-4 space-y-1.5">
            {/* Pending Tab */}
            <TabsContent value="pending" className="mt-0 space-y-1.5 m-0">
              {visiblePending.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="h-4 w-4 text-muted-foreground" />}
                  message="Queue is clear"
                />
              ) : (
                visiblePending.map((item) => {
                  const isBusy =
                    actionState.id === item.id && actionState.type === "claim";
                  return (
                    <ServiceCard key={item.id}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate leading-tight">
                            {item.service.name}
                            {item.package && (
                              <span className="ml-1 text-[9px] font-medium text-muted-foreground">
                                ({item.package.name})
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {getBookingCustomerName(item.booking)}
                            {" · "}
                            <span className="inline-flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5 inline" />
                              {renderTime(getDisplayTime(item))}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold text-foreground tabular-nums">
                          ₱{item.price.toLocaleString()}
                        </span>
                        <Button
                          size="sm"
                          className="h-6 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                          onClick={() => handleClaim(item.id)}
                          disabled={isBusy}
                        >
                          {isBusy ? "..." : "Claim"}
                        </Button>
                      </div>
                    </ServiceCard>
                  );
                })
              )}
            </TabsContent>

            {/* Claimed Tab */}
            <TabsContent value="claimed" className="mt-0 space-y-1.5 m-0">
              {visibleClaimed.length === 0 ? (
                <EmptyState
                  icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
                  message="Nothing in progress"
                />
              ) : (
                visibleClaimed.map((item) => {
                  const isServing =
                    actionState.id === item.id && actionState.type === "serve";
                  const isUnclaiming =
                    actionState.id === item.id &&
                    actionState.type === "unclaim";
                  const isUnserving =
                    actionState.id === item.id &&
                    actionState.type === "unserve";
                  const isDone = item.status === "COMPLETED";
                  return (
                    <ServiceCard key={item.id}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0 mt-0.5",
                            isDone ? "bg-primary" : "bg-blue-400",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate leading-tight">
                            {item.service.name}
                          </p>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                            <span className="truncate">
                              {getBookingCustomerName(item.booking)}
                            </span>
                            <span>·</span>
                            <Badge
                              variant="outline"
                              className="text-[8px] px-1 border-primary/20 text-primary bg-primary/5 h-3.5 shrink-0"
                            >
                              {item.status}
                            </Badge>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-bold text-foreground tabular-nums">
                          ₱{item.price.toLocaleString()}
                        </span>
                        {!isDone && (
                          <Button
                            size="sm"
                            className="h-6 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                            onClick={() => handleServe(item.id)}
                            disabled={isServing}
                          >
                            {isServing ? "..." : "Done"}
                          </Button>
                        )}
                        <button
                          type="button"
                          className="h-6 w-6 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                          onClick={() =>
                            isDone
                              ? handleUnserve(item.id)
                              : handleUnclaim(item.id)
                          }
                          disabled={isUnclaiming || isUnserving}
                          title={isDone ? "Undo Serve" : "Unclaim"}
                        >
                          {isUnclaiming || isUnserving ? (
                            <RefreshCcw className="h-3 w-3 animate-spin" />
                          ) : isDone ? (
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </ServiceCard>
                  );
                })
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function ServiceCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 hover:border-primary/30 hover:bg-accent/30 transition-colors">
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 rounded-xl border-2 border-dashed border-border bg-background/50 mt-1">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center mb-2">
        {icon}
      </div>
      <p className="text-xs font-semibold text-foreground">{message}</p>
    </div>
  );
}
