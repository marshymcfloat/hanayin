"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Employee, User, Payslip } from "@/prisma/generated/prisma/client";
import { formatPH } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/utils";
import { Plus, Wallet, Phone, Search, RefreshCcw, History } from "lucide-react";
import { useState, useRef } from "react";
import { PayslipGenerationDialog } from "@/components/dashboard/owner/PayslipGenerationDialog";
import { PayslipAuditDialog } from "@/components/dashboard/owner/PayslipAuditDialog";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

type EmployeeWithDetails = Employee & {
  user: User;
  payslips: Payslip[];
};

export function PayrollPageClient({
  employees,
}: {
  employees: EmployeeWithDetails[];
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [auditEmployee, setAuditEmployee] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const handleSuccess = () => {
    router.refresh();
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.user.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.user.contact_number.toLowerCase().includes(search.toLowerCase()),
  );

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
      "bg-green-500",
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

  return (
    <>
      <div className="flex flex-col bg-background">
        <div className="border-b border-border bg-card">
          <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Wallet className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Payroll</h1>
                <p className="text-xs text-muted-foreground">Manage employee salaries and generate payslips.</p>
              </div>
              <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {employees.length} {employees.length === 1 ? "employee" : "employees"}
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-4 sm:py-6">
          <div className="max-w-7xl mx-auto w-full space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="pl-9 h-9 rounded-xl border-border bg-background"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-xl border-border bg-background text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
                onClick={handleRefresh}
              >
                <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Wallet className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No employees found</h3>
                <p className="text-muted-foreground max-w-sm">
                  {employees.length === 0
                    ? "Add employees to start managing payroll."
                    : "Try adjusting your search terms."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Mobile Card View */}
                <div className="md:hidden grid grid-cols-1 gap-3">
                  {filteredEmployees.map((emp) => {
                    const lastPayslip = emp.payslips[0];
                    return (
                      <div
                        key={emp.id}
                        className="bg-card rounded-2xl p-4 border border-border flex flex-col gap-4 transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className={`${getAvatarColor(emp.user.name)} h-10 w-10 text-white shadow-sm`}>
                            <AvatarFallback className="bg-transparent font-medium">
                              {getInitials(emp.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {emp.user.name}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5" />
                              {emp.user.contact_number}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 py-3 border-y border-border/50">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Daily Rate</span>
                            <span className="font-semibold text-foreground">
                              {formatCurrency(emp.daily_rate)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Commission</span>
                            <Badge variant="secondary" className="w-fit border-primary/30 bg-primary/10 text-primary">
                              {emp.commission_percentage}%
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Last Payout</span>
                          {lastPayslip ? (
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {formatPH(lastPayslip.ending_date, "MMM d, yyyy")}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border text-muted-foreground">
                                {formatCurrency(lastPayslip.total_salary)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">No history</span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl cursor-pointer"
                            onClick={() => {
                              setSelectedEmployeeId(emp.id);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Generate Payslip
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-xl cursor-pointer border-border"
                            onClick={() =>
                              setAuditEmployee({
                                id: emp.id,
                                name: emp.user.name,
                              })
                            }
                            aria-label={`View payslip audit for ${emp.user.name}`}
                            title="Payslip audit history"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-2xl border border-border overflow-hidden bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border bg-muted/50">
                        <TableHead className="pl-6 h-11 font-semibold text-muted-foreground w-[300px]">
                          Employee
                        </TableHead>
                        <TableHead className="h-11 font-semibold text-muted-foreground">
                          Daily Rate
                        </TableHead>
                        <TableHead className="h-11 font-semibold text-muted-foreground">
                          Commission
                        </TableHead>
                        <TableHead className="h-11 font-semibold text-muted-foreground">
                          Last Payout
                        </TableHead>
                        <TableHead className="text-right pr-6 h-11 font-semibold text-muted-foreground w-[180px]">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((emp) => {
                        const lastPayslip = emp.payslips[0];
                        return (
                          <TableRow
                            key={emp.id}
                            className="hover:bg-accent/30 transition-colors border-border/50"
                          >
                            <TableCell className="pl-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar className={`${getAvatarColor(emp.user.name)} h-9 w-9 text-white shadow-sm`}>
                                  <AvatarFallback className="bg-transparent font-medium">
                                    {getInitials(emp.user.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">
                                    {emp.user.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Phone className="h-3 w-3" />
                                    {emp.user.contact_number}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 font-medium text-foreground">
                              {formatCurrency(emp.daily_rate)}
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-primary">
                                {emp.commission_percentage}%
                              </Badge>
                            </TableCell>
                            <TableCell className="py-4">
                              {lastPayslip ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm font-medium text-foreground">
                                    {formatPH(lastPayslip.ending_date, "MMM d, yyyy")}
                                  </span>
                                  <Badge variant="outline" className="w-fit text-[10px] h-5 px-1.5 text-muted-foreground border-border">
                                    {formatCurrency(lastPayslip.total_salary)}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm italic">
                                  No payout yet
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-6 py-4">
                              <div className="inline-flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-2 rounded-xl cursor-pointer text-muted-foreground hover:text-foreground"
                                  onClick={() =>
                                    setAuditEmployee({
                                      id: emp.id,
                                      name: emp.user.name,
                                    })
                                  }
                                  aria-label={`View payslip audit for ${emp.user.name}`}
                                  title="Audit history"
                                >
                                  <History className="h-4 w-4" />
                                  History
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 rounded-xl border-border hover:bg-accent/30 cursor-pointer"
                                  onClick={() => {
                                    setSelectedEmployeeId(emp.id);
                                    setIsDialogOpen(true);
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Generate
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PayslipGenerationDialog
        employeeId={selectedEmployeeId}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={handleSuccess}
      />

      {auditEmployee ? (
        <PayslipAuditDialog
          employeeId={auditEmployee.id}
          employeeName={auditEmployee.name}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAuditEmployee(null);
          }}
        />
      ) : null}
    </>
  );
}
