import { memo } from "react";
import { Service } from "@/prisma/generated/prisma/client";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ServiceCard } from "./ServiceCard";
import { cn } from "@/lib/utils";

interface ServiceListProps {
  services: Service[];
  onEdit: (service: Service) => void;
  onDelete: (serviceId: number) => void;
  onCategoryClick?: (category: string) => void;
}

export const CATEGORY_COLORS: Record<string, string> = {
  Hair: "bg-purple-100 text-purple-700 border-purple-200",
  Nails: "bg-pink-100 text-pink-700 border-pink-200",
  Facial: "bg-green-100 text-green-700 border-green-200",
  Massage: "bg-blue-100 text-blue-700 border-blue-200",
  Makeup: "bg-orange-100 text-orange-700 border-orange-200",
  default: "bg-muted text-muted-foreground border-border",
};

export function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

function ServiceListComponent({ services, onEdit, onDelete, onCategoryClick }: ServiceListProps) {
  return (
    <>
      {/* Mobile card grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:hidden">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            onEdit={onEdit}
            onDelete={onDelete}
            onCategoryClick={onCategoryClick}
            getCategoryColor={getCategoryColor}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/50">
              <TableHead className="h-12 w-[320px] pl-6 font-semibold text-muted-foreground">
                Service
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">
                Category
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">
                Duration
              </TableHead>
              <TableHead className="h-12 text-right font-semibold text-muted-foreground">
                Price
              </TableHead>
              <TableHead className="h-12 text-right font-semibold text-muted-foreground">
                Est. Cost
              </TableHead>
              <TableHead className="h-12 w-[100px] pr-6 text-right font-semibold text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow
                key={service.id}
                className="group border-border transition-colors hover:bg-accent/30"
              >
                <TableCell className="py-4 pl-6">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground">{service.name}</span>
                    {service.description && (
                      <span className="line-clamp-1 max-w-[280px] text-xs text-muted-foreground">
                        {service.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <Badge
                    variant="secondary"
                    onClick={() => onCategoryClick?.(service.category)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 font-medium shadow-sm transition-opacity",
                      onCategoryClick ? "cursor-pointer hover:opacity-75" : "cursor-default",
                      getCategoryColor(service.category),
                    )}
                  >
                    {service.category}
                  </Badge>
                </TableCell>
                <TableCell className="py-4">
                  {service.duration ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="text-sm font-medium">{service.duration} min</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                  )}
                </TableCell>
                <TableCell className="py-4 text-right font-bold text-foreground">
                  {formatCurrency(service.price)}
                </TableCell>
                <TableCell className="py-4 text-right font-semibold text-muted-foreground">
                  {formatCurrency(service.estimated_cost)}
                </TableCell>
                <TableCell className="py-4 pr-6 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none cursor-pointer"
                        aria-label={`Open actions for ${service.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[170px] rounded-xl shadow-lg">
                      <DropdownMenuItem
                        onClick={() => onEdit(service)}
                        className="min-h-10 cursor-pointer"
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export const ServiceList = memo(ServiceListComponent);
