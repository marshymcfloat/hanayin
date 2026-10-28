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
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
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
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

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
    } | null;
    is_anonymous_walk_in?: boolean | null;
    customer_label?: string | null;
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
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60";
      case AvailedServiceStatus.SERVING:
      case AvailedServiceStatus.CLAIMED:
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  }, [service.status]);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-2xl border-[#E7E9E4] bg-white transition-shadow hover:shadow-[0_12px_30px_rgba(32,33,31,0.08)]",
        isBusy && "opacity-70 pointer-events-none",
      )}
    >
      {isBusy && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-card/60 backdrop-blur-[1px]">
          <div className="size-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        </div>
      )}

      <CardHeader className="px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Badge
              variant="outline"
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                statusColor,
              )}
            >
              {service.status}
            </Badge>
            <h3 className="font-semibold text-foreground line-clamp-2 leading-tight">
              {service.service.name}
            </h3>
            {service.package && (
              <p className="text-xs text-muted-foreground font-medium">
                {service.package.name}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 px-3 pb-3 pt-0 sm:px-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center text-xs text-muted-foreground">
            <User className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="font-medium text-foreground/80 truncate max-w-[150px]">
              {getBookingCustomerName(service.booking)}
            </span>
          </div>
          <div className="flex items-center text-xs text-muted-foreground">
            {displayTime ? (
              <>
                <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="font-mono">
                  {formatPH(displayTime, "MMM d, h:mm a")}
                </span>
              </>
            ) : (
              <>
                <Clock className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                <span>Walk-in</span>
              </>
            )}
          </div>
        </div>

        <Separator className="bg-border" />

        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Assign To
          </label>
          <Select
            value={assigneeId?.toString()}
            onValueChange={(value) => onAssignChange(service.id, Number(value))}
            disabled={isBusy}
          >
            <SelectTrigger className="min-h-11 w-full border-[#E7E9E4] bg-white">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent className={staffTheme.workspace}>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id.toString()}>
                  {employee.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 border-t border-[#E7E9E4] bg-[#F5F6F3] p-2.5 sm:p-3">
        {isPending ? (
          <Button
            size="sm"
            className="min-h-11 w-full rounded-full bg-[#20211F] text-xs font-medium text-white shadow-none hover:bg-[#30322F]"
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
              className="min-h-11 w-full rounded-full border-[#E7E9E4] bg-white text-xs hover:border-[#72CF35] hover:bg-[#EFF9E8]"
              onClick={() => onRevert(service)}
              disabled={isBusy}
            >
              {isServing ? "Return to queue" : "Unclaim"}
            </Button>
            <Button
              size="sm"
              className="min-h-11 w-full rounded-full bg-[#20211F] text-xs font-medium text-white shadow-none hover:bg-[#30322F]"
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
