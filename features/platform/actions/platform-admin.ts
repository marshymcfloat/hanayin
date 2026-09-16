"use server";

import {
  createSubscriptionInvoice,
  markInvoicePaidManually,
} from "@/features/platform/services/invoice-admin";
import {
  assignReferralOnOnboarding,
  rejectReferralAttribution,
  runReferralRewardQualification,
  updateReferralLeadStatus,
} from "@/features/platform/services/referral-admin";
import {
  convertOnboardingApplicationToBusiness,
  resendMagicLink,
  updateOnboardingApplicationStatus,
} from "@/features/platform/services/onboarding-admin";
import { impersonateBusinessOwner } from "@/features/platform/services/impersonation-admin";
import {
  clearDemoData,
  createBusinessWithSubscription,
  reactivateBusiness,
  suspendBusiness,
} from "@/features/platform/services/business-admin";
import {
  applyCreditAdjustment,
  changeBusinessSubscriptionPlan,
  convertTrialToPaid,
  getSubscriptionEnforcementMode,
  grantTrialMonths,
  reviewSubscriptionPlanUpgradeRequest,
  updateSubscriptionPlan,
} from "@/features/platform/services/subscription-admin";
import {
  retryOutboxMessage,
  skipOutboxMessage,
} from "@/features/platform/services/outbox-admin";

export async function createBusinessWithSubscriptionAction(
  ...args: Parameters<typeof createBusinessWithSubscription>
) {
  return createBusinessWithSubscription(...args);
}

export async function grantTrialMonthsAction(
  ...args: Parameters<typeof grantTrialMonths>
) {
  return grantTrialMonths(...args);
}

export async function assignReferralOnOnboardingAction(
  ...args: Parameters<typeof assignReferralOnOnboarding>
) {
  return assignReferralOnOnboarding(...args);
}

export async function createSubscriptionInvoiceAction(
  ...args: Parameters<typeof createSubscriptionInvoice>
) {
  return createSubscriptionInvoice(...args);
}

export async function applyCreditAdjustmentAction(
  ...args: Parameters<typeof applyCreditAdjustment>
) {
  return applyCreditAdjustment(...args);
}

export async function suspendBusinessAction(
  ...args: Parameters<typeof suspendBusiness>
) {
  return suspendBusiness(...args);
}

export async function reactivateBusinessAction(
  ...args: Parameters<typeof reactivateBusiness>
) {
  return reactivateBusiness(...args);
}

export async function changeBusinessSubscriptionPlanAction(
  ...args: Parameters<typeof changeBusinessSubscriptionPlan>
) {
  return changeBusinessSubscriptionPlan(...args);
}

export async function reviewSubscriptionPlanUpgradeRequestAction(
  ...args: Parameters<typeof reviewSubscriptionPlanUpgradeRequest>
) {
  return reviewSubscriptionPlanUpgradeRequest(...args);
}

export async function runReferralRewardQualificationAction(
  ...args: Parameters<typeof runReferralRewardQualification>
) {
  return runReferralRewardQualification(...args);
}

export async function getSubscriptionEnforcementModeAction(
  ...args: Parameters<typeof getSubscriptionEnforcementMode>
) {
  return getSubscriptionEnforcementMode(...args);
}

export async function updateSubscriptionPlanAction(
  ...args: Parameters<typeof updateSubscriptionPlan>
) {
  return updateSubscriptionPlan(...args);
}

export async function updateReferralLeadStatusAction(
  ...args: Parameters<typeof updateReferralLeadStatus>
) {
  return updateReferralLeadStatus(...args);
}

export async function rejectReferralAttributionAction(
  ...args: Parameters<typeof rejectReferralAttribution>
) {
  return rejectReferralAttribution(...args);
}

export async function updateOnboardingApplicationStatusAction(
  ...args: Parameters<typeof updateOnboardingApplicationStatus>
) {
  return updateOnboardingApplicationStatus(...args);
}

export async function convertOnboardingApplicationToBusinessAction(
  ...args: Parameters<typeof convertOnboardingApplicationToBusiness>
) {
  return convertOnboardingApplicationToBusiness(...args);
}

export async function resendMagicLinkAction(
  ...args: Parameters<typeof resendMagicLink>
) {
  return resendMagicLink(...args);
}

export async function impersonateBusinessOwnerAction(
  ...args: Parameters<typeof impersonateBusinessOwner>
) {
  return impersonateBusinessOwner(...args);
}

export async function convertTrialToPaidAction(
  ...args: Parameters<typeof convertTrialToPaid>
) {
  return convertTrialToPaid(...args);
}

export async function clearDemoDataAction(
  ...args: Parameters<typeof clearDemoData>
) {
  return clearDemoData(...args);
}

export async function markInvoicePaidManuallyAction(
  ...args: Parameters<typeof markInvoicePaidManually>
) {
  return markInvoicePaidManually(...args);
}

export async function retryOutboxMessageAction(
  ...args: Parameters<typeof retryOutboxMessage>
) {
  return retryOutboxMessage(...args);
}

export async function skipOutboxMessageAction(
  ...args: Parameters<typeof skipOutboxMessage>
) {
  return skipOutboxMessage(...args);
}
