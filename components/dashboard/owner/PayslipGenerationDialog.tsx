"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import {
  createPayslipAction,
  getPayslipDataAction,
} from "@/lib/server actions/payslip";
import { toast } from "sonner";
import { formatPH } from "@/lib/date-utils";
import {
  Loader2,
  Wallet,
  Calendar as CalendarIcon,
  AlertCircle,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface PayslipGenerationDialogProps {
  employeeId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type PayslipData = {
  employee: {
    id: number;
    name: string;
    daily_rate: number;
    commission_percentage: number;
  };
  period: {
    start: Date;
    end: Date;
  };
  breakdown: {
    days_present: number;
    paid_leave_days: number;
    attendance_dates: Date[];
    basic_salary: number;
    commission_services_count: number;
    commission_services: Array<{
      id: number;
      commission_base: number | null;
      price: number;
      package: { name: string } | null;
      service: { name: string };
    }>;
    commission_total: number;
  };
  total_salary: number;
};
type CommissionService = PayslipData["breakdown"]["commission_services"][number];

export function PayslipGenerationDialog({
  employeeId,
  open,
  onOpenChange,
  onSuccess,
}: PayslipGenerationDialogProps) {
  const [generating, setGenerating] = useState(false);
  const [deduction, setDeduction] = useState(0);
  const [comment, setComment] = useState("");

  const { data, isLoading, isFetching, error } = useQuery<PayslipData, Error>({
    queryKey: ["payslip-data", employeeId],
    enabled: open && !!employeeId,
    queryFn: async (): Promise<PayslipData> => {
      if (!employeeId) {
        throw new Error("Employee not found");
      }

      const res = await getPayslipDataAction(employeeId);
      if (!res.success || !("data" in res) || !res.data) {
        throw new Error(("error" in res && res.error) || "Failed to load data");
      }

      return res.data;
    },
  });

  useEffect(() => {
    if (!error) return;
    toast.error(error.message);
    onOpenChange(false);
  }, [error, onOpenChange]);

  const loading = isLoading || isFetching;

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDeduction(0);
      setComment("");
    }
    onOpenChange(nextOpen);
  };

  const handleGenerate = async () => {
    if (!data) return;
    setGenerating(true);
    // Server recomputes totals; we only forward the deduction + note.
    const res = await createPayslipAction({
      employeeId: data.employee.id,
      deduction: deduction,
      comment: comment,
    });
    setGenerating(false);

    if (res.success) {
      toast.success("Payslip generated successfully");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  };

  if (!employeeId) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[425px] md:max-w-[600px]! max-h-[90vh] flex flex-col p-0 gap-0 rounded-3xl overflow-hidden">
        <DialogHeader className="px-6 pb-2 pt-6 shrink-0">
          <DialogTitle className="text-xl font-bold text-foreground">
            Generate Payslip
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Review salary details and confirm payout generation.
          </DialogDescription>
        </DialogHeader>
        <div className="h-px bg-border mx-6 shrink-0" />

        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-primary" />
              <p className="text-sm">Calculating payout details...</p>
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="bg-card p-4 rounded-xl border border-border space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Employee</span>
                  <span className="font-semibold text-foreground">
                    {data.employee.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-medium block mb-1">
                      Period Start
                    </span>
                    <div className="flex items-center gap-2 text-sm text-foreground bg-muted/50 px-2 py-1.5 rounded-md border border-border">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatPH(data.period.start, "PPP p")}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-medium block mb-1">
                      Period End
                    </span>
                    <div className="flex items-center gap-2 text-sm text-foreground bg-muted/50 px-2 py-1.5 rounded-md border border-border">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatPH(data.period.end, "PPP p")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border space-y-4">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  Salary Breakdown
                </h4>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Daily Rate</span>
                    <span className="font-mono text-foreground">
                      ₱{data.employee.daily_rate.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Days Present</span>
                    <span className="font-mono text-foreground">
                      x {data.breakdown.days_present}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
                    <span className="text-sm font-medium text-foreground">
                      Basic Pay
                    </span>
                    <span className="font-bold text-foreground">
                      ₱{data.breakdown.basic_salary.toLocaleString()}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">
                      Commission ({data.employee.commission_percentage}%)
                    </span>
                    <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border">
                      {data.breakdown.commission_services_count} services
                    </Badge>
                  </div>

                  <div className="bg-muted/30 rounded-lg border border-border max-h-[120px] overflow-y-auto">
                    {data.breakdown.commission_services.length > 0 ? (
                      <div className="divide-y divide-border/50">
                        {data.breakdown.commission_services.map(
                          (service: CommissionService) => (
                            <div
                              key={service.id}
                              className="px-3 py-2 flex justify-between items-center text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-foreground truncate max-w-[140px]">
                                  {service.service.name}
                                </span>
                                {service.package && (
                                  <span className="bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded text-[9px] font-medium border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800">
                                    PKG
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-muted-foreground">
                                ₱
                                {(
                                  service.commission_base ?? service.price
                                ).toLocaleString()}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="p-3 text-center text-xs text-muted-foreground italic">
                        No commission services this period
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center bg-primary/10 p-2 rounded-lg border border-primary/20">
                    <span className="text-sm font-medium text-primary">
                      Commission Pay
                    </span>
                    <span className="font-bold text-primary">
                      ₱{data.breakdown.commission_total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="deduction"
                      className="text-xs uppercase text-muted-foreground font-bold"
                    >
                      Deduction / Adjustment
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">
                        ₱
                      </span>
                      <Input
                        id="deduction"
                        type="number"
                        min="0"
                        placeholder="0.00"
                        className="pl-7 rounded-xl border-border bg-background"
                        value={deduction || ""}
                        onChange={(e) => setDeduction(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="comment"
                      className="text-xs uppercase text-muted-foreground font-bold"
                    >
                      Notes
                    </Label>
                    <Textarea
                      id="comment"
                      placeholder="Add any notes about this payslip..."
                      className="rounded-xl border-border bg-background min-h-[60px] resize-none"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="bg-destructive/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-foreground font-medium">Failed to load data</p>
              <p className="text-muted-foreground text-sm">
                Please try again later or contact support.
              </p>
            </div>
          )}
        </div>

        {data && (
          <div className="px-6 py-4 border-t border-border bg-muted/30 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium text-muted-foreground">Net Pay</span>
              <span className="text-2xl font-bold text-foreground tracking-tight">
                ₱{(data.total_salary - deduction).toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generating}
                className="rounded-xl cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
              >
                {generating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm Payout
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
