"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPH } from "@/lib/date-utils";
import { createPayslipAction, getPayslipDataAction } from "@/features/payroll/actions/payslip";

interface Props { employeeId: number | null; open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }
type PayslipData = {
  employee: { id: number; name: string; daily_rate: number; commission_percentage: number };
  period: { start: Date; end: Date };
  breakdown: {
    days_present: number; paid_leave_days: number; attendance_dates: Date[]; basic_salary: number;
    commission_services_count: number; commission_total: number;
    commission_services: Array<{
      id: number; commission_base: number | null; price: number; completed_at: Date | null;
      package: { name: string } | null; service: { name: string };
      booking: { customer_label: string | null; customer: { name: string } | null };
    }>;
  };
  total_salary: number;
};
type CommissionService = PayslipData["breakdown"]["commission_services"][number];
const money = (amount: number, decimals = false) => amount.toLocaleString(undefined, { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 });

export function PayslipGenerationDialog({ employeeId, open, onOpenChange, onSuccess }: Props) {
  const [generating, setGenerating] = useState(false);
  const [deduction, setDeduction] = useState(0);
  const [comment, setComment] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const { data, isLoading, isFetching, error } = useQuery<PayslipData, Error>({
    queryKey: ["payslip-data", employeeId], enabled: open && !!employeeId,
    queryFn: async () => {
      if (!employeeId) throw new Error("Employee not found");
      const res = await getPayslipDataAction(employeeId);
      if (!res.success || !("data" in res) || !res.data) throw new Error(("error" in res && res.error) || "Failed to load data");
      return res.data;
    },
  });
  useEffect(() => { if (error) { toast.error(error.message); onOpenChange(false); } }, [error, onOpenChange]);
  const changeOpen = (next: boolean) => {
    if (!next) { setDeduction(0); setComment(""); setShowDetails(false); }
    onOpenChange(next);
  };
  const generate = async () => {
    if (!data) return;
    if (deduction > data.total_salary) toast.warning(`Deduction (₱${money(deduction)}) exceeds gross (₱${money(data.total_salary)}). It will be capped at gross; the excess is not carried over.`);
    setGenerating(true);
    const res = await createPayslipAction({ employeeId: data.employee.id, deduction, comment });
    setGenerating(false);
    if (res.success) { toast.success("Payslip generated successfully"); onSuccess(); onOpenChange(false); }
    else toast.error(res.error);
  };
  if (!employeeId) return null;
  const netPay = Math.max(0, (data?.total_salary ?? 0) - deduction);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[580px]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">Generate Payslip</DialogTitle>
          <DialogDescription className="text-sm">Review earnings and adjustments before payout.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {isLoading || isFetching ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground"><Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" /><p className="text-sm">Calculating payout…</p></div>
          ) : data ? (
            <div>
              <section className="border-b border-border py-4">
                <div className="flex items-baseline justify-between gap-4"><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Employee</span><span className="text-sm font-semibold">{data.employee.name}</span></div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5" aria-hidden="true" /><span>{formatPH(data.period.start, "MMM d, yyyy")}</span><span>—</span><span>{formatPH(data.period.end, "MMM d, yyyy")}</span></div>
              </section>
              <section className="border-b border-border py-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earnings</h3>
                <div className="space-y-2.5">
                  <PayRow label="Daily rate" value={`₱${money(data.employee.daily_rate)}`} />
                  <PayRow label="Paid days" value={`${data.breakdown.days_present + data.breakdown.paid_leave_days}${data.breakdown.paid_leave_days ? ` (${data.breakdown.paid_leave_days} leave)` : ""}`} />
                  <PayRow label="Basic pay" value={`₱${money(data.breakdown.basic_salary)}`} total />
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex justify-between gap-3"><span className="text-sm font-medium">Commission ({data.employee.commission_percentage}%)</span><span className="text-xs text-muted-foreground">{data.breakdown.commission_services_count} services</span></div>
                  {data.breakdown.commission_services.length > 0 && <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)} className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-between border-y border-border py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{showDetails ? "Hide commission details" : "View commission details"}</span><ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`} /></button>}
                  {showDetails && <CommissionDetails services={data.breakdown.commission_services} percentage={data.employee.commission_percentage} />}
                  <div className="mt-3 flex justify-between text-sm tabular-nums"><span className="font-medium">Commission pay</span><span className="font-semibold text-primary">₱{money(data.breakdown.commission_total)}</span></div>
                </div>
              </section>
              <section className="py-4">
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <div className="space-y-1.5"><Label htmlFor="deduction" className="text-xs text-muted-foreground">Deduction / adjustment</Label><div className="relative"><span className="absolute left-3 top-2 text-sm text-muted-foreground">₱</span><Input id="deduction" type="number" min="0" placeholder="0.00" className="h-9 rounded-md pl-7 tabular-nums" value={deduction || ""} onChange={(e) => setDeduction(Math.max(0, Number(e.target.value)))} /></div></div>
                  <div className="space-y-1.5"><Label htmlFor="comment" className="text-xs text-muted-foreground">Notes <span className="font-normal">(optional)</span></Label><Textarea id="comment" placeholder="Add a note about this payout" className="min-h-16 resize-none rounded-md" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
                </div>
              </section>
            </div>
          ) : <div className="py-16 text-center"><AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" /><p className="text-sm font-medium">Failed to load payout details</p></div>}
        </div>
        {data && <div className="shrink-0 border-t border-border bg-background px-5 py-4">
          <div className="mb-3 flex items-end justify-between gap-4"><div><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net pay</span><p className="text-xs text-muted-foreground">Gross less adjustments</p></div><span className="text-2xl font-semibold tracking-tight tabular-nums">₱{money(netPay)}</span></div>
          <div className="grid grid-cols-2 gap-3"><Button variant="outline" onClick={() => changeOpen(false)} disabled={generating} className="h-10 cursor-pointer rounded-md">Cancel</Button><Button onClick={generate} disabled={generating} className="h-10 cursor-pointer rounded-md">{generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Payout</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

function PayRow({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return <div className={`flex justify-between text-sm tabular-nums ${total ? "border-t border-dashed border-border pt-2.5 font-semibold" : ""}`}><span className={total ? "" : "text-muted-foreground"}>{label}</span><span>{value}</span></div>;
}

function CommissionDetails({ services, percentage }: { services: CommissionService[]; percentage: number }) {
  return <div className="max-h-48 overflow-y-auto border-b border-border">
    <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border bg-muted px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Customer · Service · Date</span><span>Commission</span></div>
    <div className="divide-y divide-border">{services.map((service) => {
      const customer = service.booking.customer?.name ?? service.booking.customer_label ?? "Walk-in customer";
      const commission = ((service.commission_base ?? service.price) * percentage) / 100;
      return <div key={service.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 text-xs"><div className="min-w-0"><p className="truncate font-medium">{customer}</p><p className="truncate text-muted-foreground">{service.service.name}{service.package ? ` · ${service.package.name}` : ""}{service.completed_at ? ` · ${formatPH(service.completed_at, "MMM d, yyyy")}` : ""}</p></div><span className="font-medium tabular-nums">₱{money(commission, true)}</span></div>;
    })}</div>
  </div>;
}
