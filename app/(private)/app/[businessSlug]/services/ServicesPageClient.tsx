"use client";

import { useState, useMemo, useOptimistic, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Service } from "@/prisma/generated/prisma/client";
import { PageHeader } from "@/components/dashboard/PageHeader";
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
import { Search, Plus, Package, Filter, RefreshCcw } from "lucide-react";
import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
} from "@/lib/server actions/services";
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
  const [, startTransition] = useTransition();

  // Optimistic state for instant UI updates
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

    // Close dialog immediately for better UX
    setIsEditDialogOpen(false);

    // Apply optimistic update and call server action
    startTransition(async () => {
      // Apply optimistic update
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
        // Refresh to revert to server state on error
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
        addOptimisticUpdate({
          type: "delete",
          serviceId,
        });

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
    <div
      className="flex flex-col p-4 md:p-8 bg-zinc-50/50 min-h-screen"
      data-business-slug={businessSlug}
    >
      <section className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
        <PageHeader
          title="Services"
          description="Manage your service catalog"
          className="mb-8"
        >
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 rounded-full px-6">
                <Plus className="h-4 w-4 mr-2" strokeWidth={2.5} />
                <span className="font-semibold">Add Service</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 gap-0 overflow-hidden">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl font-bold text-zinc-900">
                  Add New Service
                </DialogTitle>
                <DialogDescription className="text-zinc-500">
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
              <DialogFooter className="p-6 pt-2 bg-zinc-50/50">
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  className="rounded-xl border-zinc-200"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddService}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20"
                >
                  {isLoading ? "Creating..." : "Create Service"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PageHeader>

        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search services..."
                className="pl-10 h-10 rounded-xl border-zinc-200 bg-white shadow-sm focus-visible:ring-emerald-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-10 rounded-xl border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 text-zinc-600">
                  <Filter className="h-4 w-4 opacity-50" />
                  <span className="truncate">
                    {categoryFilter === "ALL"
                      ? "All Categories"
                      : categoryFilter}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="ALL">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-2 rounded-xl border-zinc-200 bg-white text-zinc-600 hidden md:flex"
            onClick={() => router.refresh()}
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1">
          {filteredServices.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200/60 shadow-sm p-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
                <Package className="h-6 w-6 text-zinc-300" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-1">
                No services found
              </h3>
              <p className="text-zinc-500 max-w-sm mb-6">
                {services.length === 0
                  ? "Get started by adding your first service offering."
                  : "Try adjusting your search or filters to find what you're looking for."}
              </p>
              {services.length === 0 && (
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700"
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
            />
          )}
        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-xl font-bold text-zinc-900">
                Edit Service
              </DialogTitle>
              <DialogDescription className="text-zinc-500">
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
            <DialogFooter className="p-6 pt-2 bg-zinc-50/50">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="rounded-xl border-zinc-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditService}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20"
              >
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}
