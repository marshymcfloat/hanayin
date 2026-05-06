"use client";

import { useState, useMemo, memo, useCallback } from "react";
import { ServiceItem } from "./ServiceItem";
import { Service, ServicePackage } from "@/prisma/generated/prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createPackageAction,
  updatePackageAction,
} from "@/lib/server actions/packages";
import { Search } from "lucide-react";

type ServicePackageWithItems = ServicePackage & {
  items: {
    service: Service;
    custom_price: number;
    service_id: number;
  }[];
};

interface PackageFormProps {
  services: Service[];
  categories: string[];
  businessSlug: string;
  initialData?: ServicePackageWithItems;
  onSuccess: () => void;
}

const CategorySelector = memo(
  ({
    value,
    categories,
    onChange,
  }: {
    value: string;
    categories: string[];
    onChange: (value: string) => void;
  }) => {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
          <SelectItem value="new">+ Create New Category</SelectItem>
        </SelectContent>
      </Select>
    );
  },
);
CategorySelector.displayName = "CategorySelector";

export function PackageForm({
  services,
  categories,
  businessSlug,
  initialData,
  onSuccess,
}: PackageFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    category: initialData?.category || "",
  });

  const [selectedItems, setSelectedItems] = useState<Map<number, number>>(
    () => {
      if (initialData?.items) {
        const map = new Map();
        initialData.items.forEach((item) => {
          map.set(item.service_id, item.custom_price);
        });
        return map;
      }
      return new Map();
    },
  );

  const [serviceSearch, setServiceSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const filteredServices = useMemo(() => {
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        s.category.toLowerCase().includes(serviceSearch.toLowerCase()),
    );
  }, [services, serviceSearch]);

  const totalValue = useMemo(() => {
    let sum = 0;
    selectedItems.forEach((price) => {
      sum += price;
    });
    return sum;
  }, [selectedItems]);

  const originalTotalValue = useMemo(() => {
    let sum = 0;
    selectedItems.forEach((_, serviceId) => {
      const service = services.find((s) => s.id === serviceId);
      if (service) {
        sum += service.price;
      }
    });
    return sum;
  }, [selectedItems, services]);

  const totalDuration = useMemo(() => {
    let duration = 0;
    selectedItems.forEach((_, serviceId) => {
      const service = services.find((s) => s.id === serviceId);
      if (service) {
        duration += service.duration || 0;
      }
    });
    return duration;
  }, [selectedItems, services]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.category) {
      toast.error("Please fill in required fields");
      return;
    }

    if (selectedItems.size === 0) {
      toast.error("Please select at least one service");
      return;
    }

    setIsLoading(true);

    const category = newCategory || formData.category;
    const items = Array.from(selectedItems.entries()).map(
      ([serviceId, price]) => ({
        serviceId,
        customPrice: price,
      }),
    );

    try {
      let result;

      if (initialData) {
        result = await updatePackageAction(initialData.id, {
          name: formData.name,
          description: formData.description || undefined,
          price: totalValue,
          duration: totalDuration,
          category,
          items,
        });
      } else {
        result = await createPackageAction({
          name: formData.name,
          description: formData.description || undefined,
          price: totalValue,
          duration: totalDuration,
          category,
          businessSlug,
          items,
        });
      }

      if (result.success) {
        toast.success(
          `Package ${initialData ? "updated" : "created"} successfully`,
        );
        onSuccess();
      } else {
        toast.error(result.error || "Failed to save package");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleService = useCallback((service: Service) => {
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(service.id)) {
        newMap.delete(service.id);
      } else {
        newMap.set(service.id, service.price);
      }
      return newMap;
    });
  }, []);

  const updateItemPrice = useCallback((serviceId: number, price: number) => {
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(serviceId)) {
        newMap.set(serviceId, price);
      }
      return newMap;
    });
  }, []);

  const handleCategoryChange = useMemo(
    () => (value: string) => {
      if (value === "new") {
        setFormData((prev) => ({ ...prev, category: "new" }));
      } else {
        setFormData((prev) => ({ ...prev, category: value }));
        setNewCategory("");
      }
    },
    [],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-[600px] md:h-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-y-auto px-1">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Package Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Summer Spa Special"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what's included..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">
              Category <span className="text-destructive">*</span>
            </Label>
            <CategorySelector
              value={formData.category}
              categories={categories}
              onChange={handleCategoryChange}
            />
            {(formData.category === "new" || categories.length === 0) && (
              <Input
                placeholder="Enter new category name"
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value);
                  setFormData({ ...formData, category: "new" });
                }}
                className="mt-2"
              />
            )}
          </div>

          <div className="p-4 bg-zinc-50 rounded-lg border space-y-3">
            <Label>Package Summary</Label>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  Included Services:
                </span>
                <span className="font-medium">{selectedItems.size}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Original Value:</span>
                <span className="font-medium">
                  {formatCurrency(originalTotalValue)}
                </span>
              </div>
              <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
                <span>Total Package Price:</span>
                <span className="text-primary">
                  {formatCurrency(totalValue)}
                </span>
              </div>
              {originalTotalValue > totalValue && (
                <div className="flex justify-end pt-1">
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-green-50 text-green-700"
                  >
                    Save {formatCurrency(originalTotalValue - totalValue)}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col h-[400px] md:h-full border rounded-lg overflow-hidden bg-zinc-50/50">
          <div className="p-3 border-b bg-white space-y-2">
            <div className="flex justify-between items-center">
              <Label>Select Services Included</Label>
              <span className="text-xs text-muted-foreground font-medium">
                Customize prices below
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search services..."
                className="h-8 pl-8 text-xs bg-zinc-50"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 bg-white max-h-[50vh] overflow-y-auto custom-scrollbar">
            <div className="divide-y">
              {filteredServices.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No services found
                </div>
              ) : (
                filteredServices.map((service) => (
                  <ServiceItem
                    key={service.id}
                    service={service}
                    isSelected={selectedItems.has(service.id)}
                    customPrice={selectedItems.get(service.id)}
                    onToggle={toggleService}
                    onPriceUpdate={updateItemPrice}
                  />
                ))
              )}
            </div>
          </div>

          <div className="p-3 border-t bg-white flex justify-between items-center text-xs text-muted-foreground">
            <span>Total Duration:</span>
            <span className="font-medium text-foreground">
              {totalDuration} mins
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 mt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => onSuccess()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/15"
        >
          {isLoading
            ? "Saving..."
            : initialData
              ? "Update Package"
              : "Create Package"}
        </Button>
      </div>
    </form>
  );
}
