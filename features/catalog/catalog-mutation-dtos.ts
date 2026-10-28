import type {
  OwnerCatalogPreviewPackage,
  OwnerCatalogPreviewService,
  OwnerCatalogPreviewVoucher,
  OwnerCatalogPreviewVoucherStatus,
} from "@/features/catalog/types/owner-catalog-preview";
import { readPackageChoices } from "@/features/catalog/offer-definitions";

export type CatalogDeleteData = { id: number };
export type ServiceMutationData = OwnerCatalogPreviewService;
export type PackageMutationData = OwnerCatalogPreviewPackage;
export type VoucherMutationData = OwnerCatalogPreviewVoucher;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function startOfMonthPh(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return new Date(`${year}-${month}-01T00:00:00.000+08:00`);
}

export function toServiceMutationData(row: {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  estimated_cost: number;
  duration: number | null;
  availed_services: Array<{ id: number }>;
}): ServiceMutationData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    estimatedCost: row.estimated_cost,
    durationMinutes: row.duration,
    monthlyBookings: row.availed_services.length,
  };
}

export function toPackageMutationData(row: {
  choices?: unknown;
  revision?: number;
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  duration: number | null;
  items: Array<{
    custom_price: number;
    service: {
      id: number;
      name: string;
      category: string;
      duration: number | null;
      price: number;
    };
  }>;
  availed_services: Array<{ booking_id: number }>;
}): PackageMutationData {
  return {
    choices: readPackageChoices(row.choices), revision: row.revision ?? 0,
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    durationMinutes: row.duration,
    originalPrice: roundCurrency(
      row.items.reduce((sum, item) => sum + item.service.price, 0),
    ),
    monthlySales: new Set(row.availed_services.map((item) => item.booking_id)).size,
    services: row.items.map((item) => ({
      id: item.service.id,
      name: item.service.name,
      category: item.service.category,
      durationMinutes: item.service.duration,
      price: item.service.price,
      packageItemPrice: item.custom_price,
    })),
  };
}

export function toVoucherMutationData(
  row: {
    id: number;
    code: string;
    type: "PERCENTAGE" | "FLAT";
    value: number;
    minimum_amount: number;
    expires_at: Date;
    is_active: boolean;
    used_by_id: number | null;
  },
  now: Date,
): VoucherMutationData {
  let status: OwnerCatalogPreviewVoucherStatus = "active";
  if (!row.is_active) status = "archived";
  else if (row.used_by_id !== null) status = "used";
  else if (row.expires_at.getTime() < now.getTime()) status = "expired";

  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    minimumAmount: row.minimum_amount,
    expiresAt: row.expires_at.toISOString(),
    status,
    redemptions: row.used_by_id === null ? 0 : 1,
  };
}
