"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Plus, RefreshCcw, Search } from "lucide-react";
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

import {
  createGiftCardAction,
  deleteGiftCardAction,
  generateGiftCardCodeAction,
  updateGiftCardAction,
} from "@/lib/server actions/gift-cards";
import {
  GiftCardForm,
  type GiftCardFormValues,
  type GiftCardOption,
} from "./GiftCardForm";
import { GiftCardList } from "./GiftCardList";

type GiftCardData = {
  id: number;
  code: string;
  customer_name: string;
  customer_email: string;
  expires_at: Date;
  is_claimed: boolean;
  included_services: { service: { id: number; name: string } }[];
  included_packages: { package: { id: number; name: string } }[];
};

interface GiftCardsPageClientProps {
  giftCards: GiftCardData[];
  services: GiftCardOption[];
  packages: GiftCardOption[];
  initials: string;
  businessSlug: string;
}

export function GiftCardsPageClient({
  giftCards,
  services,
  packages,
  initials,
  businessSlug,
}: GiftCardsPageClientProps) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGiftCard, setEditingGiftCard] = useState<GiftCardData | null>(
    null,
  );
  const [giftCardToDelete, setGiftCardToDelete] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const filteredGiftCards = useMemo(() => {
    const query = search.toLowerCase();

    return giftCards.filter((giftCard) => {
      const matchesMainFields =
        giftCard.code.toLowerCase().includes(query) ||
        giftCard.customer_name.toLowerCase().includes(query) ||
        giftCard.customer_email.toLowerCase().includes(query);

      if (matchesMainFields) return true;

      const serviceMatch = giftCard.included_services.some((item) =>
        item.service.name.toLowerCase().includes(query),
      );

      const packageMatch = giftCard.included_packages.some((item) =>
        item.package.name.toLowerCase().includes(query),
      );

      return serviceMatch || packageMatch;
    });
  }, [giftCards, search]);

  const handleCopy = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("Gift card code copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);

    try {
      const result = await generateGiftCardCodeAction();

      if (!result.success || !result.code) {
        toast.error(result.error || "Failed to generate code");
        return null;
      }

      return result.code;
    } catch {
      toast.error("Failed to generate code");
      return null;
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCreate = async (values: GiftCardFormValues) => {
    setIsSaving(true);

    try {
      const result = await createGiftCardAction(values);

      if (!result.success) {
        toast.error(result.error || "Failed to create gift card");
        return;
      }

      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success("Gift card created and emailed successfully");
      }

      setIsCreateOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to create gift card");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (values: GiftCardFormValues) => {
    if (!editingGiftCard) return;

    setIsSaving(true);

    try {
      const result = await updateGiftCardAction(editingGiftCard.id, values);

      if (!result.success) {
        toast.error(result.error || "Failed to update gift card");
        return;
      }

      toast.success("Gift card updated");
      setEditingGiftCard(null);
      router.refresh();
    } catch {
      toast.error("Failed to update gift card");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    startDeleteTransition(async () => {
      try {
        const result = await deleteGiftCardAction(id);

        if (!result.success) {
          toast.error(result.error || "Failed to delete gift card");
          return;
        }

        toast.success("Gift card deleted");
        setGiftCardToDelete(null);
        router.refresh();
      } catch {
        toast.error("Failed to delete gift card");
      }
    });
  };

  return (
    <div className="flex flex-col bg-background" data-business-slug={businessSlug}>

      {/* ── Page Header ────────────────────────────────── */}
      <div className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Gift className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] sm:text-xl font-bold tracking-tight text-foreground">
                  Gift Cards
                </h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                  {filteredGiftCards.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                Create and manage gift cards for your customers
              </p>
            </div>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-9 rounded-xl bg-primary px-3 text-primary-foreground font-semibold shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4"
              >
                <Plus className="h-4 w-4 sm:mr-2" strokeWidth={2.5} />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Create Gift Card</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-[95%] overflow-hidden rounded-3xl p-0 md:max-w-[860px]">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl font-bold text-foreground">
                  Create Gift Card
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Assign services or packages, set expiry, then send the code by email.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto px-6 pb-6">
                <GiftCardForm
                  businessSlug={businessSlug}
                  initials={initials}
                  services={services}
                  packages={packages}
                  isSubmitting={isSaving}
                  isGeneratingCode={isGeneratingCode}
                  submitLabel="Create Gift Card"
                  onGenerateCode={handleGenerateCode}
                  onSubmit={handleCreate}
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
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search gift cards..."
                  className="pl-9 h-9 rounded-xl border-border bg-background shadow-none focus-visible:ring-primary/30"
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
            {filteredGiftCards.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                  <Gift className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  No gift cards found
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  {giftCards.length === 0
                    ? "Create your first gift card and send it directly to a customer."
                    : "Try adjusting your search terms."}
                </p>
                {giftCards.length === 0 && (
                  <Button
                    onClick={() => setIsCreateOpen(true)}
                    className="rounded-xl bg-primary hover:bg-primary/90 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Gift Card
                  </Button>
                )}
              </div>
            ) : (
              <GiftCardList
                giftCards={filteredGiftCards}
                copiedId={copiedId}
                onCopy={handleCopy}
                onEdit={setEditingGiftCard}
                onDelete={setGiftCardToDelete}
              />
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!editingGiftCard}
        onOpenChange={(open) => !open && setEditingGiftCard(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[95%] overflow-hidden rounded-3xl p-0 md:max-w-[860px]">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-bold text-foreground">
              Edit Gift Card
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update customer details, code, and included services/packages.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 pb-6">
            {editingGiftCard && (
              <GiftCardForm
                businessSlug={businessSlug}
                initials={initials}
                services={services}
                packages={packages}
                initialData={editingGiftCard}
                isSubmitting={isSaving}
                isGeneratingCode={isGeneratingCode}
                submitLabel="Save Changes"
                onGenerateCode={handleGenerateCode}
                onSubmit={handleUpdate}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!giftCardToDelete}
        onOpenChange={(open) => !open && setGiftCardToDelete(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gift Card?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the gift card record and code. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => giftCardToDelete && handleDelete(giftCardToDelete)}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
