"use client";

import { useState, useMemo, useOptimistic, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Service, ServicePackage } from "@/prisma/generated/prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Package, RefreshCcw, Filter } from "lucide-react";
import { deletePackageAction } from "@/features/catalog/actions/packages";
import { toast } from "sonner";
import { PackageForm } from "./PackageForm";
import { PackageList } from "./PackageList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useOptionalViewer } from "@/lib/auth/viewer-context";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

type ServicePackageWithItems = ServicePackage & {
  items: {
    service: Service;
    custom_price: number;
    service_id: number;
  }[];
};

interface PackagesPageClientProps {
  packages: ServicePackageWithItems[];
  services: Service[];
  categories: string[];
  businessSlug: string;
}

type OptimisticAction =
  | { type: "delete"; packageId: number }
  | { type: "update"; packageId: number; data: ServicePackageWithItems }
  | { type: "create"; data: ServicePackageWithItems };

export function PackagesPageClient({
  packages,
  services,
  categories,
  businessSlug,
}: PackagesPageClientProps) {
  const staffDialogTheme = useOptionalViewer()?.actorType === "EMPLOYEE" ? staffTheme.workspace : "";
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] =
    useState<ServicePackageWithItems | null>(null);
  const [packageToDelete, setPackageToDelete] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const [optimisticPackages, addOptimisticUpdate] = useOptimistic(
    packages,
    (state: ServicePackageWithItems[], action: OptimisticAction) => {
      switch (action.type) {
        case "delete":
          return state.filter((pkg) => pkg.id !== action.packageId);
        case "update":
          return state.map((pkg) =>
            pkg.id === action.packageId ? action.data : pkg,
          );
        case "create":
          return [...state, action.data];
        default:
          return state;
      }
    },
  );

  const filteredPackages = useMemo(() => {
    return optimisticPackages.filter((pkg) => {
      const matchesSearch = pkg.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "ALL" || pkg.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [optimisticPackages, search, categoryFilter]);

  const handleDeletePackage = async (packageId: number) => {
    startTransition(async () => {
      addOptimisticUpdate({ type: "delete", packageId });
      const result = await deletePackageAction(packageId);
      if (result.success) {
        toast.success("Package deleted successfully");
      } else {
        toast.error(result.error || "Failed to delete package");
        router.refresh();
      }
    });
  };

  const handleEditClick = (pkg: ServicePackageWithItems) => {
    setEditingPackage(pkg);
  };

  const closeEditDialog = () => {
    setEditingPackage(null);
  };

  return (
    <div className="flex flex-col bg-background">

      {/* ── Page Header ────────────────────────────────── */}
      <div className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] sm:text-xl font-bold tracking-tight text-foreground">
                  Packages
                </h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                  {filteredPackages.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                Bundle services together for special pricing
              </p>
            </div>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-9 rounded-xl bg-primary px-3 text-primary-foreground font-semibold shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4"
              >
                <Plus className="h-4 w-4 sm:mr-2" strokeWidth={2.5} />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Package</span>
              </Button>
            </DialogTrigger>
            <DialogContent className={`${staffDialogTheme} max-w-[95%] md:max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden p-0 rounded-3xl`}>
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl font-bold text-foreground">
                  Create New Package
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Bundle multiple services together for a special price.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-0">
                <PackageForm
                  services={services}
                  categories={categories}
                  businessSlug={businessSlug}
                  onSuccess={() => {
                    setIsAddDialogOpen(false);
                    router.refresh();
                  }}
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
              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full sm:w-auto flex-1 max-w-xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    placeholder="Search packages..."
                    className="pl-9 h-9 rounded-xl border-border bg-background shadow-none focus-visible:ring-primary/30"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[175px] h-9 rounded-xl border-border bg-background shadow-none">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Filter className="h-3.5 w-3.5 opacity-60 shrink-0" />
                      <span className="truncate text-sm">
                        {categoryFilter === "ALL" ? "All Categories" : categoryFilter}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent position="popper" className={`${staffDialogTheme} rounded-xl`}>
                    <SelectItem value="ALL" className="cursor-pointer">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="cursor-pointer">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            {filteredPackages.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  No packages found
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  {packages.length === 0
                    ? "Create your first service package to generate more revenue."
                    : "Try adjusting your search or filters."}
                </p>
                {packages.length === 0 && (
                  <Button
                    onClick={() => setIsAddDialogOpen(true)}
                    className="rounded-xl bg-primary hover:bg-primary/90 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Package
                  </Button>
                )}
              </div>
            ) : (
              <PackageList
                packages={filteredPackages}
                onEdit={handleEditClick}
                onDelete={(id) => setPackageToDelete(id)}
                onCategoryClick={(cat) => setCategoryFilter(cat)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingPackage} onOpenChange={closeEditDialog}>
        <DialogContent className={`${staffDialogTheme} max-w-[95%] md:max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden p-0 rounded-3xl`}>
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-bold text-foreground">
              Edit Package
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update package details and included services.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 pt-0">
            {editingPackage && (
              <PackageForm
                services={services}
                categories={categories}
                businessSlug={businessSlug}
                initialData={editingPackage}
                onSuccess={() => {
                  closeEditDialog();
                  router.refresh();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!packageToDelete}
        onOpenChange={(open) => !open && setPackageToDelete(null)}
      >
        <AlertDialogContent className={`${staffDialogTheme} rounded-2xl`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this package. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={() =>
                packageToDelete && handleDeletePackage(packageToDelete)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
