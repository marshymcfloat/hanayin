"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { getManagerQueueBoardAction } from "@/features/dashboard/actions";
import {
  claimServiceAction,
  markServiceServedAction,
  unclaimServiceAction,
} from "@/features/dashboard/actions";
import {
  ManagerQueueCard,
  QueueService,
  QueueEmployee,
} from "./ManagerQueueCard";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import { formatPH } from "@/lib/date-utils";
import type { ManagerQueueData, PendingManagerTransition } from "@/components/dashboard/manager/manager-queue-state";
import type { ManagerServiceCoordinator, ManagerActionResult, ManagerOwnTransition } from "@/components/dashboard/manager/useManagerServiceCoordinator";

// Re-export types for compatibility if needed elsewhere, mapped to the new component types
export type ManagerQueueService = QueueService;
export type ManagerQueueEmployee = QueueEmployee;

export default function ManagerQueueBoard({
  businessSlug,
  currentEmployeeId,
  initialServices,
  initialEmployees,
  onBoardServicesChange,
  managerCoordinator,
}: {
  businessSlug: string;
  currentEmployeeId: number;
  initialServices: ManagerQueueService[];
  initialEmployees: ManagerQueueEmployee[];
  onBoardServicesChange?: (services: ManagerQueueService[]) => void;
  managerCoordinator: ManagerServiceCoordinator;
}) {
  const [assigneeByServiceId, setAssigneeByServiceId] = useState<
    Record<number, number>
  >({});
  const busyServiceIds = managerCoordinator.busyIds;

  const queryKey = ["manager-queue-board", businessSlug, currentEmployeeId] as const;
  const { data } = useQuery<ManagerQueueData>({
    queryKey,
    queryFn: async () => {
      const result = await getManagerQueueBoardAction();
      if (!result.success || !("data" in result) || !result.data) {
        throw new Error(result.error || "Unable to refresh the team queue.");
      }
      return managerCoordinator.applyBoardPending(result.data);
    },
    initialData: {
      services: initialServices,
      employees: initialEmployees,
    },
    refetchInterval: 10_000,
  });

  const services = data?.services ?? initialServices;
  const employees = data?.employees ?? initialEmployees;

  useEffect(() => {
    onBoardServicesChange?.(services);
  }, [onBoardServicesChange, services]);

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

  const runQueueAction = async (
    service: ManagerQueueService,
    transition: PendingManagerTransition,
    execute: () => Promise<ManagerActionResult>,
    successMessage: string,
    errorMessage: string,
  ) => {
    const ownTransition: ManagerOwnTransition = transition.status === AvailedServiceStatus.PENDING
      ? { serviceId: service.id, transition: "unclaim" }
      : transition.assigneeId === currentEmployeeId
        ? { serviceId: service.id, transition: transition.status === AvailedServiceStatus.COMPLETED ? "complete" : "claim" }
        : { serviceId: service.id, transition: "remove" };
    const response = await managerCoordinator.run({
      serviceId: service.id,
      ownTransition,
      boardTransition: transition,
      execute,
    });
    if (response.skipped) return;
    const result = response.result;
    if (result.success) {
      toast.success(successMessage);
    } else if (result.code === "SCHEDULE_CONFLICT") {
      toast.error("Schedule conflict", {
        description: result.conflict
          ? `${result.conflict.serviceName} is already scheduled at ${formatPH(result.conflict.scheduledAt, "h:mm a")} for this employee. Finish, unclaim, reschedule, or reassign it first.`
          : result.error,
      });
    } else {
      toast.error(errorMessage, { description: result.error || "Please try again." });
    }
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

    await runQueueAction(
      service,
      { serviceId: service.id, status: AvailedServiceStatus.CLAIMED, assigneeId },
      () => claimServiceAction(service.id, assigneeId),
      "Service assigned.",
      "Unable to assign service",
    );
  };

  const handleServe = async (service: ManagerQueueService) => {
    const assigneeId = getSuggestedAssignee(service);
    if (!assigneeId) {
      toast.error("Choose an employee first.");
      return;
    }

    await runQueueAction(
      service,
      { serviceId: service.id, status: AvailedServiceStatus.COMPLETED, assigneeId },
      () => markServiceServedAction(service.id, assigneeId),
      "Service marked as served.",
      "Unable to mark as served",
    );
  };

  const handleRevert = async (service: ManagerQueueService) => {
    await runQueueAction(
      service,
      { serviceId: service.id, status: AvailedServiceStatus.PENDING, assigneeId: null },
      () => unclaimServiceAction(service.id),
      "Service returned to pending queue.",
      "Unable to update queue item",
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full items-start">
        {/* Pending Column */}
        <div className="flex h-full min-h-[11rem] flex-col gap-2 rounded-2xl border border-[#E7E9E4] bg-[#F5F6F3] p-2 sm:min-h-[15rem]">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Pending
            </h3>
            <Badge
              variant="outline"
              className="border-[#E7E9E4] bg-white text-[#20211F]"
            >
              {columns.pending.length}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 px-1">
            {columns.pending.length === 0 ? (
              <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-[#D7DBD3] p-3 text-center">
                <p className="text-xs text-muted-foreground">No pending items</p>
              </div>
            ) : (
              columns.pending.map((service) => (
                <ManagerQueueCard
                  key={service.id}
                  service={service}
                  employees={employees}
                  isBusy={busyServiceIds.has(service.id)}
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
        <div className="flex h-full min-h-[11rem] flex-col gap-2 rounded-2xl border border-[#E7E9E4] bg-[#F5F6F3] p-2 sm:min-h-[15rem]">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active
            </h3>
            <Badge
              variant="outline"
              className="border-[#72CF35] bg-[#EFF9E8] text-[#20211F]"
            >
              {columns.active.length}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 px-1">
            {columns.active.length === 0 ? (
              <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-[#D7DBD3] p-3 text-center">
                <p className="text-xs text-muted-foreground">No active items</p>
              </div>
            ) : (
              columns.active.map((service) => (
                <ManagerQueueCard
                  key={service.id}
                  service={service}
                  employees={employees}
                  isBusy={busyServiceIds.has(service.id)}
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
