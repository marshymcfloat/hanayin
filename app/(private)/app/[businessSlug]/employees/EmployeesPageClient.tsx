"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Employee,
  EmployeeAttendance,
  Payslip,
  User,
} from "@/prisma/generated/prisma/client";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";
import {
  Search,
  Plus,
  Users,
  RefreshCcw,
  CheckCircle2,
  Briefcase,
  Percent,
  Check,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createEmployeeAction,
  deleteEmployeeAction,
  resendEmployeeInviteAction,
  resetEmployeePasswordAction,
  updateEmployeeAction,
} from "@/lib/server actions/employees";
import { EmployeeList } from "./EmployeeList";
import { ScheduleEditor } from "@/components/dashboard/owner/ScheduleEditor";

type EmployeeWithDetails = Employee & {
  user: User;
  attendance: EmployeeAttendance[];
  payslips: Payslip[];
  _count: {
    served_services: number;
  };
};

// Mirror of DEFAULT_PERMISSIONS_BY_PROFILE in lib/auth/staff-access.ts.
// Keep these in lockstep with the backend defaults and
// docs/role-permissions-matrix.md §2.
const PROFILE_DEFAULT_PERMISSIONS: Record<StaffProfile, StaffPermission[]> = {
  STAFF: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.QUEUE_CLAIM_SELF,
    StaffPermission.QUEUE_SERVE_SELF,
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
  ],
  MANAGER: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.BOOKING_MODIFY,
    StaffPermission.BOOKING_CANCEL,
    StaffPermission.BOOKING_MARK_NO_SHOW,
    StaffPermission.BOOKING_ADJUST_PRICE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.QUEUE_CLAIM_SELF,
    StaffPermission.QUEUE_SERVE_SELF,
    StaffPermission.QUEUE_OVERRIDE_ALL,
    StaffPermission.CATALOG_MANAGE,
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    StaffPermission.SOCIAL_POST_REVIEW,
  ],
  CASHIER: [
    StaffPermission.BOOKING_CREATE,
    StaffPermission.PAYMENT_COLLECT,
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
  ],
};

const PROFILE_OPTIONS: Array<{
  value: StaffProfile;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    value: StaffProfile.STAFF,
    label: "Staff",
    description: "Claims and serves their own queue items.",
    icon: Users,
  },
  {
    value: StaffProfile.MANAGER,
    label: "Manager",
    description: "Manages catalog and overrides queue.",
    icon: ShieldCheck,
  },
  {
    value: StaffProfile.CASHIER,
    label: "Cashier",
    description: "Front-desk: bookings + payments.",
    icon: Wallet,
  },
];

const PERMISSION_OPTIONS: Array<{
  value: StaffPermission;
  label: string;
  description: string;
}> = [
  {
    value: StaffPermission.BOOKING_CREATE,
    label: "Create bookings",
    description: "Can create or submit bookings.",
  },
  {
    value: StaffPermission.BOOKING_MODIFY,
    label: "Modify bookings",
    description:
      "Add or remove services and change time/staff on an existing booking.",
  },
  {
    value: StaffPermission.BOOKING_CANCEL,
    label: "Cancel bookings",
    description: "Soft-cancel a booking (recoverable).",
  },
  {
    value: StaffPermission.BOOKING_MARK_NO_SHOW,
    label: "Mark no-show",
    description: "Flag a customer as a no-show.",
  },
  {
    value: StaffPermission.BOOKING_ADJUST_PRICE,
    label: "Adjust booking price",
    description: "Apply manual discounts or override final price.",
  },
  {
    value: StaffPermission.PAYMENT_COLLECT,
    label: "Collect payments",
    description: "Can generate/review QR and mark bookings paid.",
  },
  {
    value: StaffPermission.QUEUE_CLAIM_SELF,
    label: "Claim own queue",
    description: "Can claim services for self.",
  },
  {
    value: StaffPermission.QUEUE_SERVE_SELF,
    label: "Serve own queue",
    description: "Can mark claimed services as served.",
  },
  {
    value: StaffPermission.QUEUE_OVERRIDE_ALL,
    label: "Queue override",
    description: "Can assign/reassign and override queue ownership.",
  },
  {
    value: StaffPermission.CATALOG_MANAGE,
    label: "Manage services/packages",
    description: "Can create/update/delete services and packages.",
  },
  {
    value: StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    label: "Request social posts",
    description: "Submit a custom-post request to the owner.",
  },
  {
    value: StaffPermission.SOCIAL_POST_REVIEW,
    label: "Review social posts",
    description: "Approve, reject, or edit post requests before draft.",
  },
  {
    value: StaffPermission.SOCIAL_POST_PUBLISH,
    label: "Publish social posts",
    description: "Take an approved draft and publish it.",
  },
];

const PROFILE_FILTERS: Array<{ value: "ALL" | StaffProfile; label: string }> = [
  { value: "ALL", label: "All" },
  { value: StaffProfile.STAFF, label: "Staff" },
  { value: StaffProfile.MANAGER, label: "Manager" },
  { value: StaffProfile.CASHIER, label: "Cashier" },
];

interface EmployeesPageClientProps {
  employees: EmployeeWithDetails[];
  businessSlug: string;
  categories: string[];
}

interface EmployeeFormData {
  name: string;
  contact_number: string;
  daily_rate: string;
  commission_percentage: string;
  profile: StaffProfile;
  permissions: StaffPermission[];
  specialties: string[];
  // 0=Sunday … 6=Saturday. Matches Prisma Employee.recurring_days_off.
  recurring_days_off: number[];
}

const initialFormData: EmployeeFormData = {
  name: "",
  contact_number: "",
  daily_rate: "",
  commission_percentage: "",
  profile: StaffProfile.STAFF,
  permissions: [...PROFILE_DEFAULT_PERMISSIONS[StaffProfile.STAFF]],
  specialties: [],
  recurring_days_off: [],
};

type OptimisticAction =
  | {
      type: "update";
      employeeId: number;
      data: {
        name: string;
        contact_number: string;
        daily_rate: number;
        commission_percentage: number;
        profile: StaffProfile;
        permissions: StaffPermission[];
        specialties: string[];
        recurring_days_off: number[];
      };
    }
  | { type: "delete"; employeeId: number }
  | { type: "add"; employee: EmployeeWithDetails };

export function EmployeesPageClient({
  employees,
  businessSlug,
  categories,
}: EmployeesPageClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState<"ALL" | StaffProfile>("ALL");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithDetails | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(initialFormData);
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  const [optimisticEmployees, addOptimisticUpdate] = useOptimistic(
    employees,
    (state: EmployeeWithDetails[], action: OptimisticAction) => {
      switch (action.type) {
        case "update":
          return state.map((emp) =>
            emp.id === action.employeeId
              ? {
                  ...emp,
                  daily_rate: action.data.daily_rate,
                  commission_percentage: action.data.commission_percentage,
                  profile: action.data.profile,
                  permissions: action.data.permissions,
                  specialties: action.data.specialties,
                  recurring_days_off: action.data.recurring_days_off,
                  user: {
                    ...emp.user,
                    name: action.data.name,
                    contact_number: action.data.contact_number,
                  },
                }
              : emp,
          );
        case "delete":
          return state.filter((emp) => emp.id !== action.employeeId);
        default:
          return state;
      }
    },
  );

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    return optimisticEmployees.filter((emp) => {
      const matchesSearch =
        !q ||
        emp.user.name.toLowerCase().includes(q) ||
        emp.user.contact_number.toLowerCase().includes(q);
      const matchesProfile =
        profileFilter === "ALL" || emp.profile === profileFilter;
      return matchesSearch && matchesProfile;
    });
  }, [optimisticEmployees, search, profileFilter]);

  const stats = useMemo(() => {
    const total = optimisticEmployees.length;
    // Server already scopes the attendance include to the last 7 days,
    // so any rows mean the member was active in that window.
    const activeThisWeek = optimisticEmployees.filter(
      (emp) => emp.attendance.length > 0,
    ).length;
    const servicesServed = optimisticEmployees.reduce(
      (sum, emp) => sum + emp._count.served_services,
      0,
    );
    const avgCommission =
      total === 0
        ? 0
        : Math.round(
            (optimisticEmployees.reduce(
              (sum, emp) => sum + emp.commission_percentage,
              0,
            ) /
              total) *
              10,
          ) / 10;
    return { total, activeThisWeek, servicesServed, avgCommission };
  }, [optimisticEmployees]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleAddEmployee = async () => {
    if (!formData.name || !formData.contact_number) {
      toast.error("Please fill in required fields");
      return;
    }
    setIsLoading(true);
    const result = await createEmployeeAction({
      name: formData.name,
      contact_number: formData.contact_number,
      daily_rate: parseFloat(formData.daily_rate) || 0,
      commission_percentage: parseFloat(formData.commission_percentage) || 0,
      profile: formData.profile,
      permissions: formData.permissions,
      specialties: formData.specialties,
      recurring_days_off: formData.recurring_days_off,
    });
    setIsLoading(false);
    if (result.success) {
      if ("warning" in result && result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success("Employee created. Temporary password sent via SMS.");
      }
      setIsAddDialogOpen(false);
      setFormData(initialFormData);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to create employee");
    }
  };

  const handleEditEmployee = async () => {
    if (!selectedEmployee || !formData.name || !formData.contact_number) {
      toast.error("Please fill in required fields");
      return;
    }
    const updateData = {
      name: formData.name,
      contact_number: formData.contact_number,
      daily_rate: parseFloat(formData.daily_rate) || 0,
      commission_percentage: parseFloat(formData.commission_percentage) || 0,
      profile: formData.profile,
      permissions: formData.permissions,
      specialties: formData.specialties,
      recurring_days_off: formData.recurring_days_off,
    };
    setIsEditDialogOpen(false);
    startTransition(async () => {
      addOptimisticUpdate({ type: "update", employeeId: selectedEmployee.id, data: updateData });
      const result = await updateEmployeeAction(selectedEmployee.id, updateData);
      if (result.success) {
        toast.success("Employee updated successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update employee");
        router.refresh();
      }
      setSelectedEmployee(null);
      setFormData(initialFormData);
    });
  };

  const handleDeleteEmployee = async (employeeId: number) => {
    startTransition(async () => {
      addOptimisticUpdate({ type: "delete", employeeId });
      const result = await deleteEmployeeAction(employeeId);
      if (result.success) {
        toast.success("Employee deleted successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete employee");
        router.refresh();
      }
    });
  };

  const handleResetPassword = async () => {
    if (!selectedEmployee || !newPassword) {
      toast.error("Please enter a new password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsLoading(true);
    const result = await resetEmployeePasswordAction(selectedEmployee.id, newPassword);
    setIsLoading(false);
    if (result.success) {
      toast.success("Password reset successfully");
      setIsResetPasswordDialogOpen(false);
      setSelectedEmployee(null);
      setNewPassword("");
    } else {
      toast.error(result.error || "Failed to reset password");
    }
  };

  const openEditDialog = (employee: EmployeeWithDetails) => {
    setSelectedEmployee(employee);
    setFormData({
      name: employee.user.name,
      contact_number: employee.user.contact_number,
      daily_rate: employee.daily_rate.toString(),
      commission_percentage: employee.commission_percentage.toString(),
      profile: employee.profile ?? StaffProfile.STAFF,
      permissions:
        employee.permissions && employee.permissions.length > 0
          ? employee.permissions
          : PROFILE_DEFAULT_PERMISSIONS[employee.profile ?? StaffProfile.STAFF],
      specialties: employee.specialties ?? [],
      recurring_days_off: employee.recurring_days_off ?? [],
    });
    setIsEditDialogOpen(true);
  };

  const openResetPasswordDialog = (employee: EmployeeWithDetails) => {
    setSelectedEmployee(employee);
    setNewPassword("");
    setIsResetPasswordDialogOpen(true);
  };

  const openScheduleDialog = (employee: EmployeeWithDetails) => {
    setSelectedEmployee(employee);
    setIsScheduleDialogOpen(true);
  };

  const handleResendInvite = async (employee: EmployeeWithDetails) => {
    const result = await resendEmployeeInviteAction(employee.id);
    if (result.success) {
      if ("warning" in result && result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(`Invite SMS resent to ${employee.user.name}.`);
      }
    } else {
      toast.error(result.error || "Failed to resend invite.");
    }
  };

  const hasActiveFilter = search.trim().length > 0 || profileFilter !== "ALL";
  const clearFilters = () => {
    setSearch("");
    setProfileFilter("ALL");
  };

  return (
    <div className="flex flex-col bg-background min-h-screen" data-business-slug={businessSlug}>
      {/* HEADER */}
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 pt-5 pb-4 sm:py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">Employees</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage your team, their roles, and permissions.
              </p>
            </div>
            <div className="hidden sm:block">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-sm">
                    <Plus className="h-4 w-4 mr-2" strokeWidth={2.5} />
                    <span className="font-semibold">Add Employee</span>
                  </Button>
                </DialogTrigger>
                <EmployeeFormDialog
                  title="Add New Employee"
                  description="Create an account. The employee will get a temporary password via SMS."
                  formData={formData}
                  setFormData={setFormData}
                  categories={categories}
                  onCancel={() => setIsAddDialogOpen(false)}
                  onSubmit={handleAddEmployee}
                  submitLabel={isLoading ? "Creating..." : "Create Employee"}
                  loading={isLoading}
                />
              </Dialog>
            </div>
          </div>

          {/* KPI strip — flat tiles inside the card header (no nested borders) */}
          <div className="mt-5 sm:mt-6 -mx-4 sm:mx-0 overflow-x-auto sm:overflow-visible">
            <div className="px-4 sm:px-0 flex sm:grid sm:grid-cols-4 gap-0 min-w-max sm:min-w-0 sm:divide-x sm:divide-border">
              <KpiTile
                icon={<Users className="h-4 w-4" />}
                label="Total members"
                value={stats.total.toString()}
              />
              <KpiTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Active this week"
                value={stats.activeThisWeek.toString()}
                tone="primary"
              />
              <KpiTile
                icon={<Briefcase className="h-4 w-4" />}
                label="Services served"
                value={stats.servicesServed.toLocaleString()}
              />
              <KpiTile
                icon={<Percent className="h-4 w-4" />}
                label="Avg commission"
                value={`${stats.avgCommission}%`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 flex-1">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          {/* Search + filter row */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name or contact number..."
                  className="pl-9 pr-9 h-11 rounded-xl border-border bg-card text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search employees"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleRefresh}
                aria-label="Refresh"
              >
                <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
              {PROFILE_FILTERS.map((opt) => {
                const active = profileFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProfileFilter(opt.value)}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border",
                    )}
                  >
                    {opt.label}
                    {opt.value !== "ALL" && (
                      <span className={cn(
                        "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}>
                        {optimisticEmployees.filter((e) => e.profile === opt.value).length}
                      </span>
                    )}
                  </button>
                );
              })}
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* List / empty state */}
          {filteredEmployees.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border px-6 py-10 sm:p-12 flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">
                {employees.length === 0 ? "No employees yet" : "No matches"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                {employees.length === 0
                  ? "Add your first team member to start assigning services and tracking attendance."
                  : "Try a different search term or clear the active filters."}
              </p>
              {employees.length === 0 ? (
                <Button onClick={() => setIsAddDialogOpen(true)} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first employee
                </Button>
              ) : (
                <Button onClick={clearFilters} variant="outline" className="rounded-xl cursor-pointer">
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <EmployeeList
              employees={filteredEmployees}
              businessSlug={businessSlug}
              onEdit={openEditDialog}
              onDelete={handleDeleteEmployee}
              onResetPassword={openResetPasswordDialog}
              onEditSchedule={openScheduleDialog}
              onResendInvite={handleResendInvite}
            />
          )}
        </div>
      </div>

      {/* Mobile sticky FAB to add */}
      <div className="sm:hidden sticky bottom-4 z-30 px-4 pb-[env(safe-area-inset-bottom)] pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-end">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="pointer-events-auto h-14 w-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30 cursor-pointer p-0"
                aria-label="Add employee"
              >
                <Plus className="h-6 w-6" strokeWidth={2.5} />
              </Button>
            </DialogTrigger>
            <EmployeeFormDialog
              title="Add New Employee"
              description="Create an account. The employee will get a temporary password via email."
              formData={formData}
              setFormData={setFormData}
              categories={categories}
              onCancel={() => setIsAddDialogOpen(false)}
              onSubmit={handleAddEmployee}
              submitLabel={isLoading ? "Creating..." : "Create Employee"}
              loading={isLoading}
            />
          </Dialog>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <EmployeeFormDialog
          title="Edit Employee"
          description="Update profile, rate, and permissions."
          formData={formData}
          setFormData={setFormData}
          categories={categories}
          onCancel={() => setIsEditDialogOpen(false)}
          onSubmit={handleEditEmployee}
          submitLabel={isLoading ? "Saving..." : "Save Changes"}
          loading={isLoading}
        />
      </Dialog>

      {/* Weekly schedule */}
      {selectedEmployee ? (
        <ScheduleEditor
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.user.name}
          open={isScheduleDialogOpen}
          onOpenChange={(open) => {
            setIsScheduleDialogOpen(open);
            if (!open) setSelectedEmployee(null);
          }}
        />
      ) : null}

      {/* Reset password */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent className="rounded-2xl sm:rounded-3xl max-w-md p-0 gap-0">
          <DialogHeader className="p-6 pb-3">
            <DialogTitle className="text-lg font-bold text-foreground">Reset Password</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Set a new password for {selectedEmployee?.user.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5 space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="Enter new password..."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
          </div>
          <div className="px-6 py-4 border-t border-border bg-muted/30 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 rounded-b-2xl sm:rounded-b-3xl">
            <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)} className="rounded-xl cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={isLoading} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
              {isLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "primary";
}) {
  return (
    <div className="shrink-0 sm:shrink min-w-[150px] sm:min-w-0 px-4 sm:px-5 py-2 sm:py-1 first:pl-0 sm:first:pl-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn(tone === "primary" ? "text-primary" : "text-muted-foreground")}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 text-2xl sm:text-2xl font-bold tabular-nums leading-tight",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmployeeFormDialog({
  title,
  description,
  formData,
  setFormData,
  categories,
  onCancel,
  onSubmit,
  submitLabel,
  loading,
}: {
  title: string;
  description: string;
  formData: EmployeeFormData;
  setFormData: (data: EmployeeFormData) => void;
  categories: string[];
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  loading: boolean;
}) {
  return (
    <DialogContent className="sm:max-w-3xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden rounded-t-3xl rounded-b-none sm:rounded-3xl p-0 gap-0 flex flex-col">
      <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0">
        <DialogTitle className="text-lg sm:text-xl font-bold text-foreground">{title}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
      </DialogHeader>
      <div className="h-px bg-border mx-5 sm:mx-6" />
      <div className="px-5 sm:px-6 py-4 overflow-y-auto flex-1">
        <EmployeeForm formData={formData} setFormData={setFormData} categories={categories} />
      </div>
      <div className="px-5 sm:px-6 py-4 border-t border-border bg-muted/30 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
        <Button variant="outline" onClick={onCancel} className="rounded-xl cursor-pointer">
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={loading} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
          {submitLabel}
        </Button>
      </div>
    </DialogContent>
  );
}

function EmployeeForm({
  formData,
  setFormData,
  categories,
}: {
  formData: EmployeeFormData;
  setFormData: (data: EmployeeFormData) => void;
  categories: string[];
}) {
  const isGeneralist = formData.specialties.length === 0;

  const toggleSpecialty = (category: string) => {
    const exists = formData.specialties.includes(category);
    const updated = exists
      ? formData.specialties.filter((item) => item !== category)
      : [...formData.specialties, category];
    setFormData({ ...formData, specialties: updated });
  };

  const handleProfileChange = (nextProfile: StaffProfile) => {
    setFormData({
      ...formData,
      profile: nextProfile,
      permissions: [...PROFILE_DEFAULT_PERMISSIONS[nextProfile]],
    });
  };

  const togglePermission = (permission: StaffPermission) => {
    const hasPermission = formData.permissions.includes(permission);
    const nextPermissions = hasPermission
      ? formData.permissions.filter((item) => item !== permission)
      : [...formData.permissions, permission];
    setFormData({ ...formData, permissions: nextPermissions });
  };

  return (
    <div className="grid gap-5">
      {/* Identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">
            Full Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="e.g., John Doe"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact_number">
            Contact Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="contact_number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09XX XXX XXXX"
            value={formData.contact_number}
            onChange={(e) =>
              setFormData({ ...formData, contact_number: e.target.value })
            }
            className="h-11 rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Used for sign-in. We&apos;ll send the temporary password here via
            SMS.
          </p>
        </div>
      </div>

      {/* Compensation */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="daily_rate">Daily Rate (PHP)</Label>
          <Input
            id="daily_rate"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={formData.daily_rate}
            onChange={(e) => setFormData({ ...formData, daily_rate: e.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="commission">Commission (%)</Label>
          <Input
            id="commission"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.1"
            placeholder="0"
            value={formData.commission_percentage}
            onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
      </div>

      {/* Profile — segmented track (no nested cards) */}
      <div className="grid gap-2">
        <Label>Staff Profile</Label>
        <div role="radiogroup" className="inline-flex w-full p-1 rounded-xl bg-muted">
          {PROFILE_OPTIONS.map((option) => {
            const isActive = formData.profile === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => handleProfileChange(option.value)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {PROFILE_OPTIONS.find((opt) => opt.value === formData.profile)?.description}
        </p>
      </div>

      {/* Permissions — flat list with hairlines, no wrapping sub-card */}
      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Label>Permissions</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adjust operational access for this employee.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setFormData({
                ...formData,
                permissions: [...PROFILE_DEFAULT_PERMISSIONS[formData.profile]],
              })
            }
            className="h-8 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
          >
            Use defaults
          </Button>
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {PERMISSION_OPTIONS.map((permission) => {
            const isChecked = formData.permissions.includes(permission.value);
            return (
              <li key={permission.value}>
                <label
                  className={cn(
                    "flex items-start gap-3 px-1 py-3 text-sm cursor-pointer transition-colors",
                    isChecked && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      if (checked === true || checked === false)
                        togglePermission(permission.value);
                    }}
                    className="mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-foreground">
                      {permission.label}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {permission.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Specialties */}
      <div className="grid gap-2">
        <Label>Specialties</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, specialties: [] })}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
              isGeneralist
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary/30",
            )}
          >
            {isGeneralist && <Check className="h-3.5 w-3.5" />}
            Generalist (All)
          </button>
          {categories.map((category) => {
            const isSelected = formData.specialties.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleSpecialty(category)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold capitalize border transition-colors cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/30",
                )}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
                {category}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Pick specialties or choose Generalist to allow all services.
        </p>
      </div>

      {/* Recurring days off — 0=Sun … 6=Sat to match BusinessHours
          and getPHDayOfWeek(). Honored by booking availability so
          customers can't book a day the employee never works. */}
      <div className="grid gap-2">
        <Label>Recurring days off</Label>
        <div className="flex flex-wrap gap-2">
          {[
            { day: 0, label: "Sun" },
            { day: 1, label: "Mon" },
            { day: 2, label: "Tue" },
            { day: 3, label: "Wed" },
            { day: 4, label: "Thu" },
            { day: 5, label: "Fri" },
            { day: 6, label: "Sat" },
          ].map(({ day, label }) => {
            const isSelected = formData.recurring_days_off.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  const next = isSelected
                    ? formData.recurring_days_off.filter((d) => d !== day)
                    : [...formData.recurring_days_off, day].sort((a, b) => a - b);
                  setFormData({ ...formData, recurring_days_off: next });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 min-w-[3rem] justify-center px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/30",
                )}
                aria-pressed={isSelected}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Days the employee never works. Customers won&apos;t see slots
          on these days even if business hours are open.
        </p>
      </div>
    </div>
  );
}
