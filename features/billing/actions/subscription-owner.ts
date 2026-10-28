"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { resolveOwnerSubscriptionActor } from "@/features/billing/owner-subscription-access";
import { ownerInvoiceReasonSchema, ownerManualPaymentSchema, ownerPlanUpgradeSchema, type OwnerManualPaymentInput } from "@/features/billing/owner-subscription-schemas";
import { createOwnerSubscriptionInvoice, requestOwnerPlanUpgrade, submitOwnerManualPayment } from "@/features/billing/services/owner-subscription";

async function refresh(paths: string[]) {
  for (const path of paths) { try { revalidatePath(path); } catch { /* Committed billing writes remain successful. */ } }
}

export async function createOwnerSubscriptionInvoiceAction(reason = "OWNER_MANUAL_RENEWAL") {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER" || !auth.session.user.id) return { success: false as const, error: "Forbidden" };
    const input = ownerInvoiceReasonSchema.safeParse(reason);
    if (!input.success) return { success: false as const, error: input.error.issues[0]?.message || "Invalid invoice reason." };
    const actor = await resolveOwnerSubscriptionActor(auth.businessSlug, auth.session.user.id);
    if (!actor) return { success: false as const, error: "Forbidden" };
    const result = await createOwnerSubscriptionInvoice(actor, input.data);
    if (result.success) await refresh([`/app/${auth.businessSlug}/billing`]);
    return result;
  } catch { return { success: false as const, error: "Unable to create subscription invoice." }; }
}

export async function requestOwnerPlanUpgradeAction(rawInput: unknown) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false as const, error: "Only owners can request plan upgrades." };
    if (!auth.session.user.id) return { success: false as const, error: "Unauthorized" };
    const input = ownerPlanUpgradeSchema.safeParse(rawInput);
    if (!input.success) return { success: false as const, error: input.error.issues[0]?.message || "Invalid plan upgrade request." };
    const actor = await resolveOwnerSubscriptionActor(auth.businessSlug, auth.session.user.id);
    if (!actor) return { success: false as const, error: "Forbidden" };
    const result = await requestOwnerPlanUpgrade(actor, input.data);
    if (result.success) await refresh([`/app/${auth.businessSlug}/billing`, "/platform", "/platform/businesses"]);
    return result;
  } catch { return { success: false as const, error: "Unable to request plan upgrade." }; }
}

export async function submitManualPaymentReferenceAction(rawInput: OwnerManualPaymentInput) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER" || !auth.session.user.id) return { success: false as const, error: "Forbidden" };
    const input = ownerManualPaymentSchema.safeParse(rawInput);
    if (!input.success) return { success: false as const, error: input.error.issues[0]?.message || "Invalid manual payment submission." };
    const actor = await resolveOwnerSubscriptionActor(auth.businessSlug, auth.session.user.id);
    if (!actor) return { success: false as const, error: "Forbidden" };
    const result = await submitOwnerManualPayment(actor, input.data);
    if (result.success) await refresh([`/app/${auth.businessSlug}/billing`, "/platform/invoices"]);
    return result;
  } catch { return { success: false as const, error: "Unable to submit manual payment reference." }; }
}
