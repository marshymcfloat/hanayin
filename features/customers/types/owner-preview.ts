export type OwnerPreviewCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  completedVisits: number;
  lastVisitAt: string | null;
};

export type OwnerPreviewCustomerDirectory = {
  businessName: string;
  customers: OwnerPreviewCustomer[];
  page: number;
  pageSize: number;
  filteredCount: number;
  totals: { customers: number; newCustomers: number; returningCustomers: number; completedVisits: number };
};

export type OwnerPreviewCustomerHistory = {
  customerId: string;
  services: Array<{ id: number; completedAt: string | null; service: string; provider: string | null; amount: number }>;
  hasMore: boolean;
};
