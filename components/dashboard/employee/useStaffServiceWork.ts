"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getEmployeeServiceWorkAction } from "@/features/dashboard/actions";
import { formatPH } from "@/lib/date-utils";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import type { ManagerServiceCoordinator } from "@/components/dashboard/manager/useManagerServiceCoordinator";
import {
  applyPendingServiceWorkTransitions,
  restoreServiceWorkItem,
  transitionServiceWork,
  type EmployeeServiceWorkData,
  type EmployeeServiceWorkItem,
  type PendingServiceWorkTransition,
  type ServiceWorkTransition,
} from "@/components/dashboard/employee/service-work-state";

type ActionResult = {
  success: boolean;
  error?: string;
  code?: string;
  conflict?: { serviceName: string; scheduledAt: string };
};

export function useStaffServiceWork({
  businessSlug,
  employeeId,
  initialData,
  managerCoordinator,
}: {
  businessSlug: string;
  employeeId: number;
  initialData: EmployeeServiceWorkData;
  managerCoordinator?: ManagerServiceCoordinator;
}) {
  const queryClient = useQueryClient();
  const [pendingActionIds, setPendingActionIds] = useState<Set<number>>(() => new Set());
  const busyIdsRef = useRef(new Set<number>());
  const pendingTransitionsRef = useRef(new Map<number, PendingServiceWorkTransition>());
  const queryKey = ["employee-service-work", businessSlug, employeeId] as const;
  const { data: serviceWork = initialData, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getEmployeeServiceWorkAction();
      if (!result.success || !("data" in result)) {
        throw new Error(result.error || "Unable to refresh service work.");
      }
      const fresh = result.data as EmployeeServiceWorkData;
      return managerCoordinator
        ? managerCoordinator.applyOwnPending(fresh)
        : applyPendingServiceWorkTransitions(fresh, pendingTransitionsRef.current.values());
    },
    initialData,
    refetchInterval: (managerCoordinator?.busyIds ?? pendingActionIds).size > 0 ? false : 5_000,
  });

  const setBusy = (serviceId: number, busy: boolean) => {
    if (busy) busyIdsRef.current.add(serviceId);
    else busyIdsRef.current.delete(serviceId);
    setPendingActionIds(new Set(busyIdsRef.current));
  };

  const runServiceWorkAction = async ({
    service,
    transition,
    execute,
    errorTitle,
    patch,
  }: {
    service: EmployeeServiceWorkItem;
    transition: ServiceWorkTransition;
    execute: () => Promise<ActionResult>;
    errorTitle: string;
    patch?: Partial<EmployeeServiceWorkItem>;
  }) => {
    if (managerCoordinator) {
      const optimisticPatch = { updated_at: new Date(), ...patch };
      const status = transition === "complete"
        ? AvailedServiceStatus.COMPLETED
        : transition === "unclaim"
          ? AvailedServiceStatus.PENDING
          : AvailedServiceStatus.CLAIMED;
      const response = await managerCoordinator.run({
        serviceId: service.id,
        ownTransition: { serviceId: service.id, transition, patch: optimisticPatch },
        boardTransition: {
          serviceId: service.id,
          status,
          assigneeId: transition === "unclaim" ? null : employeeId,
        },
        execute,
      });
      if (response.skipped || response.result.success) return;
      const result = response.result;
      if (result.code === "SCHEDULE_CONFLICT") {
        toast.error("Schedule conflict", {
          description: result.conflict
            ? `You already have ${result.conflict.serviceName} scheduled at ${formatPH(result.conflict.scheduledAt, "h:mm a")}. Finish, unclaim, reschedule, or reassign it first.`
            : result.error,
        });
      } else {
        toast.error(errorTitle, { description: result.error || "Please try again." });
      }
      return;
    }
    if (busyIdsRef.current.has(service.id)) return;
    setBusy(service.id, true);
    let snapshot = initialData;
    let patched = false;
    let succeeded = false;
    try {
      await queryClient.cancelQueries({ queryKey });
      snapshot = queryClient.getQueryData<EmployeeServiceWorkData>(queryKey) ?? initialData;
      const optimisticPatch = { updated_at: new Date(), ...patch };
      pendingTransitionsRef.current.set(service.id, {
        serviceId: service.id,
        transition,
        patch: optimisticPatch,
      });
      queryClient.setQueryData<EmployeeServiceWorkData>(
        queryKey,
        transitionServiceWork(snapshot, service.id, transition, optimisticPatch),
      );
      patched = true;
      const result = await execute();
      if (!result.success) {
        pendingTransitionsRef.current.delete(service.id);
        queryClient.setQueryData<EmployeeServiceWorkData>(queryKey, (current) =>
          restoreServiceWorkItem(current ?? snapshot, snapshot, service.id),
        );
        if (result.code === "SCHEDULE_CONFLICT") {
          toast.error("Schedule conflict", {
            description: result.conflict
              ? `You already have ${result.conflict.serviceName} scheduled at ${formatPH(result.conflict.scheduledAt, "h:mm a")}. Finish, unclaim, reschedule, or reassign it first.`
              : result.error,
          });
        } else {
          toast.error(errorTitle, { description: result.error || "Please try again." });
        }
      } else {
        succeeded = true;
      }
    } catch {
      pendingTransitionsRef.current.delete(service.id);
      if (patched) {
        queryClient.setQueryData<EmployeeServiceWorkData>(queryKey, (current) =>
          restoreServiceWorkItem(current ?? snapshot, snapshot, service.id),
        );
      }
      toast.error(errorTitle, { description: "Something went wrong. Please try again." });
    } finally {
      pendingTransitionsRef.current.delete(service.id);
      setBusy(service.id, false);
      const invalidations = [queryClient.invalidateQueries({ queryKey })];
      if (succeeded) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ["manager-queue-board", businessSlug] }),
          queryClient.invalidateQueries({ queryKey: ["pending-services", businessSlug] }),
          queryClient.invalidateQueries({ queryKey: ["employee-today-bookings", businessSlug] }),
        );
      }
      void Promise.allSettled(invalidations);
    }
  };

  return { serviceWork, isFetching, refetch, pendingActionIds: managerCoordinator?.busyIds ?? pendingActionIds, runServiceWorkAction };
}
