import { QueryClient } from "@tanstack/react-query";

export type OwnerPreviewIdentity = {
  userId: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  ownerName: string;
};

export const OWNER_PREVIEW_CACHE_TIME = 15 * 60 * 1000;

export const ownerPreviewStaleTime = {
  todayBookings: 10_000,
  queue: 10_000,
  billing: 30_000,
  saleEvents: 30_000,
  socialPosts: 30_000,
  dashboardAnalytics: 60_000,
  growth: 60_000,
  reports: 60_000,
  catalog: 120_000,
  businessHours: 120_000,
} as const;

type QueryScope = Pick<OwnerPreviewIdentity, "businessId" | "businessSlug" | "userId">;
type QueryFilters = Readonly<Record<string, unknown>>;

export const ownerPreviewKeys = {
  all: ["owner-preview"] as const,
  business: ({ businessId, businessSlug, userId }: QueryScope) =>
    ["owner-preview", businessId, businessSlug, userId] as const,
  page: (identity: QueryScope, page: string) =>
    [...ownerPreviewKeys.business(identity), page] as const,
  section: (
    identity: QueryScope,
    page: string,
    section: string,
    filters: QueryFilters = {},
  ) => [...ownerPreviewKeys.page(identity, page), section, filters] as const,
};

export function createOwnerPreviewQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: OWNER_PREVIEW_CACHE_TIME,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}
