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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee, Payslip } from "@/prisma/generated/prisma/client";
import type { PublicUser } from "@/lib/auth/public-user";
import { formatPH } from "@/lib/date-utils";
import { Plus } from "lucide-react";
import { useState } from "react";
import { PayslipGenerationDialog } from "./PayslipGenerationDialog";
import { useRouter } from "next/navigation";

// Define the type matching what we fetch in OwnerDashboardDataContainer
type EmployeeWithDetails = Employee & {
  user: PublicUser;
  payslips: Payslip[];
};

export function PayrollList({
  employees,
}: {
  employees: EmployeeWithDetails[];
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    router.refresh();
  };

  return (
    <>
      <Card className="h-full shadow-sm border-zinc-100 flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold">Payroll</CardTitle>
              <CardDescription>
                Manage employee salaries and generate payslips
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0 border-t min-h-[400px]">
          <Table>
            <TableHeader className="bg-zinc-50/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Daily Rate</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Last Payout</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length > 0 ? (
                employees.map((emp) => {
                  const lastPayslip = emp.payslips[0];
                  return (
                    <TableRow key={emp.id} className="hover:bg-zinc-50/50">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{emp.user.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {emp.user.contact_number}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>₱{emp.daily_rate.toLocaleString()}</TableCell>
                      <TableCell>{emp.commission_percentage}%</TableCell>
                      <TableCell>
                        {lastPayslip ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium">
                              {formatPH(lastPayslip.ending_date, "MMM d, yyyy")}
                            </span>
                            <Badge
                              variant="outline"
                              className="w-fit text-[10px] h-5"
                            >
                              ₱{lastPayslip.total_salary.toLocaleString()}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            Never
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => {
                            setSelectedEmployeeId(emp.id);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          Generate Payslip
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No employees found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PayslipGenerationDialog
        employeeId={selectedEmployeeId}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
