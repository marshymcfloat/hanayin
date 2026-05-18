import { ServicePackage, Service } from "@/prisma/generated/prisma/client";
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
import { cn } from "@/lib/utils";

type ServicePackageWithItems = ServicePackage & {
  items: {
    service: Service;
    custom_price: number;
    service_id: number;
  }[];
};

interface PackageListProps {
  packages: ServicePackageWithItems[];
  onEdit: (pkg: ServicePackageWithItems) => void;
  onDelete: (pkgId: number) => void;
  onCategoryClick?: (category: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Hair: "bg-purple-100 text-purple-700 border-purple-200",
  Nails: "bg-pink-100 text-pink-700 border-pink-200",
  Facial: "bg-green-100 text-green-700 border-green-200",
  Massage: "bg-blue-100 text-blue-700 border-blue-200",
  Makeup: "bg-orange-100 text-orange-700 border-orange-200",
  default: "bg-muted text-muted-foreground border-border",
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

export function PackageList({ packages, onEdit, onDelete, onCategoryClick }: PackageListProps) {
  return (
    <>
      {/* Mobile Card View */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="bg-card rounded-2xl p-4 shadow-sm border border-border flex flex-col gap-3 transition-colors active:bg-accent/20"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-foreground truncate">
                    {pkg.name}
                  </h3>
                  <Badge
                    variant="secondary"
                    onClick={() => onCategoryClick?.(pkg.category)}
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-5 font-medium border-0 shrink-0 transition-opacity",
                      onCategoryClick ? "cursor-pointer hover:opacity-75" : "cursor-default",
                      getCategoryColor(pkg.category),
                    )}
                  >
                    {pkg.category}
                  </Badge>
                </div>
                {pkg.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {pkg.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {pkg.items.slice(0, 3).map((item) => (
                    <Badge
                      key={item.service_id}
                      variant="outline"
                      className="text-[10px] h-5 font-normal bg-muted/30 border-border"
                    >
                      {item.service.name}
                    </Badge>
                  ))}
                  {pkg.items.length > 3 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 font-normal bg-muted/30 text-muted-foreground"
                    >
                      +{pkg.items.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px] rounded-xl">
                  <DropdownMenuItem onClick={() => onEdit(pkg)} className="cursor-pointer">
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                    onClick={() => onDelete(pkg.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-border/60">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="text-xs font-medium">
                  {pkg.duration ? `${pkg.duration} mins` : "â€”"}
                </span>
              </div>
              <span className="font-bold text-foreground">
                {formatCurrency(pkg.price)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block rounded-2xl border border-border overflow-hidden shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border bg-muted/50">
              <TableHead className="w-[250px] font-semibold text-muted-foreground pl-6 h-12">
                Package Name
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Included Services
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Category
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Duration
              </TableHead>
              <TableHead className="text-right font-semibold text-muted-foreground h-12">
                Price
              </TableHead>
              <TableHead className="text-right w-[100px] font-semibold text-muted-foreground pr-6 h-12">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow
                key={pkg.id}
                className="hover:bg-accent/30 transition-colors border-border group"
              >
                <TableCell className="pl-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground">
                      {pkg.name}
                    </span>
                    {pkg.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                        {pkg.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex flex-wrap gap-1 max-w-[300px]">
                    {pkg.items.slice(0, 3).map((item) => (
                      <Badge
                        key={item.service_id}
                        variant="outline"
                        className="text-[10px] h-5 font-normal bg-background border-border"
                      >
                        {item.service.name}
                      </Badge>
                    ))}
                    {pkg.items.length > 3 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 font-normal text-muted-foreground bg-muted/30"
                      >
                        +{pkg.items.length - 3} more
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <Badge
                    variant="secondary"
                    onClick={() => onCategoryClick?.(pkg.category)}
                    className={cn(
                      "font-medium border shadow-sm px-2.5 py-0.5 rounded-full transition-opacity",
                      onCategoryClick ? "cursor-pointer hover:opacity-75" : "cursor-default",
                      getCategoryColor(pkg.category),
                    )}
                  >
                    {pkg.category}
                  </Badge>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <span className="text-sm font-medium">
                      {pkg.duration} min
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-foreground py-4">
                  {formatCurrency(pkg.price)}
                </TableCell>
                <TableCell className="text-right pr-6 py-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent hover:text-foreground cursor-pointer"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[160px] rounded-xl shadow-lg">
                      <DropdownMenuItem onClick={() => onEdit(pkg)} className="cursor-pointer">
                        <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        onClick={() => onDelete(pkg.id)}
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
