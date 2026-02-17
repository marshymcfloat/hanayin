"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPH } from "@/lib/date-utils";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import {
  claimServiceAction,
  getManagerQueueBoardAction,
  markServiceServedAction,
  unclaimServiceAction,
  unserveServiceAction,
} from "@/lib/server actions/dashboard";

export type ManagerQueueService = {
  id: number;
  status: AvailedServiceStatus;
  price: number;
  scheduled_at: Date | null;
  package: { name: string } | null;
  service: {
    name: string;
    category: string;
    duration: number | null;
  };
  served_by_id: number | null;
  served_by: {
    user: {
      name: string;
    };
  } | null;
  booking: {
    customer: {
      name: string;
    };
    scheduled_at: Date | null;
    created_at: Date;
  };
};

export type ManagerQueueEmployee = {
  id: number;
  specialties: string[];
  user: {
    name: string;
  };
};

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

  const serviceCounts = useMemo(() => {
    return {
      pending: services.filter((service) => service.status === "PENDING").length,
      active: services.filter((service) => service.status !== "PENDING").length,
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
      queryClient.invalidateQueries({ queryKey: ["pending-services", businessSlug] }),
      queryClient.invalidateQueries({
        queryKey: ["employee-today-bookings", businessSlug],
      }),
    ]);
  };

  const handleAssign = async (service: ManagerQueueService) => {
    const assigneeId = getSuggestedAssignee(service);
    if (!assigneeId) {
      toast.error("No employee available for assignment.");
      return;
    }

    setBusyServiceId(service.id);
    try {
      const result = await claimServiceAction(service.id, assigneeId);
      if (!result.success) {
        toast.error(result.error || "Unable to assign service.");
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
        service.status === "SERVING"
          ? await unserveServiceAction(service.id)
          : await unclaimServiceAction(service.id);
      if (!result.success) {
        toast.error(result.error || "Unable to update queue item.");
        return;
      }

      toast.success(
        service.status === "SERVING"
          ? "Service moved back to claimed."
          : "Service returned to pending queue.",
      );
      await invalidateQueueQueries();
    } finally {
      setBusyServiceId(null);
    }
  };

  const getDisplayTime = (service: ManagerQueueService) =>
    service.booking.scheduled_at ?? service.booking.created_at ?? service.scheduled_at;

  const statusClass = (status: ManagerQueueService["status"]) => {
    if (status === AvailedServiceStatus.PENDING) {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (status === AvailedServiceStatus.SERVING) {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  return (
    <Card className="rounded-2xl border border-zinc-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold text-zinc-900">
            Manager Queue Board
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              Pending: {serviceCounts.pending}
            </Badge>
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-50 text-blue-700"
            >
              Active: {serviceCounts.active}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500">
            No queue items to manage right now.
          </div>
        ) : (
          services.map((service) => {
            const assigneeId = getSuggestedAssignee(service);
            const isBusy = busyServiceId === service.id;
            return (
              <div
                key={service.id}
                className="rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {service.service.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {service.booking.customer.name} -{" "}
                      {getDisplayTime(service)
                        ? formatPH(getDisplayTime(service), "MMM d, h:mm a")
                        : "Walk-in"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {service.package ? (
                      <Badge
                        variant="outline"
                        className="border-zinc-200 bg-zinc-50 text-zinc-700"
                      >
                        {service.package.name}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className={statusClass(service.status)}>
                      {service.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-zinc-600">
                      Assigned Employee
                    </label>
                    <select
                      value={assigneeId || ""}
                      onChange={(event) =>
                        setAssigneeByServiceId((prev) => ({
                          ...prev,
                          [service.id]: Number(event.target.value),
                        }))
                      }
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      disabled={isBusy}
                    >
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.user.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-zinc-500">
                      Current: {service.served_by?.user.name || "Unassigned"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAssign(service)}
                      disabled={isBusy || !assigneeId}
                    >
                      {service.status === AvailedServiceStatus.PENDING
                        ? "Assign"
                        : "Reassign"}
                    </Button>
                    {service.status !== AvailedServiceStatus.PENDING ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleServe(service)}
                          disabled={isBusy || !assigneeId}
                        >
                          Serve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevert(service)}
                          disabled={isBusy}
                        >
                          {service.status === AvailedServiceStatus.SERVING
                            ? "Undo Serve"
                            : "Unclaim"}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
