"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Owner, User } from "@/prisma/generated/prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCcw, Crown } from "lucide-react";
import { EditOwnerSpecialtiesDialog } from "@/components/owners/EditOwnerSpecialtiesDialog";
import { OwnersTable } from "@/components/owners/OwnersTable";

type OwnerWithUser = Owner & {
  user: User;
};

interface OwnersPageClientProps {
  owners: OwnerWithUser[];
  businessSlug: string;
  categories: string[];
}

export function OwnersPageClient({
  owners,
  businessSlug,
  categories,
}: OwnersPageClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<OwnerWithUser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const filteredOwners = useMemo(() => {
    return owners.filter((owner) => {
      return (
        owner.user.name.toLowerCase().includes(search.toLowerCase()) ||
        owner.user.contact_number.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [owners, search]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleEditSpecialties = (owner: OwnerWithUser) => {
    setSelectedOwner(owner);
    setIsEditDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsEditDialogOpen(false);
    setSelectedOwner(null);
  };

  return (
    <div className="flex flex-col bg-background" data-business-slug={businessSlug}>
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Crown className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Business Owners</h1>
              <p className="text-xs text-muted-foreground">Manage business owners and their service specialties.</p>
            </div>
            <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {owners.length} {owners.length === 1 ? "owner" : "owners"}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search owners..."
                className="pl-9 h-9 rounded-xl border-border bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-xl border-border bg-background text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
              onClick={handleRefresh}
            >
              <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          {filteredOwners.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                <Crown className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No owners found</h3>
              <p className="text-muted-foreground max-w-sm">
                {owners.length === 0
                  ? "No business owners registered."
                  : "Try adjusting your search terms."}
              </p>
            </div>
          ) : (
            <OwnersTable owners={filteredOwners} onEditSpecialties={handleEditSpecialties} />
          )}
        </div>
      </div>

      <EditOwnerSpecialtiesDialog
        owner={selectedOwner}
        categories={categories}
        open={isEditDialogOpen && selectedOwner !== null}
        onOpenChange={handleDialogClose}
        onSuccess={() => {
          handleDialogClose();
          router.refresh();
        }}
      />
    </div>
  );
}
