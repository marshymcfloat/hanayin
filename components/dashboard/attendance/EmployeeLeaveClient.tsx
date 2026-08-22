"use client";

import { LeaveRequest } from "@/prisma/generated/prisma/client";
import { RequestLeaveDialog } from "./RequestLeaveDialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cancelLeaveRequest } from "@/app/actions/leave-request";
import { toast } from "sonner";
import { extractClientErrorMessage } from "@/lib/utils/error-message";
import { useMemo, useState } from "react";
import { CalendarPlus, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface EmployeeLeaveClientProps {
  employeeId: number;
  businessId: string;
  businessSlug: string; // Added prop
  requests: LeaveRequest[];
  compact?: boolean;
  showRequestAction?: boolean;
}

export function EmployeeLeaveClient({
  employeeId,
  businessId,
  businessSlug,
  requests,
  compact = false,
  showRequestAction = true,
}: EmployeeLeaveClientProps) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const pending = requests.filter((r) => r.status === "PENDING").length;
    return { total: requests.length, pending };
  }, [requests]);

  const summary = counts.pending > 0
    ? `${counts.pending} pending request${counts.pending === 1 ? "" : "s"}`
    : counts.total > 0
      ? `${counts.total} request${counts.total === 1 ? "" : "s"} on file`
      : "No requests yet";

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

  const handleCancel = async (id: number) => {
    try {
      setCancellingId(id);
      const result = await cancelLeaveRequest(id);
      if (result.success) {
        toast.success("Leave request cancelled");
      } else {
        toast.error(result.error || "Failed to cancel request");
      }
    } catch (err) {
      toast.error(extractClientErrorMessage(err, "Failed to cancel request"));
    } finally {
      setCancellingId(null);
    }
  };

  // Two states drive the body fill: when the employee has filed any
  // requests we show a compact "manage requests" row at top + a
  // request-leave button below; when nothing is filed yet we render a
  // friendly centered empty state. Both use h-full + flex column so
  // PortalCardBody (flex-1) can stretch to match the row height
  // (e.g. matching AttendanceCard's taller layout on desktop).
  const hasRequests = counts.total > 0;

  return (
    <Dialog>
      {compact ? (
        <DialogTrigger asChild>
          <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 text-left transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer">
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{summary}</span>{counts.pending > 0 ? <span className="block text-xs text-amber-600">Awaiting review</span> : null}</span>
            {showRequestAction ? <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary"><CalendarPlus className="size-4" />Request leave</span> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          </button>
        </DialogTrigger>
      ) : hasRequests ? (
        <div className="flex h-full flex-col gap-4">
          <DialogTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center gap-3 rounded-xl -mx-2 px-2 py-2 text-left transition-colors hover:bg-primary/[0.04] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {summary}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Tap to manage requests
                </span>
              </span>
              {counts.pending > 0 && (
                <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-2 text-[11px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {counts.pending} pending
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </DialogTrigger>
          <div className="mt-auto">
            <DialogTrigger asChild>
              <Button className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                <CalendarPlus className="mr-2 size-4" />
                Request leave
              </Button>
            </DialogTrigger>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 py-2 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <Sparkles className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              No requests yet
            </p>
            <p className="text-xs text-muted-foreground">
              Need a day? File a leave request and your owner will review it.
            </p>
          </div>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90">
              <CalendarPlus className="mr-2 size-4" />
              Request leave
            </Button>
          </DialogTrigger>
        </div>
      )}
      <DialogContent className="max-w-[95vw] md:max-w-5xl! h-[80vh] flex flex-col p-0 rounded-3xl gap-0 overflow-hidden">
        <DialogHeader className="px-6 pb-2 pt-6 shrink-0">
          <DialogTitle className="text-xl font-bold text-foreground">Leave Requests</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Manage your leave requests and view their status.
          </DialogDescription>
        </DialogHeader>
        <div className="h-px bg-border mx-6 shrink-0" />

        <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
          <div className="flex justify-end">
            <RequestLeaveDialog
              employeeId={employeeId}
              businessId={businessId}
              businessSlug={businessSlug}
            />
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">My Requests</h3>
              <p className="text-sm text-muted-foreground">History of your leave requests.</p>
            </div>
            {requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-primary/[0.02] py-12 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <Sparkles className="size-5" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    No leave requests yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Use the button above to file your first request.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border">
                      <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dates</TableHead>
                      <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Type</TableHead>
                      <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reason</TableHead>
                      <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</TableHead>
                      <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Admin Comment</TableHead>
                      <TableHead className="text-right h-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request.id} className="border-border/50 hover:bg-primary/[0.04] transition-colors">
                        <TableCell className="py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {format(new Date(request.start_date), "MMM d, yyyy")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              to {format(new Date(request.end_date), "MMM d, yyyy")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className="border-border text-muted-foreground">{request.type}</Badge>
                        </TableCell>
                        <TableCell className="py-3 max-w-[200px] truncate text-muted-foreground" title={request.reason}>
                          {request.reason}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className={getStatusClass(request.status)}>
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 max-w-[200px] truncate text-muted-foreground">
                          {request.admin_comment || "-"}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          {request.status === "PENDING" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                  disabled={cancellingId === request.id}
                                >
                                  {cancellingId === request.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Cancel"
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel Leave Request</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to cancel this leave request? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-xl">Keep Request</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleCancel(request.id)}
                                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Yes, Cancel Request
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
