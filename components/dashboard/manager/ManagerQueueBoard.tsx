"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { getManagerQueueBoardAction } from "@/features/dashboard/actions";
import {
  claimServiceAction,
  markServiceServedAction,
  unclaimServiceAction,
  unserveServiceAction,
} from "@/features/dashboard/actions";
import {
  ManagerQueueCard,
  QueueService,
  QueueEmployee,
} from "./ManagerQueueCard";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import { formatPH } from "@/lib/date-utils";

// Re-export types for compatibility if needed elsewhere, mapped to the new component types
export type ManagerQueueService = QueueService;
export type ManagerQueueEmployee = QueueEmployee;

export default function ManagerQueueBoard({
  businessSlug,
  initialServices,
  initialEmployees,
}: {
  businessSlug: string;
  initialServices: ManagerQueueService[];
  initialEmployees: ManagerQueueEmployee[];
}) {
  const queryClient = useQueryClient();
  const [assigneeByServiceId, setAssigneeByServiceId] = useState<
    Record<number, number>
  >({});
  const [busyServiceId, setBusyServiceId] = useState<number | null>(null);

  const queryKey = ["manager-queue-board", businessSlug];
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getManagerQueueBoardAction();
      if (!result.success || !("data" in result)) {
        return {
          services: [] as ManagerQueueService[],
          employees: [] as ManagerQueueEmployee[],
        };
      }
      return result.data;
    },
    initialData: {
      services: initialServices,
      employees: initialEmployees,
    },
    refetchInterval: 10_000,
  });

  const services = data?.services ?? initialServices;
  const employees = data?.employees ?? initialEmployees;

  // Split services into columns
  const columns = useMemo(() => {
    return {
      pending: services.filter(
        (service) => service.status === AvailedServiceStatus.PENDING,
      ),
      active: services.filter(
        (service) =>
          service.status === AvailedServiceStatus.CLAIMED ||
          service.status === AvailedServiceStatus.SERVING,
      ),
    };
  }, [services]);

  const getSuggestedAssignee = (service: ManagerQueueService) => {
    const selected = assigneeByServiceId[service.id];
    if (selected) return selected;
    if (service.served_by_id) return service.served_by_id;
    return employees[0]?.id ?? 0;
  };

  const invalidateQueueQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: ["pending-services", businessSlug],
      }),
      queryClient.invalidateQueries({
        queryKey: ["employee-today-bookings", businessSlug],
      }),
    ]);
  };

  const handleAssignChange = (serviceId: number, employeeId: number) => {
    setAssigneeByServiceId((prev) => ({
      ...prev,
      [serviceId]: employeeId,
    }));
  };

  const handleAssign = async (service: ManagerQueueService) => {
    const assigneeId = getSuggestedAssignee(service);
    // Modified to check for 0 or undefined if that was possible, but basically if we don't have a valid ID
    if (!assigneeId) {
      // If we provided a default in getSuggestedAssignee, this might not hit,
      // but let's be safe if default is invalid.
      toast.error("No employee selected.");
      return;
    }

    setBusyServiceId(service.id);
    try {
      const result = await claimServiceAction(service.id, assigneeId);
      if (!result.success) {
        if ("code" in result && result.code === "SCHEDULE_CONFLICT") {
          const conflict =
            "conflict" in result
              ? (result.conflict as
                  | { serviceName: string; scheduledAt: string }
                  | undefined)
              : undefined;
          const description =
            conflict
              ? `${conflict.serviceName} is already scheduled at ${formatPH(conflict.scheduledAt, "h:mm a")} for this employee. Finish, unclaim, reschedule, or reassign it first.`
              : result.error;
          toast.error("Schedule conflict", { description });
          await invalidateQueueQueries();
          return;
        }
        toast.error("Unable to assign service", {
          description: result.error || "Please try again.",
        });
        return;
      }

      toast.success("Service assigned.");
      await invalidateQueueQueries();
    } finally {
      setBusyServiceId(null);
    }
  };

  const handleServe = async (service: ManagerQueueService) => {
    const assigneeId = getSuggestedAssignee(service);
    if (!assigneeId) {
      toast.error("Choose an employee first.");
      return;
    }

    setBusyServiceId(service.id);
    try {
      const result = await markServiceServedAction(service.id, assigneeId);
      if (!result.success) {
        toast.error(result.error || "Unable to mark as served.");
        return;
      }

      toast.success("Service marked as served.");
      await invalidateQueueQueries();
    } finally {
      setBusyServiceId(null);
    }
  };

  const handleRevert = async (service: ManagerQueueService) => {
    setBusyServiceId(service.id);
    try {
      const result =
        service.status === AvailedServiceStatus.SERVING
          ? await unserveServiceAction(service.id)
          : await unclaimServiceAction(service.id);
      if (!result.success) {
        toast.error(result.error || "Unable to update queue item.");
        return;
      }

      toast.success(
        service.status === AvailedServiceStatus.SERVING
          ? "Service moved back to claimed."
          : "Service returned to pending queue.",
      );
      await invalidateQueueQueries();
    } finally {
      setBusyServiceId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full items-start">
        {/* Pending Column */}
        <div className="flex h-full min-h-[300px] flex-col gap-3 rounded-2xl border border-black/[0.06] bg-foreground/[0.02] p-2">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Pending
            </h3>
            <Badge
              variant="outline"
              className="border-black/[0.06] bg-card text-foreground/70"
            >
              {columns.pending.length}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 px-1">
            {columns.pending.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-black/[0.08] p-4 text-center">
                <p className="text-xs text-muted-foreground">No pending items</p>
              </div>
            ) : (
              columns.pending.map((service) => (
                <ManagerQueueCard
                  key={service.id}
                  service={service}
                  employees={employees}
                  isBusy={busyServiceId === service.id}
                  assigneeByServiceId={assigneeByServiceId}
                  onAssignChange={handleAssignChange}
                  onAssign={handleAssign}
                  onServe={handleServe}
                  onRevert={handleRevert}
                />
              ))
            )}
          </div>
        </div>

        {/* Active Column (Claimed + Serving) */}
        <div className="flex h-full min-h-[300px] flex-col gap-3 rounded-2xl border border-black/[0.06] bg-foreground/[0.02] p-2">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active
            </h3>
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary"
            >
              {columns.active.length}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 px-1">
            {columns.active.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-black/[0.08] p-4 text-center">
                <p className="text-xs text-muted-foreground">No active items</p>
              </div>
            ) : (
              columns.active.map((service) => (
                <ManagerQueueCard
                  key={service.id}
                  service={service}
                  employees={employees}
                  isBusy={busyServiceId === service.id}
                  assigneeByServiceId={assigneeByServiceId}
                  onAssignChange={handleAssignChange}
                  onAssign={handleAssign}
                  onServe={handleServe}
                  onRevert={handleRevert}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
