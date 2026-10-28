import type { EmployeesWorkspaceEmployee } from "@/features/workforce/queries/employees";
import { PeoplePayrollSetup } from "@/components/payroll/PeoplePayrollSetup";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  MoreHorizontal,
  Pencil,
  KeyRound,
  Trash2,
  Phone,
  Wallet,
  Calendar,
  CalendarClock,
  Briefcase,
  ShieldCheck,
  Send,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { formatPH } from "@/lib/date-utils";
import { EditPermissionsDialog } from "@/components/dashboard/owner/employees/EditPermissionsDialog";

type EmployeeWithDetails = EmployeesWorkspaceEmployee;

interface EmployeeListProps {
  employees: EmployeeWithDetails[];
  /** Required so EditPermissionsDialog can scope its server-side update. */
  businessSlug: string;
  canAccessPayroll: boolean;
  showLegacyCompensation: boolean;
  onEdit: (employee: EmployeeWithDetails) => void;
  onDelete: (id: number) => void;
  onResetPassword: (employee: EmployeeWithDetails) => void;
  onEditSchedule: (employee: EmployeeWithDetails) => void;
  onResendInvite: (employee: EmployeeWithDetails) => void;
}

const AVATAR_GRADIENTS = [
  "from-primary/80 to-primary",
  "from-emerald-400 to-emerald-600",
  "from-teal-400 to-teal-600",
  "from-lime-400 to-green-600",
  "from-green-400 to-green-700",
  "from-emerald-500 to-teal-600",
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getProfileLabel(profile: string) {
  switch (profile) {
    case "MANAGER":
      return "Manager";
    case "CASHIER":
      return "Cashier";
    default:
      return "Staff";
  }
}

function getProfileBadgeClass(profile: string) {
  switch (profile) {
    case "MANAGER":
      return "border-primary/40 bg-primary/10 text-primary";
    case "CASHIER":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function EmployeeList({
  employees,
  businessSlug,
  canAccessPayroll,
  showLegacyCompensation,
  onEdit,
  onDelete,
  onResetPassword,
  onEditSchedule,
  onResendInvite,
}: EmployeeListProps) {
  return (
    <>
      {/* MOBILE: card grid */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {employees.map((employee) => {
          const lastPayslip = employee.payslips[0];
          const gradient = getAvatarGradient(employee.user.name);
          return (
            <article
              key={employee.id}
              className="bg-card rounded-2xl border border-border overflow-hidden"
            >
              {/* Top: identity + overflow */}
              <div className="flex items-start gap-3 p-4 pb-3">
                <Avatar
                  className={cn(
                    "h-12 w-12 shrink-0 text-white shadow-sm bg-gradient-to-br",
                    gradient,
                  )}
                >
                  <AvatarFallback className="bg-transparent font-semibold text-sm">
                    {getInitials(employee.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate text-[15px] leading-tight">
                      {employee.user.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 text-[10px] font-semibold uppercase tracking-wider",
                        getProfileBadgeClass(employee.profile),
                      )}
                    >
                      {getProfileLabel(employee.profile)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{employee.user.contact_number}</span>
                  </div>
                </div>
                <DeleteAction
                  employeeName={employee.user.name}
                  onDelete={() => onDelete(employee.id)}
                />
              </div>

              {/* Stats — flat 2x2 grid with hairline dividers (no nested cards) */}
              {showLegacyCompensation && <div className="px-4 grid grid-cols-2 border-t border-border divide-x divide-border">
                <Stat
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  label="Daily rate"
                  value={formatCurrency(employee.daily_rate ?? 0)}
                  className="pr-3 py-3"
                />
                <Stat
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Commission"
                  value={`${employee.commission_percentage}%`}
                  tone="primary"
                  className="pl-3 py-3"
                />
              </div>}
              <div className="px-4 grid grid-cols-2 border-t border-border divide-x divide-border">
                <Stat
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                  label="Services"
                  value={employee._count.served_services.toLocaleString()}
                  className="pr-3 py-3"
                />
                {showLegacyCompensation && <Stat
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Last payout"
                  value={
                    lastPayslip
                      ? formatPH(lastPayslip.ending_date, "MMM d, yyyy")
                      : "—"
                  }
                  className="pl-3 py-3"
                />}
              </div>

              {canAccessPayroll && <div className="px-4 py-3"><PeoplePayrollSetup employeeId={employee.id} employeeName={employee.user.name} payrollHref={"/app/" + businessSlug + "/payroll"} /></div>}
              {/* Action row — persistent, no hidden dropdown for primary actions */}
              <div className="grid grid-cols-3 border-t border-border bg-muted/30">
                <ActionCell
                  icon={<Pencil className="h-4 w-4" />}
                  label="Edit"
                  onClick={() => onEdit(employee)}
                />
                <EditPermissionsDialog
                  businessSlug={businessSlug}
                  employeeId={employee.id}
                  employeeName={employee.user.name}
                  currentPermissions={employee.permissions}
                  trigger={
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1.5 h-11 text-xs font-medium text-foreground hover:bg-accent/60 transition-colors cursor-pointer border-l border-border"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Permissions
                    </button>
                  }
                />
                <ActionCell
                  icon={<KeyRound className="h-4 w-4" />}
                  label="Reset"
                  onClick={() => onResetPassword(employee)}
                  className="border-l border-border"
                />
              </div>
            </article>
          );
        })}
      </div>

      {/* DESKTOP: table */}
      <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border bg-muted/40">
              <TableHead className="w-[300px] font-semibold text-muted-foreground pl-6 h-12 text-xs uppercase tracking-wider">
                Employee
              </TableHead>
              {showLegacyCompensation && <TableHead className="font-semibold text-muted-foreground h-12 text-xs uppercase tracking-wider">
                Daily Rate
              </TableHead>}
              {showLegacyCompensation && <TableHead className="font-semibold text-muted-foreground h-12 text-xs uppercase tracking-wider">
                Commission
              </TableHead>}
              <TableHead className="font-semibold text-muted-foreground h-12 text-xs uppercase tracking-wider">
                Profile
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12 text-xs uppercase tracking-wider">
                Services
              </TableHead>
              {showLegacyCompensation && <TableHead className="font-semibold text-muted-foreground h-12 text-xs uppercase tracking-wider">
                Last Payout
              </TableHead>}
              <TableHead className="text-right w-[80px] font-semibold text-muted-foreground pr-6 h-12 text-xs uppercase tracking-wider">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => {
              const lastPayslip = employee.payslips[0];
              const gradient = getAvatarGradient(employee.user.name);
              return (
                <TableRow
                  key={employee.id}
                  className="hover:bg-accent/40 transition-colors border-border/60"
                >
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        className={cn(
                          "h-9 w-9 text-white shadow-sm bg-gradient-to-br",
                          gradient,
                        )}
                      >
                        <AvatarFallback className="bg-transparent text-sm font-semibold">
                          {getInitials(employee.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-foreground truncate">
                          {employee.user.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {employee.user.contact_number}
                        </span>
                        {canAccessPayroll && <PeoplePayrollSetup employeeId={employee.id} employeeName={employee.user.name} payrollHref={"/app/" + businessSlug + "/payroll"} />}
                      </div>
                    </div>
                  </TableCell>
                  {showLegacyCompensation && <TableCell className="py-4 font-medium text-foreground tabular-nums">
                    {formatCurrency(employee.daily_rate ?? 0)}
                  </TableCell>}
                  {showLegacyCompensation && <TableCell className="py-4">
                    <Badge
                      variant="secondary"
                      className="border-primary/30 bg-primary/10 text-primary tabular-nums"
                    >
                      {employee.commission_percentage}%
                    </Badge>
                  </TableCell>}
                  <TableCell className="py-4">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        getProfileBadgeClass(employee.profile),
                      )}
                    >
                      {getProfileLabel(employee.profile)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground bg-muted px-2 py-0.5 rounded-md min-w-8 text-center tabular-nums">
                        {employee._count.served_services}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        completed
                      </span>
                    </div>
                  </TableCell>
                  {showLegacyCompensation && <TableCell className="py-4">
                    {lastPayslip ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {formatPH(lastPayslip.ending_date, "MMM d, yyyy")}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ₱{lastPayslip.total_salary.toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm italic">
                        Never
                      </span>
                    )}
                  </TableCell>}
                  <TableCell className="text-right pr-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer"
                          aria-label={`Actions for ${employee.user.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 rounded-xl">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onEdit(employee)}
                          className="cursor-pointer"
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onResetPassword(employee)}
                          className="cursor-pointer"
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onEditSchedule(employee)}
                          className="cursor-pointer"
                        >
                          <CalendarClock className="h-4 w-4 mr-2" />
                          Edit Schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onResendInvite(employee)}
                          className="cursor-pointer"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Resend Invite SMS
                        </DropdownMenuItem>
                        <EditPermissionsDialog
                          businessSlug={businessSlug}
                          employeeId={employee.id}
                          employeeName={employee.user.name}
                          currentPermissions={employee.permissions}
                          trigger={
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="cursor-pointer"
                            >
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              Permissions
                            </DropdownMenuItem>
                          }
                        />
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Archive Employee
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Archive Employee</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to archive &quot;
                                {employee.user.name}&quot;? Their attendance and
                                payslip history will be preserved.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                                onClick={() => onDelete(employee.id)}
                              >
                                Archive
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "neutral",
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "primary";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={cn(tone === "primary" ? "text-primary" : "text-muted-foreground")}>
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ActionCell({
  icon,
  label,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 h-11 text-xs font-medium text-foreground hover:bg-accent/60 transition-colors cursor-pointer",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DeleteAction({
  employeeName,
  onDelete,
}: {
  employeeName: string;
  onDelete: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 -mr-1 -mt-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
          aria-label={`Delete ${employeeName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive Employee</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to archive &quot;{employeeName}&quot;? Their
            attendance and payslip history will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            onClick={onDelete}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
