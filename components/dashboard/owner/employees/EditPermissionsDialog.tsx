"use client";

/**
 * EditPermissionsDialog — owner-only UI to grant/revoke individual
 * StaffPermission flags per employee. The owner picks any subset of
 * the permission enum; sanitizeStaffPermissions on the server falls
 * back to the profile defaults if all flags are removed.
 *
 * Permission model lives in lib/auth/staff-access.ts and the matrix
 * docs/role-permissions-matrix.md. This dialog is the only UI in the
 * app that mutates an employee's permissions list.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { setEmployeePermissionsAction } from "@/features/workforce/actions/employee-permissions";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

/**
 * Permission flags grouped by feature so the dialog reads as
 * "what the employee can do" rather than a flat list of strings.
 * Updating the matrix later: edit this map and the helper text
 * renders automatically.
 */
const PERMISSION_GROUPS: ReadonlyArray<{
  label: string;
  description: string;
  permissions: ReadonlyArray<{
    flag: StaffPermission;
    label: string;
    description: string;
  }>;
}> = [
  {
    label: "Bookings",
    description: "Create and modify customer bookings.",
    permissions: [
      {
        flag: StaffPermission.BOOKING_CREATE,
        label: "Create bookings",
        description: "Take walk-ins and book customers.",
      },
      {
        flag: StaffPermission.BOOKING_MODIFY,
        label: "Modify bookings",
        description:
          "Add, swap, or remove services on an existing booking; reschedule.",
      },
      {
        flag: StaffPermission.BOOKING_MARK_NO_SHOW,
        label: "Mark no-show",
        description:
          "Flag a customer as no-show. Triggers customer trust-tier signal.",
      },
      {
        flag: StaffPermission.BOOKING_ADJUST_PRICE,
        label: "Adjust price",
        description: "Apply manual discounts or surcharges with a reason.",
      },
      {
        flag: StaffPermission.BOOKING_CANCEL,
        label: "Cancel bookings",
        description:
          "Soft-cancel a booking. The customer is notified automatically.",
      },
    ],
  },
  {
    label: "Payments",
    description: "Record money received at the front desk. This does not verify pending GCash deposits.",
    permissions: [
      {
        flag: StaffPermission.PAYMENT_COLLECT,
        label: "Collect payment",
        description: "Record partial or full booking payments. Deposit verification remains owner-only.",
      },
    ],
  },
  {
    label: "Queue",
    description: "Claim and complete service work.",
    permissions: [
      {
        flag: StaffPermission.QUEUE_CLAIM_SELF,
        label: "Claim available services",
        description: "Claim available services for self.",
      },
      {
        flag: StaffPermission.QUEUE_SERVE_SELF,
        label: "Complete own services",
        description: "Mark claimed services as done.",
      },
      {
        flag: StaffPermission.QUEUE_OVERRIDE_ALL,
        label: "Override queue",
        description:
          "Reassign service lines to other staff. Required for the booking-panel reassign action.",
      },
    ],
  },
  {
    label: "Catalog",
    description: "Manage what the business offers.",
    permissions: [
      {
        flag: StaffPermission.CATALOG_MANAGE,
        label: "Manage catalog",
        description: "Edit services, packages, and prices.",
      },
    ],
  },
  {
    label: "Social",
    description: "Submit, review, and publish social posts.",
    permissions: [
      {
        flag: StaffPermission.SOCIAL_POST_REQUEST_CREATE,
        label: "Request a post",
        description: "Submit a custom post idea for the owner to review.",
      },
      {
        flag: StaffPermission.SOCIAL_POST_REVIEW,
        label: "Review post requests",
        description: "Approve or reject staff post submissions.",
      },
      {
        flag: StaffPermission.SOCIAL_POST_PUBLISH,
        label: "Publish posts",
        description:
          "Push approved drafts to Facebook/Instagram. Defaults off — delegate carefully.",
      },
    ],
  },
];

export type EditPermissionsDialogProps = {
  businessSlug: string;
  employeeId: number;
  employeeName: string;
  /** Current permission list — used to seed the form on open. */
  currentPermissions: StaffPermission[];
  trigger?: React.ReactNode;
};

export function EditPermissionsDialog({
  businessSlug,
  employeeId,
  employeeName,
  currentPermissions,
  trigger,
}: EditPermissionsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<StaffPermission>>(
    () => new Set(currentPermissions),
  );
  const [submitting, setSubmitting] = useState(false);

  // Re-seed when the dialog reopens with a (possibly) updated current list.
  useEffect(() => {
    if (open) setPicked(new Set(currentPermissions));
  }, [open, currentPermissions]);

  const togglePermission = (flag: StaffPermission, checked: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(flag);
      } else {
        next.delete(flag);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await setEmployeePermissionsAction({
        businessSlug,
        employeeId,
        permissions: Array.from(picked),
      });
      if (!result.success) {
        showActionErrorToast(result.error, {
          action: "update permissions",
        });
        return;
      }
      toast.success("Permissions updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "update permissions" });
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
            variant="outline"
            size="sm"
            className="rounded-xl"
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-2" />
            Permissions
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-t-3xl rounded-b-none sm:rounded-3xl max-w-xl max-h-[92vh] sm:max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0">
          <DialogTitle className="text-lg sm:text-xl font-bold text-foreground">
            Edit permissions for {employeeName}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Toggle individual flags. If you uncheck everything, the
            employee&apos;s profile defaults are restored automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="h-px bg-border mx-5 sm:mx-6" />

        <form
          id="edit-permissions-form"
          onSubmit={handleSubmit}
          className="px-5 sm:px-6 py-4 overflow-y-auto flex-1 space-y-5"
        >
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label} className="space-y-1">
              <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </legend>
              <ul className="divide-y divide-border border-y border-border">
                {group.permissions.map((perm) => {
                  const id = `perm-${perm.flag}`;
                  const checked = picked.has(perm.flag);
                  return (
                    <li key={perm.flag}>
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex items-start gap-3 px-1 py-3 cursor-pointer transition-colors",
                          checked && "bg-primary/5",
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) =>
                            togglePermission(perm.flag, next === true)
                          }
                          disabled={submitting}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {perm.label}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </form>

        <div className="px-5 sm:px-6 py-4 border-t border-border bg-muted/30 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-permissions-form"
            className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>Save permissions</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
