"use client";

import { useMemo } from "react";
import {
  User,
  Clock,
  Calendar,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/enums";
import { formatPH } from "@/lib/date-utils";

// Duplicate types to avoid circular dependency with ManagerQueueBoard
export type QueueService = {
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

export type QueueEmployee = {
  id: number;
  specialties: string[];
  user: {
    name: string;
  };
};

interface ManagerQueueCardProps {
  service: QueueService;
  employees: QueueEmployee[];
  isBusy: boolean;
  assigneeByServiceId: Record<number, number>;
  onAssignChange: (serviceId: number, employeeId: number) => void;
  onAssign: (service: QueueService) => void;
  onServe: (service: QueueService) => void;
  onRevert: (service: QueueService) => void;
}

export function ManagerQueueCard({
  service,
  employees,
  isBusy,
  assigneeByServiceId,
  onAssignChange,
  onAssign,
  onServe,
  onRevert,
}: ManagerQueueCardProps) {
  const getSuggestedAssignee = (service: QueueService) => {
    const selected = assigneeByServiceId[service.id];
    if (selected) return selected;
    if (service.served_by_id) return service.served_by_id;
    return undefined; // Changed to undefined for Select component compatibility
  };

  const assigneeId = getSuggestedAssignee(service);

  const displayTime =
    service.booking.scheduled_at ??
    service.booking.created_at ??
    service.scheduled_at;

  const isPending = service.status === AvailedServiceStatus.PENDING;
  const isServing = service.status === AvailedServiceStatus.SERVING;

  const statusColor = useMemo(() => {
    switch (service.status) {
      case AvailedServiceStatus.PENDING:
        return "bg-amber-50 text-amber-700 border-amber-200";
      case AvailedServiceStatus.SERVING:
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case AvailedServiceStatus.CLAIMED:
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
  }, [service.status]);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200 hover:shadow-md border-zinc-200",
        isBusy && "opacity-70 pointer-events-none",
      )}
    >
      {isBusy && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent" />
        </div>
      )}

      <CardHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Badge
              variant="outline"
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                statusColor,
              )}
            >
              {service.status}
            </Badge>
            <h3 className="font-semibold text-zinc-900 line-clamp-2 leading-tight">
              {service.service.name}
            </h3>
            {service.package && (
              <p className="text-xs text-zinc-500 font-medium">
                {service.package.name}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center text-xs text-zinc-500">
            <User className="mr-2 h-3.5 w-3.5 text-zinc-400" />
            <span className="font-medium text-zinc-700 truncate max-w-[150px]">
              {service.booking.customer.name}
            </span>
          </div>
          <div className="flex items-center text-xs text-zinc-500">
            {displayTime ? (
              <>
                <Calendar className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                <span className="font-mono">
                  {formatPH(displayTime, "MMM d, h:mm a")}
                </span>
              </>
            ) : (
              <>
                <Clock className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                <span>Walk-in</span>
              </>
            )}
          </div>
        </div>

        <Separator className="bg-zinc-100" />

        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Assign To
          </label>
          <Select
            value={assigneeId?.toString()}
            onValueChange={(value) => onAssignChange(service.id, Number(value))}
            disabled={isBusy}
          >
            <SelectTrigger className="h-9 w-full bg-zinc-50/50 border-zinc-200">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id.toString()}>
                  {employee.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <CardFooter className="p-3 bg-zinc-50/50 border-t border-zinc-100 flex gap-2">
        {isPending ? (
          <Button
            size="sm"
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white shadow-none h-8 text-xs font-medium"
            onClick={() => onAssign(service)}
            disabled={!assigneeId || isBusy}
          >
            Confirm Assignment
            <ArrowRight className="ml-2 h-3 w-3" />
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button
              size="sm"
              variant="outline"
              className="w-full border-zinc-200 bg-white hover:bg-zinc-50 h-8 text-xs text-zinc-700"
              onClick={() => onRevert(service)}
              disabled={isBusy}
            >
              {isServing ? "Undo Serve" : "Unclaim"}
            </Button>
            <Button
              size="sm"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-none h-8 text-xs font-medium"
              onClick={() => onServe(service)}
              disabled={!assigneeId || isBusy}
            >
              Serve
              <CheckCircle2 className="ml-2 h-3 w-3" />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
