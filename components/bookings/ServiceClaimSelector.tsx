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
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      {showBulkActions && (canClaimAll || canClear) && (
        <div className="flex h-8 items-center justify-end gap-2 border-b border-border/60 bg-muted/25 px-2.5 text-[11px]">
          {canClaimAll && (
            <button
              type="button"
              onClick={handleClaimAll}
              className="rounded px-1.5 py-1 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="rounded px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="divide-y divide-border/60">
        {services.map((service) => {
          const isChecked = claimedSet.has(service.uniqueId);
          return (
            <label
              key={service.uniqueId}
              htmlFor={`claim-${service.uniqueId}`}
              className={cn(
                "flex min-h-10 cursor-pointer select-none items-center gap-2.5 px-2.5 py-1.5 transition-colors",
                isChecked
                  ? "bg-primary/[0.06]"
                  : "bg-card hover:bg-muted/30",
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
                  "flex-1 truncate text-[13px] font-medium",
                  isChecked ? "text-primary" : "text-foreground",
                )}
              >
                {service.name}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                {"₱"}
                {service.price.toLocaleString()} · {service.duration || 30}m
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
