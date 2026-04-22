"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { updateSaleEvent } from "@/lib/server actions/sale-event";
import { DiscountType } from "@/prisma/generated/prisma/enums";

type SaleEventEditView = {
  id: number;
  title: string;
  description: string | null;
  start_date: Date | string;
  end_date: Date | string;
  discount_type: DiscountType;
  discount_value: number;
  applicable_services: Array<{ id: number }>;
  applicable_packages: Array<{ id: number }>;
};

function toDateTimeLocalInput(value: Date | string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type Props = {
  businessSlug: string;
  event: SaleEventEditView;
  services: { id: number; name: string; category: string }[];
  packages: { id: number; name: string }[];
  trigger?: ReactNode;
};

export function EditSaleEventDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, startSave] = useTransition();

  const [title, setTitle] = useState(props.event.title);
  const [description, setDescription] = useState(props.event.description ?? "");
  const [startDate, setStartDate] = useState(toDateTimeLocalInput(props.event.start_date));
  const [endDate, setEndDate] = useState(toDateTimeLocalInput(props.event.end_date));
  const [discountType, setDiscountType] = useState<DiscountType>(props.event.discount_type);
  const [discountValue, setDiscountValue] = useState<number>(props.event.discount_value);
  const [serviceIds, setServiceIds] = useState<number[]>(
    props.event.applicable_services.map((service) => service.id),
  );
  const [packageIds, setPackageIds] = useState<number[]>(
    props.event.applicable_packages.map((pkg) => pkg.id),
  );

  const servicesByCategory = useMemo(() => {
    const grouped = props.services.reduce(
      (acc, service) => {
        const key = service.category.trim() || "Uncategorized";
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(service);
        return acc;
      },
      {} as Record<string, Props["services"]>,
    );

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, services]) => ({
        category,
        services: services.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [props.services]);

  const toggleId = (
    key: "service" | "package",
    id: number,
    checked: boolean,
  ) => {
    if (key === "service") {
      setServiceIds((previous) =>
        checked ? Array.from(new Set([...previous, id])) : previous.filter((entry) => entry !== id),
      );
      return;
    }
    setPackageIds((previous) =>
      checked ? Array.from(new Set([...previous, id])) : previous.filter((entry) => entry !== id),
    );
  };

  const onSave = () => {
    startSave(async () => {
      if (!title.trim()) {
        toast.error("Title is required.");
        return;
      }
      if (!startDate || !endDate) {
        toast.error("Start and end dates are required.");
        return;
      }
      if (serviceIds.length === 0 && packageIds.length === 0) {
        toast.error("Select at least one service or package.");
        return;
      }

      const result = await updateSaleEvent({
        id: props.event.id,
        businessSlug: props.businessSlug,
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        discountType,
        discountValue,
        serviceIds,
        packageIds,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to update event.");
        return;
      }

      toast.success("Sale event updated.");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {props.trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl rounded-3xl p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold text-foreground">Edit Sale Event</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Adjust schedule, discount, and service/package scope.
          </DialogDescription>
        </DialogHeader>
        <div className="h-px bg-border mx-6" />

        <div className="px-6 py-4 space-y-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input className="h-10 rounded-xl" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              className="rounded-xl resize-none"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                className="h-10 rounded-xl"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>End</Label>
              <Input
                type="datetime-local"
                className="h-10 rounded-xl"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Discount Type</Label>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value as DiscountType)}
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Discount Value</Label>
              <Input
                type="number"
                step="0.01"
                className="h-10 rounded-xl"
                value={discountValue}
                onChange={(event) => setDiscountValue(Number(event.target.value) || 0)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">Services ({serviceIds.length} selected)</p>
            {servicesByCategory.length === 0 ? (
              <p className="text-xs text-muted-foreground">No services available.</p>
            ) : (
              <div className="space-y-2">
                {servicesByCategory.map(({ category, services }) => (
                  <div key={category} className="rounded-lg border border-border bg-background p-3">
                    <p className="mb-2 text-xs font-semibold text-foreground">{category}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {services.map((service) => (
                        <label
                          key={service.id}
                          className="flex items-center gap-2 text-sm text-foreground min-h-10 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent/30 transition-colors"
                        >
                          <Checkbox
                            checked={serviceIds.includes(service.id)}
                            onCheckedChange={(checked) =>
                              toggleId("service", service.id, checked === true)
                            }
                          />
                          {service.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">Packages ({packageIds.length} selected)</p>
            {props.packages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No packages available.</p>
            ) : (
              <div className="grid gap-1.5 rounded-lg border border-border bg-background p-3 sm:grid-cols-2">
                {props.packages.map((pkg) => (
                  <label
                    key={pkg.id}
                    className="flex items-center gap-2 text-sm text-foreground min-h-10 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    <Checkbox
                      checked={packageIds.includes(pkg.id)}
                      onCheckedChange={(checked) =>
                        toggleId("package", pkg.id, checked === true)
                      }
                    />
                    {pkg.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl cursor-pointer" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            onClick={onSave}
            disabled={isSaving}
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
