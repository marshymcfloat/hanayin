import { memo } from "react";
import { Service } from "@/prisma/generated/prisma/client";
import { formatCurrency } from "@/lib/utils";
import { Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  service: Service;
  onEdit: (service: Service) => void;
  onDelete: (serviceId: number) => void;
  onCategoryClick?: (category: string) => void;
  getCategoryColor: (category: string) => string;
}

function ServiceCardComponent({
  service,
  onEdit,
  onDelete,
  onCategoryClick,
  getCategoryColor,
}: ServiceCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm transition-colors active:bg-accent/20 motion-reduce:transition-none sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 text-foreground sm:text-base">
            {service.name}
          </h3>
          {service.description ? (
            <p className="line-clamp-2 text-xs leading-4 text-muted-foreground sm:text-sm">
              {service.description}
            </p>
          ) : (
            <p className="text-xs leading-4 text-muted-foreground/50">No description</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open actions for ${service.name}`}
              className="-mr-1 size-9 shrink-0 rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[170px] rounded-xl">
            <DropdownMenuItem
              onClick={() => onEdit(service)}
              className="min-h-10 cursor-pointer"
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-10 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={() => onDelete(service.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge
          variant="secondary"
          onClick={() => onCategoryClick?.(service.category)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold sm:text-[11px] transition-opacity",
            onCategoryClick ? "cursor-pointer hover:opacity-75" : "cursor-default",
            getCategoryColor(service.category),
          )}
        >
          {service.category}
        </Badge>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
          {service.duration ? `${service.duration} min` : "\u2014"}
        </span>
      </div>

      <div className="mt-3 border-t border-border/60 pt-2.5">
        <div className="flex items-end justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Price
          </span>
          <span className="text-lg font-bold leading-none text-foreground sm:text-xl">
            {formatCurrency(service.price)}
          </span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Est. Cost
          </span>
          <span className="text-sm font-semibold leading-none text-foreground/70">
            {formatCurrency(service.estimated_cost)}
          </span>
        </div>
      </div>
    </div>
  );
}

export const ServiceCard = memo(ServiceCardComponent);
