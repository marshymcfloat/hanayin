import type { PackageChoice } from "@/features/catalog/offer-definitions";
export type OwnerCatalogPreviewSection =
  | "services"
  | "packages"
  | "vouchers"
  | "gift-cards";

export type OwnerCatalogCommittedChange<T extends { id: number }> =
  | { type: "upsert"; item: T }
  | { type: "delete"; id: number };

export type OwnerCatalogPreviewBusiness = {
  slug: string;
  name: string;
  initials: string;
};

export type OwnerCatalogPreviewService = {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  estimatedCost: number;
  durationMinutes: number | null;
  monthlyBookings: number;
};

export type OwnerServicesPreviewReadModel = {
  section: "services";
  generatedAt: string;
  business: OwnerCatalogPreviewBusiness;
  services: OwnerCatalogPreviewService[];
  categories: string[];
  metrics: {
    totalServices: number;
    monthlyBookings: number;
    averageMarginPercent: number;
    averageDurationMinutes: number;
  };
};

export type OwnerCatalogPreviewPackage = {
  revision?: number;
  choices?: PackageChoice[];
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  durationMinutes: number | null;
  originalPrice: number;
  monthlySales: number;
  services: Array<{
    id: number;
    name: string;
    category: string;
    durationMinutes: number | null;
    price: number;
    packageItemPrice: number;
  }>;
};

export type OwnerPackagesPreviewReadModel = {
  section: "packages";
  generatedAt: string;
  business: OwnerCatalogPreviewBusiness;
  packages: OwnerCatalogPreviewPackage[];
  availableServices: OwnerCatalogPreviewService[];
  categories: string[];
  metrics: {
    totalPackages: number;
    monthlySales: number;
    monthlyRevenue: number;
    averageSavingsPercent: number;
  };
};

export type OwnerCatalogPreviewVoucherStatus =
  | "active"
  | "used"
  | "expired"
  | "archived";

export type OwnerCatalogPreviewVoucher = {
  id: number;
  code: string;
  type: "PERCENTAGE" | "FLAT";
  value: number;
  minimumAmount: number;
  expiresAt: string;
  status: OwnerCatalogPreviewVoucherStatus;
  redemptions: number;
};

export type OwnerVouchersPreviewReadModel = {
  section: "vouchers";
  generatedAt: string;
  business: OwnerCatalogPreviewBusiness;
  vouchers: OwnerCatalogPreviewVoucher[];
  metrics: {
    activeVouchers: number;
    redemptions: number;
    archivedVouchers: number;
  };
};

export type OwnerCatalogPreviewGiftCardStatus =
  | "active"
  | "claimed"
  | "expired";

export type OwnerCatalogPreviewGiftCard = {
  id: number;
  code: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  expiresAt: string;
  claimedAt: string | null;
  status: OwnerCatalogPreviewGiftCardStatus;
  includedServices: Array<{ id: number; name: string }>;
  includedPackages: Array<{ id: number; name: string }>;
};

export type OwnerGiftCardsPreviewReadModel = {
  section: "gift-cards";
  generatedAt: string;
  business: OwnerCatalogPreviewBusiness;
  giftCards: OwnerCatalogPreviewGiftCard[];
  availableServices: Array<{ id: number; name: string; category: string }>;
  availablePackages: Array<{ id: number; name: string; category: string }>;
  metrics: {
    totalGiftCards: number;
    activeGiftCards: number;
    claimedGiftCards: number;
    expiredGiftCards: number;
  };
};

export type OwnerCatalogPreviewReadModel =
  | OwnerServicesPreviewReadModel
  | OwnerPackagesPreviewReadModel
  | OwnerVouchersPreviewReadModel
  | OwnerGiftCardsPreviewReadModel;
