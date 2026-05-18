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
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { Check, Copy, Trash2, Ticket } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface Voucher {
  id: number;
  code: string;
  type: "PERCENTAGE" | "FLAT";
  value: number;
  minimum_amount: number;
  expires_at: Date;
  is_active: boolean;
  used_by: { id: number } | null;
}

interface VoucherListProps {
  vouchers: Voucher[];
  onDelete: (id: number) => void;
  onCopy: (code: string, id: number) => void;
  copiedId: number | null;
}

export function VoucherList({
  vouchers,
  onDelete,
  onCopy,
  copiedId,
}: VoucherListProps) {
  const getStatusBadge = (voucher: Voucher) => {
    if (voucher.used_by) {
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
          Used
        </Badge>
      );
    }
    if (!voucher.is_active) {
      return (
        <Badge variant="outline" className="text-muted-foreground border-border">
          Inactive
        </Badge>
      );
    }
    if (new Date(voucher.expires_at) < new Date()) {
      return (
        <Badge
          variant="destructive"
          className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200"
        >
          Expired
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 shadow-sm">
        Active
      </Badge>
    );
  };

  const formatDiscount = (voucher: Voucher) =>
    voucher.type === "PERCENTAGE"
      ? `${voucher.value}% OFF`
      : `${formatCurrency(voucher.value)} OFF`;

  return (
    <>
      {/* â”€â”€ Mobile: Ticket-style cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {vouchers.map((voucher) => (
          <div
            key={voucher.id}
            className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
          >
            {/* Ticket top */}
            <div className="px-4 pt-4 pb-3 bg-primary/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Ticket className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-mono text-sm font-bold tracking-wider text-foreground truncate">
                      {voucher.code}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg cursor-pointer"
                      onClick={() => onCopy(voucher.code, voucher.id)}
                    >
                      {copiedId === voucher.id ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {formatDiscount(voucher)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {getStatusBadge(voucher)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg cursor-pointer"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[160px] rounded-xl">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        onClick={() => onDelete(voucher.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Ticket perforation line */}
            <div className="relative flex items-center">
              <div className="h-3.5 w-3.5 rounded-full bg-background border border-border -ml-[7px] shrink-0" />
              <div className="flex-1 border-t border-dashed border-border/70" />
              <div className="h-3.5 w-3.5 rounded-full bg-background border border-border -mr-[7px] shrink-0" />
            </div>

            {/* Ticket bottom */}
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Min. spend
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {voucher.minimum_amount > 0
                    ? formatCurrency(voucher.minimum_amount)
                    : "None"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Expires
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {format(new Date(voucher.expires_at), "MMM d, yyyy")}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* â”€â”€ Desktop: Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="hidden lg:block rounded-2xl border border-border overflow-hidden shadow-sm bg-card">
        <Table>
          <TableHeader className="bg-muted/60 sticky top-0 z-10 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[200px] font-semibold text-muted-foreground pl-6 h-12">
                Voucher Code
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Discount Value
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Min. Spend
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Expires
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground h-12">
                Status
              </TableHead>
              <TableHead className="text-right w-[100px] font-semibold text-muted-foreground pr-6 h-12">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vouchers.map((voucher) => (
              <TableRow
                key={voucher.id}
                className="hover:bg-accent/30 transition-colors border-border group"
              >
                <TableCell className="pl-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-muted/30 group-hover:bg-background transition-colors">
                      <Ticket className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                      <span className="font-mono text-sm font-medium text-foreground">
                        {voucher.code}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-all hover:text-primary hover:bg-primary/10 cursor-pointer"
                      onClick={() => onCopy(voucher.code, voucher.id)}
                    >
                      {copiedId === voucher.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {voucher.type === "PERCENTAGE"
                        ? `${voucher.value}%`
                        : formatCurrency(voucher.value)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {voucher.type === "PERCENTAGE"
                        ? "Percentage"
                        : "Flat Amount"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-4 text-foreground/80 font-medium">
                  {voucher.minimum_amount > 0
                    ? formatCurrency(voucher.minimum_amount)
                    : "â€”"}
                </TableCell>
                <TableCell className="py-4 text-muted-foreground">
                  {format(new Date(voucher.expires_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="py-4">
                  {getStatusBadge(voucher)}
                </TableCell>
                <TableCell className="text-right pr-6 py-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    onClick={() => onDelete(voucher.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
