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
  Mail,
  Wallet,
  Calendar,
  User,
} from "lucide-react";
import { formatPH } from "@/lib/date-utils";
import {
  Employee,
  User as PrismaUser,
  EmployeeAttendance,
  Payslip,
} from "@/prisma/generated/prisma/client";

type EmployeeWithDetails = Employee & {
  user: PrismaUser;
  attendance: EmployeeAttendance[];
  payslips: Payslip[];
  _count: {
    served_services: number;
  };
};

interface EmployeeListProps {
  employees: EmployeeWithDetails[];
  onEdit: (employee: EmployeeWithDetails) => void;
  onDelete: (id: number) => void;
  onResetPassword: (employee: EmployeeWithDetails) => void;
}

export function EmployeeList({
  employees,
  onEdit,
  onDelete,
  onResetPassword,
}: EmployeeListProps) {
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

  const getProfileLabel = (profile: string) => {
    switch (profile) {
      case "MANAGER":
        return "Manager";
      case "CASHIER":
        return "Cashier";
      default:
        return "Staff";
    }
  };

  const getProfileBadgeClass = (profile: string) => {
    switch (profile) {
      case "MANAGER":
        return "bg-indigo-50 text-indigo-700 border-indigo-100";
      case "CASHIER":
        return "bg-amber-50 text-amber-700 border-amber-100";
      default:
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
    }
  };

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {employees.map((employee) => {
          const lastPayslip = employee.payslips[0];
          return (
            <div
              key={employee.id}
              className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex flex-col gap-4 transition-all active:scale-[0.99] active:bg-zinc-50/50"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <Avatar
                    className={`${getAvatarColor(employee.user.name)} h-10 w-10 text-white shadow-sm ring-2 ring-white`}
                  >
                    <AvatarFallback className="bg-transparent font-medium">
                      {getInitials(employee.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-900">
                        {employee.user.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`h-5 text-[10px] ${getProfileBadgeClass(employee.profile)}`}
                      >
                        {getProfileLabel(employee.profile)}
                      </Badge>
                    </div>
                    <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      {employee.user.email}
                    </span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-400 -mr-2 hover:text-zinc-600"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEdit(employee)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onResetPassword(employee)}>
                      <KeyRound className="h-4 w-4 mr-2" />
                      Reset Password
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          className="text-red-600 focus:text-red-700 focus:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Employee
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Employee</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &quot;
                            {employee.user.name}
                            &quot;? This will remove their employee record. Their
                            attendance and payslip history will also be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-lg">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white rounded-lg"
                            onClick={() => onDelete(employee.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="grid grid-cols-2 gap-3 py-3 border-y border-zinc-50">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Daily Rate
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                    <Wallet className="h-3.5 w-3.5 text-emerald-500" />PHP 
                    {employee.daily_rate.toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Commission
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-100"
                    >
                      {employee.commission_percentage}%
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <User className="h-3.5 w-3.5" />
                  <span>
                    <strong className="text-zinc-900">
                      {employee._count.served_services}
                    </strong>{" "}
                    services
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {lastPayslip ? (
                    <span>
                      Paid {formatPH(lastPayslip.ending_date, "MMM d, yyyy")}
                    </span>
                  ) : (
                    <span className="text-zinc-400">No payout yet</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-3xl border border-zinc-100 overflow-hidden shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-zinc-50/80 sticky top-0 z-10 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent border-zinc-100">
              <TableHead className="w-[300px] font-semibold text-zinc-500 pl-6 h-12">
                Employee
              </TableHead>
              <TableHead className="font-semibold text-zinc-500 h-12">
                Daily Rate
              </TableHead>
              <TableHead className="font-semibold text-zinc-500 h-12">
                Commission
              </TableHead>
              <TableHead className="font-semibold text-zinc-500 h-12">
                Profile
              </TableHead>
              <TableHead className="font-semibold text-zinc-500 h-12">
                Services
              </TableHead>
              <TableHead className="font-semibold text-zinc-500 h-12">
                Last Payout
              </TableHead>
              <TableHead className="text-right w-[80px] font-semibold text-zinc-500 pr-6 h-12">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => {
              const lastPayslip = employee.payslips[0];

              return (
                <TableRow
                  key={employee.id}
                  className="hover:bg-zinc-50/50 transition-colors border-zinc-100 group"
                >
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        className={`${getAvatarColor(employee.user.name)} h-9 w-9 text-white shadow-sm ring-2 ring-white`}
                      >
                        <AvatarFallback className="bg-transparent text-sm font-medium">
                          {getInitials(employee.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-900">
                          {employee.user.name}
                        </span>
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          {employee.user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 font-medium text-zinc-700">
                    PHP {employee.daily_rate.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 transition-colors"
                    >
                      {employee.commission_percentage}%
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      variant="outline"
                      className={getProfileBadgeClass(employee.profile)}
                    >
                      {getProfileLabel(employee.profile)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <span className="text-sm font-semibold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md min-w-8 text-center">
                        {employee._count.served_services}
                      </span>
                      <span className="text-xs">completed</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    {lastPayslip ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-zinc-700">
                          {formatPH(lastPayslip.ending_date, "MMM d, yyyy")}
                        </span>
                        <Badge
                          variant="outline"
                          className="w-fit text-[10px] h-5 px-1.5 text-zinc-500 border-zinc-200"
                        >
                          PHP {lastPayslip.total_salary.toLocaleString()}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-zinc-400 text-sm italic">
                        Never
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-56 rounded-xl"
                      >
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEdit(employee)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onResetPassword(employee)}
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-red-600 focus:text-red-700 focus:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Employee
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete Employee
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete &quot;
                                {employee.user.name}&quot;? This will remove their
                                employee record. Their attendance and payslip
                                history will also be deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-lg">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg"
                                onClick={() => onDelete(employee.id)}
                              >
                                Delete
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
