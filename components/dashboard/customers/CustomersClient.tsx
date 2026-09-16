"use client";

import { useState, useMemo, useOptimistic, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Customer } from "@/prisma/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { LazyBookingQuickPanel } from "@/components/bookings/LazyBookingQuickPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  MoreHorizontal,
  Mail,
  Phone,
  Calendar,
  RefreshCcw,
} from "lucide-react";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
  type CustomerHistoryData,
} from "@/features/customers/actions/customer";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerForm, CustomerFormData } from "./CustomerForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { formatPH } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/utils";

// Humanize the PaymentMethod enum for display. Source: prisma enum
// (CASH, ONLINE) — keep this map in sync with new payment methods.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  ONLINE: "Online (GCash / Maya)",
};
function humanizePaymentMethod(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_METHOD_LABELS[value] ?? value;
}

interface CustomersClientProps {
  customers: Customer[];
  businessSlug: string;
}

const initialFormData: CustomerFormData = {
  name: "",
  email: "",
  phone: "",
};

type OptimisticAction =
  | { type: "add"; customer: Customer }
  | { type: "update"; customer: Customer }
  | { type: "delete"; id: string };

export function CustomersClient({ customers, businessSlug }: CustomersClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  // C3: open BookingQuickPanel from a customer's booking-history row.
  const [openedBookingId, setOpenedBookingId] = useState<number | null>(null);
  const [isBookingPanelOpen, setIsBookingPanelOpen] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticCustomers, addOptimisticUpdate] = useOptimistic(
    customers,
    (state: Customer[], action: OptimisticAction) => {
      switch (action.type) {
        case "add": return [...state, action.customer];
        case "update": return state.map((c) => c.id === action.customer.id ? action.customer : c);
        case "delete": return state.filter((c) => c.id !== action.id);
        default: return state;
      }
    },
  );

  const filteredCustomers = useMemo(() => {
    return optimisticCustomers.filter((customer) => {
      const searchLower = search.toLowerCase();
      return (
        customer.name.toLowerCase().includes(searchLower) ||
        (customer.email && customer.email.toLowerCase().includes(searchLower))
      );
    });
  }, [optimisticCustomers, search]);

  const { data: historyResult, isFetching: isHistoryLoading } = useQuery({
    queryKey: ["customerHistory", historyCustomer?.id],
    queryFn: () => historyCustomer ? getCustomerHistory(historyCustomer.id) : Promise.resolve(null),
    enabled: !!historyCustomer && isHistoryDialogOpen,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleAddCustomer = async () => {
    if (!formData.name) { toast.error("Please enter a customer name"); return; }
    setIsLoading(true);
    const tempId = `temp-${Date.now()}`;
    const newCustomer = {
      id: tempId, name: formData.name, email: formData.email || null,
      phone: formData.phone || null, business_id: "", created_at: new Date(), updated_at: new Date(),
    } as Customer;

    startTransition(async () => {
      addOptimisticUpdate({ type: "add", customer: newCustomer });
      const result = await createCustomer({ businessSlug, name: formData.name, email: formData.email, phone: formData.phone });
      setIsLoading(false);
      if (result.success) {
        toast.success("Customer created successfully");
        setIsAddDialogOpen(false);
        setFormData(initialFormData);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create customer");
        router.refresh();
      }
    });
  };

  const handleEditCustomer = async () => {
    if (!selectedCustomer || !formData.name) { toast.error("Please enter a customer name"); return; }
    const updatedCustomer = { ...selectedCustomer, name: formData.name, email: formData.email || null, phone: formData.phone || null };
    setIsEditDialogOpen(false);
    startTransition(async () => {
      addOptimisticUpdate({ type: "update", customer: updatedCustomer });
      const result = await updateCustomer(selectedCustomer.id, { businessSlug, name: formData.name, email: formData.email, phone: formData.phone });
      if (result.success) {
        toast.success("Customer updated successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update customer");
        router.refresh();
      }
      setSelectedCustomer(null);
      setFormData(initialFormData);
    });
  };

  const handleDeleteCustomer = async (id: string) => {
    startTransition(async () => {
      addOptimisticUpdate({ type: "delete", id });
      const result = await deleteCustomer(id);
      if (result.success) {
        toast.success("Customer deleted successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete customer");
        router.refresh();
      }
    });
  };

  const openEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({ name: customer.name, email: customer.email || "", phone: customer.phone || "" });
    setIsEditDialogOpen(true);
  };

  const openHistoryDialog = (customer: Customer) => {
    setHistoryCustomer(customer);
    setIsHistoryDialogOpen(true);
  };

  const closeHistoryDialog = (open: boolean) => {
    setIsHistoryDialogOpen(open);
    if (!open) setHistoryCustomer(null);
  };

  const historyData: CustomerHistoryData | null = historyResult?.success ? historyResult.data : null;

  const pendingFlows = useMemo(() => {
    if (!historyData) return [];
    return historyData.flowStatus.filter((flow) => flow.status === "PENDING");
  }, [historyData]);

  const nextFlowDue = useMemo(() => {
    if (!pendingFlows.length) return null;
    return pendingFlows.slice().sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  }, [pendingFlows]);

  const getBookingStatusClass = (status: string) => {
    switch (status) {
      case "ACCEPTED": return "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800";
      case "COMPLETED": return "border-primary/30 bg-primary/10 text-primary";
      case "HOLD": return "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800";
      case "CANCELLED": return "border-destructive/30 bg-destructive/10 text-destructive";
      default: return "border-border bg-muted text-muted-foreground";
    }
  };

  const getFlowStatusClass = (status: string) => {
    return status === "COMPLETED"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800";
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getTrustTierBadgeClass = (tier: string) => {
    if (tier === "TRUSTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (tier === "RESTRICTED") return "border-red-200 bg-red-50 text-red-700";
    return "border-zinc-200 bg-zinc-100 text-zinc-500";
  };

  const getAvatarColor = (name: string) => {
    const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500"];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Users className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Customers</h1>
              <p className="text-xs text-muted-foreground">Manage your customer database.</p>
            </div>
            <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {customers.length} {customers.length === 1 ? "customer" : "customers"}
            </span>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer hidden sm:flex">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2">
                  <DialogTitle className="text-xl font-bold text-foreground">Add New Customer</DialogTitle>
                  <DialogDescription className="text-muted-foreground">Create a new customer profile.</DialogDescription>
                </DialogHeader>
                <div className="h-px bg-border mx-6" />
                <div className="px-6 py-4">
                  <CustomerForm formData={formData} setFormData={setFormData} />
                </div>
                <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="rounded-xl cursor-pointer">Cancel</Button>
                  <Button onClick={handleAddCustomer} disabled={isLoading} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                    {isLoading ? "Creating..." : "Create Customer"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          {/* Mobile Add Button */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="sm:hidden w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                <Plus className="h-4 w-4 mr-2" />Add Customer
              </Button>
            </DialogTrigger>
          </Dialog>

          {/* Toolbar */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
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

          {filteredCustomers.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No customers found</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {customers.length === 0 ? "Get started by adding your first customer." : "Try adjusting your search terms."}
              </p>
              {customers.length === 0 && (
                <Button onClick={() => setIsAddDialogOpen(true)} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                  <Plus className="h-4 w-4 mr-2" />Add Your First Customer
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="lg:hidden grid grid-cols-1 gap-3">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="bg-card rounded-2xl p-4 border border-border flex flex-col gap-3 cursor-pointer hover:border-primary/20 transition-all active:scale-[0.99]"
                    onClick={() => openHistoryDialog(customer)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className={`${getAvatarColor(customer.name)} h-10 w-10 text-white shadow-sm`}>
                          <AvatarFallback className="bg-transparent font-medium">
                            {getInitials(customer.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{customer.name}</span>
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 rounded-md ${getTrustTierBadgeClass(customer.trust_tier)}`}>
                              {customer.trust_tier}
                            </Badge>
                          </div>
                          {customer.email && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" />{customer.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl w-52">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openHistoryDialog(customer)} className="cursor-pointer">
                            <Calendar className="h-4 w-4 mr-2" />View History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEditDialog(customer)} className="cursor-pointer">
                            <Pencil className="h-4 w-4 mr-2" />Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                                <Trash2 className="h-4 w-4 mr-2" />Delete Customer
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete &quot;{customer.name}&quot;? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeleteCustomer(customer.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {customer.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground border-t border-border/50 pt-3">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border bg-muted/50">
                      <TableHead className="pl-6 h-11 font-semibold text-muted-foreground w-[300px]">Customer</TableHead>
                      <TableHead className="h-11 font-semibold text-muted-foreground">Phone</TableHead>
                      <TableHead className="h-11 font-semibold text-muted-foreground">Trust</TableHead>
                      <TableHead className="text-right pr-6 h-11 font-semibold text-muted-foreground w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow
                        key={customer.id}
                        className="hover:bg-accent/30 transition-colors border-border/50 cursor-pointer group"
                        onClick={() => openHistoryDialog(customer)}
                      >
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className={`${getAvatarColor(customer.name)} h-9 w-9 text-white shadow-sm`}>
                              <AvatarFallback className="bg-transparent font-medium">
                                {getInitials(customer.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{customer.name}</span>
                              {customer.email && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Mail className="h-3 w-3" />{customer.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {customer.phone ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />{customer.phone}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm italic">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 rounded-md w-fit ${getTrustTierBadgeClass(customer.trust_tier)}`}>
                              {customer.trust_tier}
                            </Badge>
                            {customer.no_show_count > 0 && (
                              <span className="text-[10px] text-amber-600 font-medium">
                                {customer.no_show_count} no-show{customer.no_show_count > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent/30 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl w-52">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openHistoryDialog(customer)} className="cursor-pointer">
                                <Calendar className="h-4 w-4 mr-2" />View History
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEditDialog(customer)} className="cursor-pointer">
                                <Pencil className="h-4 w-4 mr-2" />Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                                    <Trash2 className="h-4 w-4 mr-2" />Delete Customer
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-2xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete &quot;{customer.name}&quot;? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeleteCustomer(customer.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={closeHistoryDialog}>
        <DialogContent className="sm:max-w-[900px] rounded-3xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-bold text-foreground">Customer History</DialogTitle>
              {historyCustomer && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 rounded-md ${getTrustTierBadgeClass(historyCustomer.trust_tier)}`}>
                    {historyCustomer.trust_tier}
                  </Badge>
                  {historyCustomer.no_show_count > 0 && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-amber-200 bg-amber-50 text-amber-700">
                      {historyCustomer.no_show_count} no-show{historyCustomer.no_show_count > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <DialogDescription className="text-muted-foreground">
              {historyCustomer ? `Overview for ${historyCustomer.name}` : "Customer overview"}
            </DialogDescription>
          </DialogHeader>
          <div className="h-px bg-border mx-6 shrink-0" />

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isHistoryLoading && (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading history...</div>
            )}

            {!isHistoryLoading && historyResult?.success === false && (
              <div className="text-sm text-destructive py-4">
                {historyResult.error || "Failed to load history"}
              </div>
            )}

            {!isHistoryLoading && historyData && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Next Appointment</p>
                    {historyData.nextAppointment ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{formatPH(historyData.nextAppointment.scheduledAt, "PPP p")}</p>
                        <p className="text-xs text-muted-foreground">
                          {historyData.nextAppointment.services.length > 0 ? historyData.nextAppointment.services.join(", ") : "No services listed"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No upcoming appointment scheduled.</p>
                    )}
                  </div>

                  <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Next Recommended (Service Flow)</p>
                    {nextFlowDue ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{nextFlowDue.suggestedServiceName}</p>
                        <p className="text-xs text-muted-foreground">Due {formatPH(nextFlowDue.dueDate, "MMM d, yyyy")}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getFlowStatusClass(nextFlowDue.status)}>{nextFlowDue.status}</Badge>
                          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">{nextFlowDue.flowType}</Badge>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No pending service flows.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Service Flow Status</h4>
                    <span className="text-xs text-muted-foreground">{historyData.flowStatus.length} total</span>
                  </div>

                  {historyData.flowStatus.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No service flows configured for this customer.</div>
                  ) : (
                    <div className="space-y-2">
                      {historyData.flowStatus.map((flow) => (
                        <div
                          key={`${flow.triggerServiceId}-${flow.suggestedServiceId}`}
                          className="flex flex-col gap-2 border border-border rounded-xl p-3 bg-card"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{flow.triggerServiceName}</span>
                            <span className="text-xs text-muted-foreground">-&gt;</span>
                            <span className="text-sm font-semibold text-foreground">{flow.suggestedServiceName}</span>
                            <Badge variant="outline" className={getFlowStatusClass(flow.status)}>{flow.status}</Badge>
                            <Badge variant="outline" className="border-border bg-muted text-muted-foreground">{flow.flowType}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last service: {formatPH(flow.lastServiceDate, "MMM d, yyyy")}
                            {" • "}
                            {flow.status === "COMPLETED"
                              ? `Completed ${formatPH(flow.completedAt, "MMM d, yyyy")}`
                              : `Due ${formatPH(flow.dueDate, "MMM d, yyyy")}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Booking History</h4>
                    <span className="text-xs text-muted-foreground">{historyData.bookings.length} total</span>
                  </div>

                  {historyData.bookings.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No bookings found for this customer.</div>
                  ) : (
                    <ScrollArea className="h-[320px] pr-3">
                      <div className="space-y-2">
                        {historyData.bookings.map((booking) => {
                          const serviceNames = booking.availed_services?.map((item) => item.service?.name).filter(Boolean) || [];
                          const displayDate = booking.scheduled_at || booking.created_at;
                          return (
                            <button
                              type="button"
                              key={booking.id}
                              onClick={() => {
                                setOpenedBookingId(booking.id);
                                setIsBookingPanelOpen(true);
                              }}
                              className="w-full text-left border border-border rounded-xl p-3 bg-card hover:bg-zinc-50 hover:border-primary/30 transition-colors cursor-pointer"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-foreground">Booking #{booking.id}</div>
                                <Badge variant="outline" className={getBookingStatusClass(booking.status)}>{booking.status}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{formatPH(displayDate, "PPP p")}</div>
                              <div className="text-xs text-muted-foreground mt-2">
                                {serviceNames.length > 0 ? `Services: ${serviceNames.join(", ")}` : "Services: Not listed"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Payment: {humanizePaymentMethod(booking.payment_method)} • Total: {formatCurrency(booking.grand_total)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-bold text-foreground">Edit Customer</DialogTitle>
            <DialogDescription className="text-muted-foreground">Update customer information.</DialogDescription>
          </DialogHeader>
          <div className="h-px bg-border mx-6" />
          <div className="px-6 py-4">
            <CustomerForm formData={formData} setFormData={setFormData} />
          </div>
          <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl cursor-pointer">Cancel</Button>
            <Button onClick={handleEditCustomer} disabled={isLoading} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* C3: Lazy-loaded role-aware booking panel for the row clicked
          inside the booking-history modal. */}
      <LazyBookingQuickPanel
        bookingId={openedBookingId}
        open={isBookingPanelOpen}
        onOpenChange={(next) => {
          setIsBookingPanelOpen(next);
          if (!next) setOpenedBookingId(null);
        }}
      />
    </div>
  );
}
