import type { TenantActorContext } from "@/lib/auth/staff-access";

export type ServiceCatalogActor = Extract<TenantActorContext, { success: true }>;
export type ServiceAdministrationFailure = { success: false; error: string };
