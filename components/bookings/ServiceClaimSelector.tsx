"use client";

import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ServiceItem {
  id: number;
  uniqueId: string;
  name: string;
  price: number;
  duration: number | null;
  quantity: number;
}

interface ServiceClaimSelectorProps {
  services: ServiceItem[];
  claimedUniqueIds: string[];
  onChange: (claimedIds: string[]) => void;
}

export default function ServiceClaimSelector({
  services,
  claimedUniqueIds,
  onChange,
}: ServiceClaimSelectorProps) {
  const totalServices = services.length;
  const claimedCount = claimedUniqueIds.length;

  const claimedSet = useMemo(() => new Set(claimedUniqueIds), [claimedUniqueIds]);

  const handleToggle = (uniqueId: string, checked: boolean) => {
    if (checked) {
      if (!claimedSet.has(uniqueId)) {
        onChange([...claimedUniqueIds, uniqueId]);
      }
      return;
    }

    onChange(claimedUniqueIds.filter((id) => id !== uniqueId));
  };

  const handleClaimAll = () => {
    onChange(services.map((service) => service.uniqueId));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const showBulkActions = totalServices > 1;
  const canClaimAll = claimedCount < totalServices;
  const canClear = claimedCount > 0;

  return (
    <div className="space-y-2">
      {showBulkActions && (canClaimAll || canClear) && (
        <div className="flex items-center justify-end gap-3 text-xs">
          {canClaimAll && (
            <button
              type="button"
              onClick={handleClaimAll}
              className="font-semibold text-primary hover:underline"
            >
              Claim all
            </button>
          )}
          {canClaimAll && canClear && (
            <span className="text-muted-foreground/40">·</span>
          )}
          {canClear && (
            <button
              type="button"
              onClick={handleClearAll}
              className="font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {services.map((service) => {
          const isChecked = claimedSet.has(service.uniqueId);
          return (
            <label
              key={service.uniqueId}
              htmlFor={`claim-${service.uniqueId}`}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors select-none",
                isChecked
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border/70 bg-card hover:bg-muted/30",
              )}
            >
              <Checkbox
                id={`claim-${service.uniqueId}`}
                checked={isChecked}
                onCheckedChange={(checked) =>
                  handleToggle(service.uniqueId, checked === true)
                }
                className="size-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span
                className={cn(
                  "flex-1 text-sm font-medium truncate",
                  isChecked ? "text-primary" : "text-foreground",
                )}
              >
                {service.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {"₱"}
                {service.price.toLocaleString()} · {service.duration || 30}min
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
