import { format } from "date-fns";
import {
  Calendar,
  Check,
  Copy,
  Gift,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type GiftCardListItem = {
  id: number;
  code: string;
  customer_name: string;
  customer_email: string;
  expires_at: Date;
  is_claimed: boolean;
  included_services: { service: { id: number; name: string } }[];
  included_packages: { package: { id: number; name: string } }[];
};

interface GiftCardListProps {
  giftCards: GiftCardListItem[];
  copiedId: number | null;
  onCopy: (code: string, id: number) => void;
  onEdit: (giftCard: GiftCardListItem) => void;
  onDelete: (id: number) => void;
}

function getStatusBadge(giftCard: GiftCardListItem) {
  if (giftCard.is_claimed) {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
        Claimed
      </Badge>
    );
  }

  if (new Date(giftCard.expires_at) < new Date()) {
    return (
      <Badge
        variant="destructive"
        className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
      >
        Expired
      </Badge>
    );
  }

  return (
    <Badge className="border border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
      Active
    </Badge>
  );
}

function includedItems(giftCard: GiftCardListItem) {
  return [
    ...giftCard.included_services.map((item) => item.service.name),
    ...giftCard.included_packages.map((item) => item.package.name),
  ];
}

export function GiftCardList({
  giftCards,
  copiedId,
  onCopy,
  onEdit,
  onDelete,
}: GiftCardListProps) {
  return (
    <>
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {giftCards.map((giftCard) => {
          const items = includedItems(giftCard);

          return (
            <div
              key={giftCard.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-accent/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1">
                      <Gift className="h-3.5 w-3.5 text-primary/60" />
                      <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
                        {giftCard.code}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
                      onClick={() => onCopy(giftCard.code, giftCard.id)}
                    >
                      {copiedId === giftCard.id ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {giftCard.customer_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{giftCard.customer_email}</p>
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
                    <DropdownMenuItem onClick={() => onEdit(giftCard)} className="cursor-pointer">
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                      onClick={() => onDelete(giftCard.id)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap gap-1">
                {items.slice(0, 3).map((itemName) => (
                  <Badge
                    key={`${giftCard.id}-${itemName}`}
                    variant="outline"
                    className="h-5 bg-muted/30 border-border text-[10px] font-normal"
                  >
                    {itemName}
                  </Badge>
                ))}
                {items.length > 3 && (
                  <Badge
                    variant="outline"
                    className="h-5 bg-muted/30 border-border text-[10px] font-normal text-muted-foreground"
                  >
                    +{items.length - 3} more
                  </Badge>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-xs font-medium">
                    Expires {format(new Date(giftCard.expires_at), "MMM d, yyyy")}
                  </span>
                </div>
                {getStatusBadge(giftCard)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/50">
              <TableHead className="h-12 w-[200px] pl-6 font-semibold text-muted-foreground">
                Gift Card Code
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">Customer</TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">Included</TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">Expires</TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">Status</TableHead>
              <TableHead className="h-12 w-[90px] pr-6 text-right font-semibold text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {giftCards.map((giftCard) => {
              const items = includedItems(giftCard);

              return (
                <TableRow
                  key={giftCard.id}
                  className="group border-border transition-colors hover:bg-accent/30"
                >
                  <TableCell className="py-4 pl-6">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1">
                        <Gift className="h-3.5 w-3.5 text-primary/60" />
                        <span className="font-mono text-sm font-medium text-foreground">
                          {giftCard.code}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100 cursor-pointer"
                        onClick={() => onCopy(giftCard.code, giftCard.id)}
                      >
                        {copiedId === giftCard.id ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-foreground">
                        {giftCard.customer_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {giftCard.customer_email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex max-w-[280px] flex-wrap gap-1">
                      {items.slice(0, 3).map((itemName) => (
                        <Badge
                          key={`${giftCard.id}-desktop-${itemName}`}
                          variant="outline"
                          className="h-5 bg-background border-border text-[10px] font-normal"
                        >
                          {itemName}
                        </Badge>
                      ))}
                      {items.length > 3 && (
                        <Badge
                          variant="outline"
                          className="h-5 bg-muted/30 border-border text-[10px] font-normal text-muted-foreground"
                        >
                          +{items.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-muted-foreground">
                    {format(new Date(giftCard.expires_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="py-4">{getStatusBadge(giftCard)}</TableCell>
                  <TableCell className="py-4 pr-6 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 cursor-pointer"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px] rounded-xl shadow-lg">
                        <DropdownMenuItem onClick={() => onEdit(giftCard)} className="cursor-pointer">
                          <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                          onClick={() => onDelete(giftCard.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
