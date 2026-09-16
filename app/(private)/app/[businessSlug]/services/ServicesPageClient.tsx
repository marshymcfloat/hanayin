"use client";

import { useState, useMemo, useOptimistic, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Service } from "@/prisma/generated/prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Package, Filter, RefreshCcw, Box } from "lucide-react";
import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
} from "@/features/catalog/actions/services";
import { toast } from "sonner";
import { ServiceList } from "./ServiceList";
import { ServiceForm, ServiceFormData, ServiceFlowData } from "./ServiceForm";

type ServiceWithFlows = Service & {
  flow_triggers?: Array<{
    suggested_service_id: number;
    delay_duration: number;
    delay_unit: ServiceFlowData["delay_unit"];
    type: ServiceFlowData["type"];
  }>;
};

interface ServicesPageClientProps {
  services: ServiceWithFlows[];
  categories: string[];
  businessSlug: string;
}

const initialFormData: ServiceFormData = {
  name: "",
  description: "",
  price: "",
  estimatedCost: "",
  duration: "",
  category: "",
  flows: [],
};

type OptimisticAction =
  | {
      type: "update";
      serviceId: number;
      data: {
        name: string;
        description?: string;
        price: number;
        estimated_cost: number;
        duration?: number;
        category: string;
      };
    }
  | { type: "delete"; serviceId: number };

export function ServicesPageClient({
  services,
  categories,
  businessSlug,
}: ServicesPageClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 1200);
  }, [isRefreshing, router]);

  const [optimisticServices, addOptimisticUpdate] = useOptimistic(
    services,
    (state: Service[], action: OptimisticAction) => {
      switch (action.type) {
        case "update":
          return state.map((service) =>
            service.id === action.serviceId
              ? {
                  ...service,
                  name: action.data.name,
                  description: action.data.description || null,
                  price: action.data.price,
                  estimated_cost: action.data.estimated_cost,
                  duration: action.data.duration || null,
                  category: action.data.category,
                }
              : service,
          );
        case "delete":
          return state.filter((service) => service.id !== action.serviceId);
        default:
          return state;
      }
    },
  );

  const filteredServices = useMemo(() => {
    return optimisticServices.filter((service) => {
      const matchesSearch =
        service.name.toLowerCase().includes(search.toLowerCase()) ||
        service.description?.toLowerCase().includes(search.toLowerCase()) ||
        service.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === "ALL" || service.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [optimisticServices, search, categoryFilter]);

  const handleAddService = async () => {
    if (!formData.name || !formData.price || !formData.category) {
      toast.error("Please fill in required fields");
      return;
    }

    setIsLoading(true);
    const result = await createServiceAction({
      name: formData.name,
      description: formData.description || undefined,
      price: parseFloat(formData.price),
      estimated_cost: parseFloat(formData.estimatedCost || "0"),
      duration: formData.duration ? parseInt(formData.duration) : undefined,
      category: newCategory || formData.category,
      flows: formData.flows
        .filter((f) => f.suggested_service_id)
        .map((f) => ({
          suggested_service_id: parseInt(f.suggested_service_id),
          delay_duration: parseInt(f.delay_duration),
          delay_unit: f.delay_unit,
          type: f.type,
        })),
    });

    setIsLoading(false);
    if (result.success) {
      toast.success("Service created successfully");
      setIsAddDialogOpen(false);
      setFormData(initialFormData);
      setNewCategory("");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to create service");
    }
  };

  const handleEditService = async () => {
    if (!selectedService || !formData.name || !formData.price) {
      toast.error("Please fill in required fields");
      return;
    }

    const updateData = {
      name: formData.name,
      description: formData.description || undefined,
      price: parseFloat(formData.price),
      estimated_cost: parseFloat(formData.estimatedCost || "0"),
      duration: formData.duration ? parseInt(formData.duration) : undefined,
      category: newCategory || formData.category,
      flows: formData.flows
        .filter((f) => f.suggested_service_id)
        .map((f) => ({
          suggested_service_id: parseInt(f.suggested_service_id),
          delay_duration: parseInt(f.delay_duration),
          delay_unit: f.delay_unit,
          type: f.type,
        })),
    };

    setIsEditDialogOpen(false);

    startTransition(async () => {
      addOptimisticUpdate({
        type: "update",
        serviceId: selectedService.id,
        data: updateData,
      });

      const result = await updateServiceAction(selectedService.id, updateData);

      if (result.success) {
        toast.success("Service updated successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update service");
        router.refresh();
      }

      setSelectedService(null);
      setFormData(initialFormData);
      setNewCategory("");
    });
  };

  const handleDeleteService = useCallback(
    async (serviceId: number) => {
      startTransition(async () => {
        addOptimisticUpdate({ type: "delete", serviceId });

        const result = await deleteServiceAction(serviceId);
        if (result.success) {
          toast.success("Service deleted successfully");
          router.refresh();
        } else {
          toast.error(result.error || "Failed to delete service");
          router.refresh();
        }
      });
    },
    [addOptimisticUpdate, router],
  );

  const openEditDialog = useCallback((service: ServiceWithFlows) => {
    setSelectedService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      price: service.price.toString(),
      estimatedCost: service.estimated_cost.toString(),
      duration: service.duration?.toString() || "",
      category: service.category,
      flows:
        service.flow_triggers?.map((f) => ({
          suggested_service_id: f.suggested_service_id.toString(),
          delay_duration: f.delay_duration.toString(),
          delay_unit: f.delay_unit,
          type: f.type,
        })) || [],
    });
    setIsEditDialogOpen(true);
  }, []);

  return (
    <div className="flex flex-col bg-background" data-business-slug={businessSlug}>

      {/* ── Page Header ────────────────────────────────── */}
      <div className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Box className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] sm:text-xl font-bold tracking-tight text-foreground">
                  Services
                </h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                  {filteredServices.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                Manage your service catalog
              </p>
            </div>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-9 rounded-xl bg-primary px-3 text-primary-foreground font-semibold shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4"
              >
                <Plus className="h-4 w-4 sm:mr-2" strokeWidth={2.5} />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Service</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] rounded-2xl p-0 gap-0 overflow-hidden">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl font-bold text-foreground">
                  Add New Service
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Create a new service offering for your clients.
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 py-2">
                <ServiceForm
                  formData={formData}
                  setFormData={setFormData}
                  categories={categories}
                  newCategory={newCategory}
                  setNewCategory={setNewCategory}
                  services={services}
                />
              </div>
              <DialogFooter className="p-6 pt-2 bg-muted/50">
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddService}
                  disabled={isLoading}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm shadow-primary/20"
                >
                  {isLoading ? "Creating..." : "Create Service"}
                </Button>
              </DialogFooter>
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
                    placeholder="Search services..."
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
                  <SelectContent position="popper" className="rounded-xl">
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
            {filteredServices.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  No services found
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  {services.length === 0
                    ? "Get started by adding your first service offering."
                    : "Try adjusting your search or filters to find what you're looking for."}
                </p>
                {services.length === 0 && (
                  <Button
                    onClick={() => setIsAddDialogOpen(true)}
                    className="rounded-xl bg-primary hover:bg-primary/90 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Service
                  </Button>
                )}
              </div>
            ) : (
              <ServiceList
                services={filteredServices}
                onEdit={openEditDialog}
                onDelete={handleDeleteService}
                onCategoryClick={(cat) => setCategoryFilter(cat)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-bold text-foreground">
              Edit Service
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update the details for this service.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-2">
            <ServiceForm
              formData={formData}
              setFormData={setFormData}
              categories={categories}
              newCategory={newCategory}
              setNewCategory={setNewCategory}
              services={services}
            />
          </div>
          <DialogFooter className="p-6 pt-2 bg-muted/50">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditService}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm shadow-primary/20"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
