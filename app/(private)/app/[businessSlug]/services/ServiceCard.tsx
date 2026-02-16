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
  getCategoryColor: (category: string) => string;
}

function ServiceCardComponent({
  service,
  onEdit,
  onDelete,
  getCategoryColor,
}: ServiceCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm transition-colors active:bg-zinc-50/40 motion-reduce:transition-none [content-visibility:auto] [contain-intrinsic-size:188px] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 text-zinc-900 sm:text-base">
            {service.name}
          </h3>
          {service.description ? (
            <p className="line-clamp-2 text-xs leading-4 text-zinc-500 sm:text-sm">
              {service.description}
            </p>
          ) : (
            <p className="text-xs leading-4 text-zinc-400">No description</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open actions for ${service.name}`}
              className="-mr-1 size-11 rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 motion-reduce:transition-none"
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
              className="min-h-10 cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
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
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold sm:text-[11px]",
            getCategoryColor(service.category),
          )}
        >
          {service.category}
        </Badge>
        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
          <Clock className="h-3.5 w-3.5 text-zinc-400" />
          {service.duration ? `${service.duration} min` : "\u2014"}
        </span>
      </div>

      <div className="mt-3 border-t border-zinc-100 pt-2.5">
        <div className="flex items-end justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Price
          </span>
          <span className="text-lg font-bold leading-none text-zinc-900 sm:text-xl">
            {formatCurrency(service.price)}
          </span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Est. Cost
          </span>
          <span className="text-sm font-semibold leading-none text-zinc-700">
            {formatCurrency(service.estimated_cost)}
          </span>
        </div>
      </div>
    </div>
  );
}

export const ServiceCard = memo(ServiceCardComponent);
