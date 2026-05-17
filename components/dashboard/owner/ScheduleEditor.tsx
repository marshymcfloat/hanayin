"use client";

import * as React from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type EmployeeScheduleRow,
  getEmployeeScheduleAction,
  upsertEmployeeScheduleAction,
} from "@/lib/server actions/employees";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ScheduleEditor({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: {
  employeeId: number;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [rows, setRows] = React.useState<EmployeeScheduleRow[]>([]);

  // Re-fetch on every open. Schedules change rarely so simple
  // request-on-open is fine; no React Query needed.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getEmployeeScheduleAction(employeeId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setRows(result.data as EmployeeScheduleRow[]);
      } else {
        toast.error(result.error || "Failed to load schedule");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId]);

  function addRange(dayOfWeek: number) {
    setRows((prev) => [
      ...prev,
      { day_of_week: dayOfWeek, start_time: "09:00", end_time: "17:00" },
    ]);
  }

  function updateRange(index: number, patch: Partial<EmployeeScheduleRow>) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function removeRange(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await upsertEmployeeScheduleAction(employeeId, rows);
      if (result.success) {
        toast.success("Schedule saved");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to save");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save schedule",
      );
    } finally {
      setSaving(false);
    }
  }

  // Stable index lookup: the user can have multiple ranges per day, so
  // we render grouped-by-day but track each row by its position in the
  // flat `rows` array so input edits map back to the right element.
  const indexed = rows.map((row, i) => ({ row, i }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Weekly Schedule</DialogTitle>
          <DialogDescription>
            Set shift windows for <strong>{employeeName}</strong>. Days
            with no ranges fall back to business hours when{" "}
            <em>formal scheduling</em> is off, or mark the employee
            unavailable when it&apos;s on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            DAY_LABELS.map((label, dayOfWeek) => {
              const dayRows = indexed.filter(
                ({ row }) => row.day_of_week === dayOfWeek,
              );
              return (
                <div
                  key={dayOfWeek}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {label}
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addRange(dayOfWeek)}
                      className="text-primary cursor-pointer h-7"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add range
                    </Button>
                  </div>

                  {dayRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Off — falls back to business hours
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dayRows.map(({ row, i }) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={row.start_time}
                            onChange={(e) =>
                              updateRange(i, { start_time: e.target.value })
                            }
                            className="h-9 rounded-lg w-32"
                            aria-label={`${label} start time`}
                          />
                          <span className="text-muted-foreground">→</span>
                          <Input
                            type="time"
                            value={row.end_time}
                            onChange={(e) =>
                              updateRange(i, { end_time: e.target.value })
                            }
                            className="h-9 rounded-lg w-32"
                            aria-label={`${label} end time`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRange(i)}
                            className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                            aria-label="Remove range"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="rounded-xl cursor-pointer"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
