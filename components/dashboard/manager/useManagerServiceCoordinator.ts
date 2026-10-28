"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  restoreServiceWorkItem,
  transitionServiceWork,
  type EmployeeServiceWorkData,
  type PendingServiceWorkTransition,
} from "@/components/dashboard/employee/service-work-state";
import {
  applyPendingManagerTransitions,
  restoreManagerQueueItem,
  transitionManagerQueue,
  type ManagerQueueData,
  type PendingManagerTransition,
} from "@/components/dashboard/manager/manager-queue-state";

export type ManagerOwnTransition =
  | PendingServiceWorkTransition
  | { serviceId: number; transition: "remove" };

export type ManagerActionResult = {
  success: boolean;
  error?: string;
  code?: string;
  conflict?: { serviceName: string; scheduledAt: string };
};

function applyOwnTransition(data: EmployeeServiceWorkData, operation: ManagerOwnTransition) {
  if (operation.transition === "remove") {
    return {
      pending: data.pending.filter((item) => item.id !== operation.serviceId),
      active: data.active.filter((item) => item.id !== operation.serviceId),
      completed: data.completed.filter((item) => item.id !== operation.serviceId),
    };
  }
  return transitionServiceWork(data, operation.serviceId, operation.transition, operation.patch);
}

export function useManagerServiceCoordinator({
  businessSlug,
  employeeId,
  initialOwn,
  initialBoard,
}: {
  businessSlug: string;
  employeeId: number;
  initialOwn: EmployeeServiceWorkData;
  initialBoard: ManagerQueueData;
}) {
  const queryClient = useQueryClient();
  const [busyIds, setBusyIds] = useState<Set<number>>(() => new Set());
  const busyRef = useRef(new Set<number>());
  const ownPendingRef = useRef(new Map<number, ManagerOwnTransition>());
  const boardPendingRef = useRef(new Map<number, PendingManagerTransition>());
  const ownKey = ["employee-service-work", businessSlug, employeeId] as const;
  const boardKey = ["manager-queue-board", businessSlug, employeeId] as const;

  const applyOwnPending = (data: EmployeeServiceWorkData) => {
    let next = data;
    for (const operation of ownPendingRef.current.values()) next = applyOwnTransition(next, operation);
    return next;
  };
  const applyBoardPending = (data: ManagerQueueData) =>
    applyPendingManagerTransitions(data, boardPendingRef.current.values());

  const run = async ({
    serviceId,
    ownTransition,
    boardTransition,
    execute,
  }: {
    serviceId: number;
    ownTransition: ManagerOwnTransition;
    boardTransition: PendingManagerTransition;
    execute: () => Promise<ManagerActionResult>;
  }): Promise<{ skipped: true } | { skipped: false; result: ManagerActionResult }> => {
    if (busyRef.current.has(serviceId)) return { skipped: true };
    busyRef.current.add(serviceId);
    setBusyIds(new Set(busyRef.current));
    let ownSnapshot: EmployeeServiceWorkData | undefined;
    let boardSnapshot: ManagerQueueData | undefined;
    let succeeded = false;
    const rollback = () => {
      ownPendingRef.current.delete(serviceId);
      boardPendingRef.current.delete(serviceId);
      if (ownSnapshot) {
        queryClient.setQueryData<EmployeeServiceWorkData>(ownKey, (current) =>
          restoreServiceWorkItem(current ?? ownSnapshot!, ownSnapshot!, serviceId),
        );
      }
      if (boardSnapshot) {
        queryClient.setQueryData<ManagerQueueData>(boardKey, (current) =>
          restoreManagerQueueItem(current ?? boardSnapshot!, boardSnapshot!, serviceId),
        );
      }
    };
    try {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ownKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      ownSnapshot = queryClient.getQueryData<EmployeeServiceWorkData>(ownKey) ?? initialOwn;
      boardSnapshot = queryClient.getQueryData<ManagerQueueData>(boardKey) ?? initialBoard;
      ownPendingRef.current.set(serviceId, ownTransition);
      boardPendingRef.current.set(serviceId, boardTransition);
      queryClient.setQueryData(ownKey, applyOwnTransition(ownSnapshot, ownTransition));
      queryClient.setQueryData(boardKey, transitionManagerQueue(boardSnapshot, boardTransition));

      const result = await execute();
      if (!result.success) rollback();
      else succeeded = true;
      return { skipped: false, result };
    } catch {
      rollback();
      return { skipped: false, result: { success: false, error: "Please try again." } };
    } finally {
      ownPendingRef.current.delete(serviceId);
      boardPendingRef.current.delete(serviceId);
      busyRef.current.delete(serviceId);
      setBusyIds(new Set(busyRef.current));
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ownKey }),
        queryClient.invalidateQueries({ queryKey: boardKey }),
      ];
      if (succeeded) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ["pending-services", businessSlug] }),
          queryClient.invalidateQueries({ queryKey: ["employee-today-bookings", businessSlug] }),
        );
      }
      void Promise.allSettled(invalidations);
    }
  };

  return { busyIds, applyOwnPending, applyBoardPending, run };
}

export type ManagerServiceCoordinator = ReturnType<typeof useManagerServiceCoordinator>;
