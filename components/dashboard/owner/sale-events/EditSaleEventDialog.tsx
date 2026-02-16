"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-700">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Sale Event</DialogTitle>
          <DialogDescription>
            Adjust schedule, discount, and service/package scope before publishing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>End</Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Discount Type</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
                value={discountValue}
                onChange={(event) => setDiscountValue(Number(event.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Services ({serviceIds.length} selected)</p>
            {servicesByCategory.length === 0 ? (
              <p className="text-xs text-zinc-500">No services available.</p>
            ) : (
              <div className="space-y-3">
                {servicesByCategory.map(({ category, services }) => (
                  <div key={category} className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-semibold text-zinc-700">{category}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {services.map((service) => (
                        <label
                          key={service.id}
                          className="flex items-center gap-2 text-sm text-zinc-700"
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

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Packages ({packageIds.length} selected)</p>
            {props.packages.length === 0 ? (
              <p className="text-xs text-zinc-500">No packages available.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {props.packages.map((pkg) => (
                  <label key={pkg.id} className="flex items-center gap-2 text-sm text-zinc-700">
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

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
