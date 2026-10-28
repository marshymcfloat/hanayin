"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getTenantCustomerPendingFlows } from "@/features/catalog/queries/pending-flows";
import type { PendingFlow } from "@/features/catalog/pending-flow-types";

const customerIdSchema = z.string().trim().min(1).max(200);

export async function getCustomerPendingFlows(customerId: string): Promise<PendingFlow[]> {
  const parsed = customerIdSchema.safeParse(customerId);
  if (!parsed.success) return [];
  try {
    const auth = await requireAuth();
    if (!auth.success) return [];
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success) return [];
    return await getTenantCustomerPendingFlows(parsed.data, actor.businessId);
  } catch {
    return [];
  }
}
