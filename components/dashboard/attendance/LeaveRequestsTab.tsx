"use client";

import {
  LeaveRequest,
  Employee,
  User,
} from "@/prisma/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeaveActionDialog } from "./LeaveActionDialog";
import { User as UserIcon, Calendar, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Helper functions for avatars
const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const getAvatarColor = (name: string) => {
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

type LeaveRequestWithEmployee = LeaveRequest & {
  employee: Employee & {
    user: Pick<User, "name">;
  };
};

interface LeaveRequestsTabProps {
  requests: LeaveRequestWithEmployee[];
  params: { businessSlug: string };
}

export function LeaveRequestsTab({ requests }: LeaveRequestsTabProps) {
  const getStatusClass = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "border-primary/30 bg-primary/10 text-primary";
      case "REJECTED":
        return "border-destructive/30 bg-destructive/10 text-destructive";
      default:
        return "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Mobile Card View */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {requests.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <UserIcon className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground">No requests found</h3>
            <p className="text-muted-foreground">There are no pending leave requests.</p>
          </div>
        ) : (
          requests.map((request) => (
            <div
              key={request.id}
              className="bg-card rounded-2xl p-4 border border-border flex flex-col gap-4 transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <Avatar className={`${getAvatarColor(request.employee.user.name)} h-10 w-10 text-white shadow-sm`}>
                    <AvatarFallback className="bg-transparent font-medium">
                      {getInitials(request.employee.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {request.employee.user.name}
                    </span>
                    <Badge variant="outline" className={`w-fit mt-1 text-xs ${getStatusClass(request.status)}`}>
                      {request.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-border/50">
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground font-medium uppercase">Dates</span>
                    <span className="font-medium text-foreground">
                      {format(new Date(request.start_date), "MMM d, yyyy")} -{" "}
                      {format(new Date(request.end_date), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground font-medium uppercase">Reason</span>
                    <span className="text-foreground">{request.reason}</span>
                  </div>
                </div>
              </div>

              {request.status === "PENDING" && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                  <LeaveActionDialog
                    requestId={request.id}
                    action="REJECT"
                    trigger={
                      <Button variant="outline" className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer">
                        Reject
                      </Button>
                    }
                  />
                  <LeaveActionDialog
                    requestId={request.id}
                    action="APPROVE"
                    trigger={
                      <Button className="w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                        Approve
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border bg-muted/50">
              <TableHead className="pl-6 h-11 font-semibold text-muted-foreground">Employee</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Dates</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Reason</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Status</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Admin Comment</TableHead>
              <TableHead className="text-right pr-6 h-11 font-semibold text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UserIcon className="h-8 w-8 text-muted-foreground/40" />
                    <p>No leave requests found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow
                  key={request.id}
                  className="hover:bg-accent/30 transition-colors border-border/50"
                >
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className={`${getAvatarColor(request.employee.user.name)} h-9 w-9 text-white shadow-sm`}>
                        <AvatarFallback className="bg-transparent font-medium">
                          {getInitials(request.employee.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">
                        {request.employee.user.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col text-sm">
                      <span className="font-medium text-foreground">
                        {format(new Date(request.start_date), "MMM d, yyyy")}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        to {format(new Date(request.end_date), "MMM d, yyyy")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 max-w-[200px] truncate text-muted-foreground">
                    {request.reason}
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="outline" className={getStatusClass(request.status)}>
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-muted-foreground text-sm">
                    {request.admin_comment || "-"}
                  </TableCell>
                  <TableCell className="text-right pr-6 py-4">
                    {request.status === "PENDING" && (
                      <div className="flex justify-end gap-2">
                        <LeaveActionDialog
                          requestId={request.id}
                          action="REJECT"
                          trigger={
                            <Button size="sm" variant="outline" className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer">
                              Reject
                            </Button>
                          }
                        />
                        <LeaveActionDialog
                          requestId={request.id}
                          action="APPROVE"
                          trigger={
                            <Button size="sm" className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                              Approve
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
