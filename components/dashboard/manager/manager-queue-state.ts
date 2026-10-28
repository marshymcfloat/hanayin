import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import type { QueueEmployee, QueueService } from "@/components/dashboard/manager/ManagerQueueCard";

export type ManagerQueueData = {
  services: QueueService[];
  employees: QueueEmployee[];
};

export type PendingManagerTransition = {
  serviceId: number;
  status: AvailedServiceStatus;
  assigneeId?: number | null;
};

export function transitionManagerQueue(
  data: ManagerQueueData,
  transition: PendingManagerTransition,
): ManagerQueueData {
  const assignee = data.employees.find((employee) => employee.id === transition.assigneeId);
  return {
    ...data,
    services: data.services.map((service) =>
      service.id === transition.serviceId
        ? {
            ...service,
            status: transition.status,
            ...(transition.assigneeId !== undefined
              ? {
                  served_by_id: transition.assigneeId,
                  served_by: assignee ? { user: { name: assignee.user.name } } : null,
                }
              : {}),
          }
        : service,
    ),
  };
}

export function applyPendingManagerTransitions(
  data: ManagerQueueData,
  pending: Iterable<PendingManagerTransition>,
): ManagerQueueData {
  let next = data;
  for (const transition of pending) next = transitionManagerQueue(next, transition);
  return next;
}

export function restoreManagerQueueItem(
  current: ManagerQueueData,
  snapshot: ManagerQueueData,
  serviceId: number,
): ManagerQueueData {
  const original = snapshot.services.find((service) => service.id === serviceId);
  if (!original) return current;
  const services = current.services.filter((service) => service.id !== serviceId);
  const originalIndex = snapshot.services.findIndex((service) => service.id === serviceId);
  services.splice(Math.min(originalIndex, services.length), 0, original);
  return { ...current, services };
}
