"use client";

/**
 * ReassignStaffDialog — per-service-line trigger that lets a manager
 * (or owner) reassign a service to a different employee. Calls
 * reassignBookingStaffAction which is gated by QUEUE_OVERRIDE_ALL.
 *
 * Employee list is fetched lazily on dialog open via
 * listBusinessEmployeesAction so this trigger doesn't require the
 * panel to thread an employees prop through every surface that opens
 * BookingQuickPanel.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import {
  listBusinessEmployeesAction,
  type EmployeeListEntry,
} from "@/lib/server actions/employees-list";
import { reassignBookingStaffAction } from "@/lib/server actions/booking-modify";

export type ReassignStaffDialogProps = {
  availedServiceId: number;
  /** Display name of the service line, used in the dialog header. */
  serviceName: string;
  /** Currently-assigned employee, if any. Shown in the description for context. */
  currentEmployeeName?: string | null;
  /** Currently-assigned employeeId — filtered out of the picker. */
  currentEmployeeId?: number | null;
  /** Optional override for the trigger element. */
  trigger?: React.ReactNode;
};

export function ReassignStaffDialog({
  availedServiceId,
  serviceName,
  currentEmployeeName,
  currentEmployeeId,
  trigger,
}: ReassignStaffDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; employees: EmployeeListEntry[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [pickedEmployeeId, setPickedEmployeeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch employees once per open. We deliberately re-fetch each time
  // the dialog reopens so newly-hired staff show up without a full
  // page reload.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadState({ kind: "loading" });
    listBusinessEmployeesAction()
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setLoadState({ kind: "error", message: res.error });
          return;
        }
        setLoadState({ kind: "ready", employees: res.employees });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setLoadState({ kind: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset picker when reopening or when employees change.
  useEffect(() => {
    if (open) setPickedEmployeeId("");
  }, [open]);

  const employees =
    loadState.kind === "ready" ? loadState.employees : [];
  const pickerOptions = useMemo(
    () =>
      employees.filter(
        (e) => currentEmployeeId == null || e.id !== currentEmployeeId,
      ),
    [employees, currentEmployeeId],
  );

  const canSubmit = pickedEmployeeId !== "" && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await reassignBookingStaffAction({
        availedServiceId,
        newEmployeeId: Number.parseInt(pickedEmployeeId, 10),
      });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "reassign this service" });
        return;
      }
      toast.success("Service reassigned");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "reassign this service" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-indigo-700 hover:bg-indigo-50"
            aria-label={`Reassign ${serviceName}`}
          >
            <Users className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Reassign &ldquo;{serviceName}&rdquo;</DialogTitle>
          <DialogDescription>
            {currentEmployeeName
              ? `Currently assigned to ${currentEmployeeName}. Pick a new staff member to take over.`
              : "Pick a staff member to take this service."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reassign-employee">Assign to</Label>
            {loadState.kind === "loading" && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading staff…
              </p>
            )}
            {loadState.kind === "error" && (
              <p className="text-sm text-destructive">
                Couldn&apos;t load staff list: {loadState.message}
              </p>
            )}
            {loadState.kind === "ready" && pickerOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No other staff to assign to.
              </p>
            )}
            {loadState.kind === "ready" && pickerOptions.length > 0 && (
              <Select
                value={pickedEmployeeId}
                onValueChange={setPickedEmployeeId}
              >
                <SelectTrigger id="reassign-employee" className="rounded-xl">
                  <SelectValue placeholder="Pick a staff member" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {pickerOptions.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({employee.profile.toLowerCase()})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={!canSubmit || pickerOptions.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reassigning...
                </>
              ) : (
                <>Reassign</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
