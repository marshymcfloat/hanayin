"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateOwnerPermissionsAction } from "@/features/workforce/actions/owners";

// Display order. Matches the OwnerPermission enum order in schema.prisma.
// Sales-only is intentionally placed next to Reports-Full so the
// mutually-exclusive pairing is visible at a glance.
const PERMISSION_GROUPS: {
  label: string;
  items: { value: string; label: string; description: string }[];
}[] = [
  {
    label: "Billing",
    items: [
      {
        value: "BILLING_VIEW",
        label: "View billing",
        description: "See invoices, plan, payment history.",
      },
      {
        value: "BILLING_MANAGE",
        label: "Manage billing",
        description: "Submit manual payments, change plan.",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        value: "REPORTS_VIEW_FULL",
        label: "Full reports",
        description: "Sales + payroll + employee performance.",
      },
      {
        value: "REPORTS_VIEW_SALES_ONLY",
        label: "Sales only",
        description: "Revenue dashboards without payroll data.",
      },
    ],
  },
  {
    label: "Team",
    items: [
      {
        value: "EMPLOYEES_MANAGE",
        label: "Manage employees",
        description: "Add, edit, remove employee accounts.",
      },
      {
        value: "STAFF_MANAGE",
        label: "Manage staff perms",
        description: "Change permissions on the staff page.",
      },
      {
        value: "PAYROLL_MANAGE",
        label: "Manage payroll",
        description: "Generate and release payslips.",
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        value: "SETTINGS_MANAGE",
        label: "Business settings",
        description: "Edit hours, structure, growth config.",
      },
      {
        value: "CATALOG_MANAGE",
        label: "Catalog",
        description: "Edit services, packages, pricing.",
      },
    ],
  },
];

export function EditOwnerPermissionsDialog({
  ownerId,
  ownerName,
  isPrimary,
  currentPermissions,
  open,
  onOpenChange,
}: {
  ownerId: number;
  ownerName: string;
  isPrimary: boolean;
  currentPermissions: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(currentPermissions),
  );
  const [saving, setSaving] = React.useState(false);

  // Reset local state whenever the dialog opens for a different owner.
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(currentPermissions));
    }
  }, [open, currentPermissions]);

  function toggle(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
        // REPORTS_VIEW_FULL implies sales-only, so adding full clears
        // the narrower chip and vice versa. Keeps the mental model
        // crisp instead of letting both be checked.
        if (value === "REPORTS_VIEW_FULL") {
          next.delete("REPORTS_VIEW_SALES_ONLY");
        } else if (value === "REPORTS_VIEW_SALES_ONLY") {
          next.delete("REPORTS_VIEW_FULL");
        }
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateOwnerPermissionsAction(
        ownerId,
        Array.from(selected),
      );
      if (result.success) {
        toast.success("Permissions updated");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update permissions",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Owner Permissions</DialogTitle>
          <DialogDescription>
            Capabilities for <strong>{ownerName}</strong>.
            {isPrimary ? (
              <span className="block mt-1 text-xs text-amber-700">
                Primary owner: SETTINGS_MANAGE can&apos;t be removed --
                someone has to be able to edit these.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const isSelected = selected.has(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => toggle(item.value)}
                      className={cn(
                        "flex items-start gap-2 rounded-xl border p-3 text-left transition-colors cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/30",
                      )}
                      aria-pressed={isSelected}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card",
                        )}
                      >
                        {isSelected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
            disabled={saving}
            className="rounded-xl cursor-pointer"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
