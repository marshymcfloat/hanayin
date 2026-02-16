"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatPH } from "@/lib/date-utils";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/client";
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
    };
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

/**
 * Usage:
 * <OwnerServiceQueue
 *   businessSlug="my-biz"
 *   pendingServices={pendingServices}
 *   claimedServices={claimedServices}
 * />
 */
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
      queryClient.invalidateQueries({
        queryKey: pendingKey,
      }),
      queryClient.invalidateQueries({
        queryKey: claimedKey,
      }),
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
    } else {
      setPendingCache(previousPending);
      setClaimedCache(previousClaimed);
      toast.error(result.error || "Unable to claim service");
    }
  };

  const handleUnclaim = async (serviceId: number) => {
    const previousPending = getPendingCache();
    const previousClaimed = getClaimedCache();
    const target = previousClaimed.find((item) => item.id === serviceId);

    setAction(serviceId, "unclaim");
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
    } else {
      setPendingCache(previousPending);
      setClaimedCache(previousClaimed);
      toast.error(result.error || "Unable to unclaim service");
    }
  };

  const handleServe = async (serviceId: number) => {
    const previousClaimed = getClaimedCache();

    setAction(serviceId, "serve");
    setClaimedCache(previousClaimed.filter((item) => item.id !== serviceId));

    const result = await markServiceServedAsOwnerAction(serviceId);
    clearAction();

    if (result.success) {
      toast.success("Service marked as served");
      await refreshLists();
    } else {
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
    <Card
      className={cn(
        "flex flex-col overflow-hidden h-full",
        isEmbedded
          ? "border-0 shadow-none bg-transparent rounded-none"
          : "rounded-[32px] border-none shadow-lg shadow-zinc-200/50 bg-white",
        className,
      )}
    >
      <CardHeader
        className={cn("pb-2", isEmbedded ? "px-4 pt-4" : "md:px-8 md:pt-8")}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg sm:text-2xl font-bold tracking-tight text-zinc-900">
              Owner Queue
            </CardTitle>
            <CardDescription className="text-xs sm:text-base text-zinc-500 font-medium">
              Claim and serve customers as the owner.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="w-full sm:w-auto rounded-2xl h-10 sm:h-11 border-zinc-200 bg-zinc-50 font-medium text-xs sm:text-sm"
            disabled={isRefreshing}
          >
            <RefreshCcw
              className={cn(
                "h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2",
                isRefreshing && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          "flex-1 min-h-0 overflow-hidden p-0", // Adjusted for proper scrolling
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "pending" || value === "claimed") {
              setActiveTab(value);
            }
          }}
          className="h-full flex flex-col"
        >
          <div className={cn("px-4 sm:px-6", isEmbedded && "px-4")}>
            <TabsList className="w-full grid grid-cols-2 rounded-2xl bg-zinc-50 border border-zinc-100 p-1 shadow-sm h-12 overflow-hidden items-stretch">
              <TabsTrigger
                value="pending"
                className="rounded-xl h-full py-0 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm"
              >
                Pending
                <span className="ml-2 text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  {pendingServices.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="claimed"
                className="rounded-xl h-full py-0 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm"
              >
                My Claims
                <span className="ml-2 text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  {claimedServices.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div
              className={cn(
                "space-y-3 p-4 sm:p-6 pt-2",
                isEmbedded && "p-4 pt-4",
              )}
            >
              <TabsContent value="pending" className="mt-0 space-y-3 m-0">
                {pendingServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10 border-2 border-dashed border-zinc-100 rounded-2xl bg-white">
                    <div className="h-10 w-10 rounded-full bg-zinc-50 text-zinc-300 flex items-center justify-center">
                      <Inbox className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-zinc-900">
                      No pending services
                    </p>
                    <p className="text-xs text-zinc-500 max-w-[200px]">
                      The queue is clear for now.
                    </p>
                  </div>
                ) : (
                  pendingServices.map((item) => {
                    const isBusy =
                      actionState.id === item.id &&
                      actionState.type === "claim";
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-zinc-900 text-sm truncate">
                                {item.service.name}
                              </h4>
                              {item.package && (
                                <Badge
                                  variant="secondary"
                                  className="bg-zinc-100 text-zinc-700 border border-zinc-200 text-[9px] font-semibold h-4 px-1 shrink-0"
                                >
                                  {item.package.name}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500 font-medium truncate">
                              {item.booking.customer.name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400">
                              <span className="flex items-center gap-1 bg-zinc-50 text-zinc-600 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                <Clock className="h-3 w-3" />
                                {renderTime(getDisplayTime(item))}
                              </span>
                              {item.service.duration && (
                                <span className="whitespace-nowrap">
                                  {item.service.duration} mins
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="text-xs font-bold text-zinc-900 bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-100">
                              ₱{item.price.toLocaleString()}
                            </span>
                            <Button
                              size="sm"
                              className="h-9 min-h-[36px] w-[70px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200 text-xs"
                              onClick={() => handleClaim(item.id)}
                              disabled={isBusy}
                            >
                              {isBusy ? "..." : "Claim"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="claimed" className="mt-0 space-y-3 m-0">
                {claimedServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10 border-2 border-dashed border-zinc-100 rounded-2xl bg-zinc-50/60">
                    <div className="h-10 w-10 rounded-full bg-white text-zinc-300 flex items-center justify-center">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-zinc-900">
                      No claimed services
                    </p>
                    <p className="text-xs text-zinc-500 max-w-[200px]">
                      Claim pending services.
                    </p>
                  </div>
                ) : (
                  claimedServices.map((item) => {
                    const isServing =
                      actionState.id === item.id &&
                      actionState.type === "serve";
                    const isUnclaiming =
                      actionState.id === item.id &&
                      actionState.type === "unclaim";
                    const isUnserving =
                      actionState.id === item.id &&
                      actionState.type === "unserve";
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-zinc-900 text-sm truncate">
                                {item.service.name}
                              </h4>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0.5 rounded-md border-emerald-200 text-emerald-700 bg-emerald-50 shrink-0"
                              >
                                {item.status}
                              </Badge>
                              {item.package && (
                                <Badge
                                  variant="secondary"
                                  className="bg-zinc-100 text-zinc-700 border border-zinc-200 text-[9px] font-semibold h-4 px-1 shrink-0"
                                >
                                  {item.package.name}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500 font-medium truncate">
                              {item.booking.customer.name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400">
                              <span className="flex items-center gap-1 bg-zinc-50 text-zinc-600 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                <Clock className="h-3 w-3" />
                                {renderTime(getDisplayTime(item))}
                              </span>
                              {item.claimed_at && (
                                <span className="text-zinc-400 whitespace-nowrap">
                                  Claimed {formatPH(item.claimed_at, "h:mm a")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="text-xs font-bold text-zinc-900 bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-100">
                              ₱{item.price.toLocaleString()}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                className="h-9 min-h-[36px] w-[70px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200 text-xs"
                                onClick={() => handleServe(item.id)}
                                disabled={isServing}
                              >
                                {isServing ? "..." : "Serve"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 min-h-[36px] w-9 rounded-xl border-zinc-200 text-zinc-600 hover:text-zinc-900 p-0"
                                onClick={() =>
                                  item.status === "CLAIMED"
                                    ? handleUnclaim(item.id)
                                    : handleUnserve(item.id)
                                }
                                disabled={isUnclaiming || isUnserving}
                                title={
                                  item.status === "CLAIMED"
                                    ? "Unclaim"
                                    : "Undo Serve"
                                }
                              >
                                {isUnclaiming || isUnserving ? (
                                  <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                                ) : item.status === "CLAIMED" ? (
                                  <XCircle className="h-3.5 w-3.5" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}
