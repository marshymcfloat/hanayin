"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import { Plus, Search, Ticket, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { deleteVoucherAction } from "@/lib/server actions/vouchers";
import { VoucherForm } from "./VoucherForm";
import { VoucherList } from "./VoucherList";
import { useRouter } from "next/navigation";

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

interface VoucherManagementClientProps {
  vouchers: Voucher[];
  businessSlug: string;
  initials: string;
}

export function VoucherManagementClient({
  vouchers,
  businessSlug,
  initials,
}: VoucherManagementClientProps) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [voucherToDelete, setVoucherToDelete] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleCopy = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: number) => {
    startTransition(async () => {
      try {
        const res = await deleteVoucherAction(id);
        if (res.success) {
          toast.success("Voucher deleted");
          router.refresh();
        } else {
          toast.error(res.error || "Failed to delete voucher");
        }
      } catch {
        toast.error("An error occurred");
      }
      setVoucherToDelete(null);
    });
  };

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((voucher) =>
      voucher.code.toLowerCase().includes(search.toLowerCase()),
    );
  }, [vouchers, search]);

  return (
    <div className="flex flex-col bg-background" data-business-slug={businessSlug}>

      {/* ── Page Header ────────────────────────────────── */}
      <div className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Ticket className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] sm:text-xl font-bold tracking-tight text-foreground">
                  Vouchers
                </h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                  {filteredVouchers.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                Manage discount codes and vouchers for your customers.
              </p>
            </div>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-9 rounded-xl bg-primary px-3 text-primary-foreground font-semibold shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4"
              >
                <Plus className="h-4 w-4 sm:mr-2" strokeWidth={2.5} />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Create Voucher</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 gap-0 overflow-hidden">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl font-bold text-foreground">
                  Create New Voucher
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Create a promo code for your customers to use.
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 py-4 pb-6">
                <VoucherForm
                  onSuccess={() => {
                    setIsCreateOpen(false);
                    router.refresh();
                  }}
                  initials={initials}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto w-full flex flex-col gap-4">

          {/* Toolbar card */}
          <div className="bg-card border border-border rounded-2xl shadow-sm px-3 sm:px-4 py-3">
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <Input
                  placeholder="Search vouchers..."
                  className="pl-9 h-9 rounded-xl border-border bg-background shadow-none focus-visible:ring-primary/30"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={isRefreshing}
                className="h-9 gap-2 rounded-xl text-muted-foreground hover:text-foreground hidden sm:flex shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleRefresh}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="text-sm">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {filteredVouchers.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                  <Ticket className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  No vouchers found
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  {vouchers.length === 0
                    ? "Get started by creating your first voucher to boost sales."
                    : "Try adjusting your search terms."}
                </p>
                {vouchers.length === 0 && (
                  <Button
                    onClick={() => setIsCreateOpen(true)}
                    className="rounded-xl bg-primary hover:bg-primary/90 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Voucher
                  </Button>
                )}
              </div>
            ) : (
              <VoucherList
                vouchers={filteredVouchers}
                onDelete={setVoucherToDelete}
                onCopy={handleCopy}
                copiedId={copiedId}
              />
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!voucherToDelete}
        onOpenChange={(open) => !open && setVoucherToDelete(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this voucher. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={() => voucherToDelete && handleDelete(voucherToDelete)}
            >
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
