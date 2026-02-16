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
}

const CATEGORY_COLORS: Record<string, string> = {
  Hair: "bg-purple-100 text-purple-700 border-purple-200",
  Nails: "bg-pink-100 text-pink-700 border-pink-200",
  Facial: "bg-green-100 text-green-700 border-green-200",
  Massage: "bg-blue-100 text-blue-700 border-blue-200",
  Makeup: "bg-orange-100 text-orange-700 border-orange-200",
  default: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

function ServiceListComponent({ services, onEdit, onDelete }: ServiceListProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:hidden">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            onEdit={onEdit}
            onDelete={onDelete}
            getCategoryColor={getCategoryColor}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
            <TableRow className="border-zinc-100 hover:bg-transparent">
              <TableHead className="h-12 w-[320px] pl-6 font-semibold text-zinc-500">
                Service
              </TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">
                Category
              </TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">
                Duration
              </TableHead>
              <TableHead className="h-12 text-right font-semibold text-zinc-500">
                Price
              </TableHead>
              <TableHead className="h-12 text-right font-semibold text-zinc-500">
                Est. Cost
              </TableHead>
              <TableHead className="h-12 w-[100px] pr-6 text-right font-semibold text-zinc-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow
                key={service.id}
                className="group border-zinc-100 transition-colors hover:bg-zinc-50/50"
              >
                <TableCell className="py-4 pl-6">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-zinc-900">{service.name}</span>
                    {service.description && (
                      <span className="line-clamp-1 max-w-[280px] text-xs text-zinc-500">
                        {service.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 font-medium shadow-sm",
                      getCategoryColor(service.category),
                    )}
                  >
                    {service.category}
                  </Badge>
                </TableCell>
                <TableCell className="py-4">
                  {service.duration ? (
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <Clock className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="text-sm font-medium">{service.duration} min</span>
                    </div>
                  ) : (
                    <span className="text-sm text-zinc-400">{"\u2014"}</span>
                  )}
                </TableCell>
                <TableCell className="py-4 text-right font-bold text-zinc-900">
                  {formatCurrency(service.price)}
                </TableCell>
                <TableCell className="py-4 text-right font-semibold text-zinc-700">
                  {formatCurrency(service.estimated_cost)}
                </TableCell>
                <TableCell className="py-4 pr-6 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 opacity-70 transition-opacity transition-colors hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                        aria-label={`Open actions for ${service.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[170px] rounded-xl border-zinc-100 shadow-lg"
                    >
                      <DropdownMenuItem
                        onClick={() => onEdit(service)}
                        className="min-h-10 cursor-pointer"
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5 text-zinc-500" />
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
