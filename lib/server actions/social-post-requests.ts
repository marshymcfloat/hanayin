"use server";

/**
 * Social-post-request server actions (Wave E).
 *
 * Six actions implementing the request → review → approve → publish
 * workflow defined in docs/social-post-request-design.md:
 *
 *   submitSocialPostRequestAction      — staff submits a request
 *   updateSocialPostRequestAction      — requester edits while PENDING
 *   cancelSocialPostRequestAction      — requester cancels while PENDING
 *   approveSocialPostRequestAction     — reviewer approves; creates SocialPost
 *   rejectSocialPostRequestAction      — reviewer rejects with reason
 *   listSocialPostRequestsAction       — list requests, scope by perms
 *
 * Permission gates per docs/role-permissions-matrix.md:
 *   - Submit / edit-own / cancel-own:  SOCIAL_POST_REQUEST_CREATE
 *   - Approve / reject / list-all:     SOCIAL_POST_REVIEW
 *   - List own only:                   any tenant access
 *
 * Owners short-circuit through hasStaffPermission's actorType check.
 *
 * The actions never call Gemini/OpenAI directly. The AI work happens
 * downstream in createOrganicSocialPostAction (which approve calls
 * with sourceRequestId so the SocialPost links back).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import {
  hasStaffPermission,
  resolveTenantActorContext,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import { logAudit } from "@/lib/services/audit";
import { publishEvent } from "@/lib/services/outbox";
import { rateLimit } from "@/lib/rate-limit";
import { isSocialPostRequestsEnabledForBusiness } from "@/lib/features/social-post-requests";
import { startSocialPostRequestTimer } from "@/lib/telemetry/social-events";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

// ─── Validation constants ────────────────────────────────────────

const TOPIC_MAX = 140;
const BRIEF_MAX = 600;
const REJECTION_REASON_MAX = 500;
const ATTACHMENT_URL_MAX = 2048;

const VALID_CATEGORIES = new Set([
  "SERVICE_SHOWCASE",
  "BEHIND_THE_SCENES",
  "TIPS_EDUCATION",
  "SEASONAL_GREETING",
  "TEAM_SPOTLIGHT",
  "GENERAL",
]);

const VALID_TONES = new Set([
  "AUTO",
  "FRIENDLY_TAGLISH",
  "PREMIUM_LUXURY",
  "WITTY_PLAYFUL",
  "WARM_NURTURING",
  "DIRECT_URGENT",
]);

const PER_USER_RATE = { windowMs: 60_000, maxRequests: 1 };
const PER_BUSINESS_DAILY_RATE = { windowMs: 24 * 60 * 60_000, maxRequests: 50 };
const DUPLICATE_WINDOW_DAYS = 14;

type ActorContextSuccess = Extract<TenantActorContext, { success: true }>;

// ─── Shared helpers ──────────────────────────────────────────────

async function ensureFlagAndAuth(
  businessSlug: string,
  options: { write: boolean },
): Promise<
  | { success: true; auth: Awaited<ReturnType<typeof requireAuth>> & { success: true }; actor: ActorContextSuccess }
  | { success: false; error: string; code?: string }
> {
  if (!isSocialPostRequestsEnabledForBusiness(businessSlug)) {
    return {
      success: false,
      error: "Social post requests are not enabled for this business.",
      code: "FEATURE_DISABLED",
    };
  }

  const auth = await requireAuth({ write: options.write });
  if (!auth.success) {
    return {
      success: false,
      error: auth.error,
      code: auth.error === "Unauthorized" ? "Unauthorized" : "Forbidden",
    };
  }

  if (auth.businessSlug !== businessSlug) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  const actor = await resolveTenantActorContext(
    businessSlug,
    auth.session.user.id,
  );
  if (!actor.success) {
    return { success: false, error: actor.error, code: "Forbidden" };
  }

  return { success: true, auth, actor };
}

// ─── 1. submit ──────────────────────────────────────────────────

const submitSchema = z.object({
  businessSlug: z.string().min(1),
  topic: z.string().trim().min(1).max(TOPIC_MAX),
  brief: z.string().trim().max(BRIEF_MAX).optional(),
  category: z.string().refine((v) => VALID_CATEGORIES.has(v), {
    message: "Invalid category",
  }),
  desiredTone: z
    .string()
    .refine((v) => VALID_TONES.has(v), { message: "Invalid tone" })
    .optional(),
  attachmentUrl: z.string().max(ATTACHMENT_URL_MAX).url().optional(),
  dueDate: z.coerce.date().optional(),
});

export type SubmitSocialPostRequestResult =
  | {
      success: true;
      requestId: string;
      duplicateWarning?: {
        existingRequestId: string;
        existingTopic: string;
      };
    }
  | {
      success: false;
      error: string;
      code?:
        | "FEATURE_DISABLED"
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput"
        | "RATE_LIMITED_USER"
        | "RATE_LIMITED_BUSINESS";
    };

export async function submitSocialPostRequestAction(
  input: z.input<typeof submitSchema>,
): Promise<SubmitSocialPostRequestResult> {
  const validation = submitSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const guard = await ensureFlagAndAuth(validation.data.businessSlug, {
    write: true,
  });
  if (!guard.success) {
    return {
      success: false,
      error: guard.error,
      code: guard.code as SubmitSocialPostRequestResult extends {
        code?: infer C;
      }
        ? C
        : never,
    };
  }
  const { auth, actor } = guard;

  if (!hasStaffPermission(actor, StaffPermission.SOCIAL_POST_REQUEST_CREATE)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  const finishTelemetry = startSocialPostRequestTimer({
    action: "SUBMITTED",
    businessId: actor.businessId,
    actorRole: actor.actorType,
  });

  // Rate limiting: 1 submission per user per minute, 50 per business per day.
  const userLimit = await rateLimit(
    `social-post-request:user:${actor.userId}`,
    { ...PER_USER_RATE, namespace: "service-flow:rate-limit" },
  );
  if (!userLimit.success) {
    finishTelemetry({ success: false, errorCode: "RATE_LIMITED_USER" });
    return {
      success: false,
      error: "Please wait a moment before submitting another request.",
      code: "RATE_LIMITED_USER",
    };
  }

  const businessLimit = await rateLimit(
    `social-post-request:business:${actor.businessId}`,
    { ...PER_BUSINESS_DAILY_RATE, namespace: "service-flow:rate-limit" },
  );
  if (!businessLimit.success) {
    finishTelemetry({ success: false, errorCode: "RATE_LIMITED_BUSINESS" });
    return {
      success: false,
      error:
        "This business has reached its daily limit of 50 post requests. Try again tomorrow.",
      code: "RATE_LIMITED_BUSINESS",
    };
  }

  // Duplicate detection: same topic + category in last 14 days.
  const since = new Date();
  since.setDate(since.getDate() - DUPLICATE_WINDOW_DAYS);
  const existing = await prisma.socialPostRequest.findFirst({
    where: {
      business_id: actor.businessId,
      category: validation.data.category,
      topic: { equals: validation.data.topic, mode: "insensitive" },
      status: { in: ["PENDING", "APPROVED"] },
      created_at: { gte: since },
    },
    select: { id: true, topic: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.socialPostRequest.create({
      data: {
        business_id: actor.businessId,
        requested_by_user_id: actor.userId,
        topic: validation.data.topic,
        brief: validation.data.brief ?? null,
        category: validation.data.category,
        desired_tone: validation.data.desiredTone ?? null,
        attachment_url: validation.data.attachmentUrl ?? null,
        due_date: validation.data.dueDate ?? null,
      },
      select: {
        id: true,
        requested_by_user: { select: { name: true } },
      },
    });

    await logAudit(tx, {
      entityType: "SocialPostRequest",
      entityId: row.id,
      action: "CREATED",
      actorId: actor.userId,
      actorType: "USER",
      businessId: actor.businessId,
      changes: {
        before: {},
        after: {
          topic: validation.data.topic,
          category: validation.data.category,
          status: "PENDING",
        },
      },
    });

    await publishEvent(tx, {
      type: "SOCIAL_POST_REQUEST_SUBMITTED",
      aggregateType: "SocialPostRequest",
      aggregateId: row.id,
      businessId: actor.businessId,
      payload: {
        requestId: row.id,
        businessId: actor.businessId,
        requestedByUserId: actor.userId,
        requestedByName: row.requested_by_user.name,
        topic: validation.data.topic,
        category: validation.data.category,
      },
    });

    return row;
  });

  revalidatePath(`/app/${auth.businessSlug}/social-posts`);
  revalidatePath(`/app/${auth.businessSlug}/social-posts/my-requests`);
  finishTelemetry({ success: true });

  return {
    success: true,
    requestId: created.id,
    duplicateWarning: existing
      ? {
          existingRequestId: existing.id,
          existingTopic: existing.topic,
        }
      : undefined,
  };
}

// ─── 2. update (requester edits while PENDING) ──────────────────

const updateSchema = z.object({
  businessSlug: z.string().min(1),
  requestId: z.string().min(1),
  topic: z.string().trim().min(1).max(TOPIC_MAX).optional(),
  brief: z.string().trim().max(BRIEF_MAX).optional().nullable(),
  category: z
    .string()
    .refine((v) => VALID_CATEGORIES.has(v), { message: "Invalid category" })
    .optional(),
  desiredTone: z
    .string()
    .refine((v) => VALID_TONES.has(v), { message: "Invalid tone" })
    .optional()
    .nullable(),
  attachmentUrl: z
    .string()
    .max(ATTACHMENT_URL_MAX)
    .url()
    .optional()
    .nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export type UpdateSocialPostRequestResult =
  | { success: true; requestId: string }
  | {
      success: false;
      error: string;
      code?:
        | "FEATURE_DISABLED"
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput"
        | "NOT_FOUND"
        | "NOT_PENDING";
    };

export async function updateSocialPostRequestAction(
  input: z.input<typeof updateSchema>,
): Promise<UpdateSocialPostRequestResult> {
  const validation = updateSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const guard = await ensureFlagAndAuth(validation.data.businessSlug, {
    write: true,
  });
  if (!guard.success) {
    return {
      success: false,
      error: guard.error,
      code: guard.code as UpdateSocialPostRequestResult extends {
        code?: infer C;
      }
        ? C
        : never,
    };
  }
  const { auth, actor } = guard;

  const row = await prisma.socialPostRequest.findFirst({
    where: { id: validation.data.requestId, business_id: actor.businessId },
    select: {
      id: true,
      status: true,
      requested_by_user_id: true,
      topic: true,
      brief: true,
      category: true,
      desired_tone: true,
      attachment_url: true,
      due_date: true,
    },
  });
  if (!row) {
    return { success: false, error: "Request not found.", code: "NOT_FOUND" };
  }

  // Only the requester (or owner) can edit, and only while PENDING.
  const isOwner = actor.actorType === "OWNER";
  const isRequester = row.requested_by_user_id === actor.userId;
  if (!isOwner && !isRequester) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }
  if (row.status !== "PENDING") {
    return {
      success: false,
      error: "This request is no longer editable — it has already been reviewed.",
      code: "NOT_PENDING",
    };
  }

  const data: Record<string, unknown> = {};
  if (validation.data.topic !== undefined) data.topic = validation.data.topic;
  if (validation.data.brief !== undefined) data.brief = validation.data.brief;
  if (validation.data.category !== undefined)
    data.category = validation.data.category;
  if (validation.data.desiredTone !== undefined)
    data.desired_tone = validation.data.desiredTone;
  if (validation.data.attachmentUrl !== undefined)
    data.attachment_url = validation.data.attachmentUrl;
  if (validation.data.dueDate !== undefined)
    data.due_date = validation.data.dueDate;

  if (Object.keys(data).length === 0) {
    return { success: true, requestId: row.id };
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPostRequest.update({
      where: { id: row.id },
      data,
    });
    await logAudit(tx, {
      entityType: "SocialPostRequest",
      entityId: row.id,
      action: "UPDATED",
      actorId: actor.userId,
      actorType: "USER",
      businessId: actor.businessId,
      changes: {
        before: {
          topic: row.topic,
          brief: row.brief,
          category: row.category,
          desired_tone: row.desired_tone,
          attachment_url: row.attachment_url,
          due_date: row.due_date?.toISOString() ?? null,
        },
        after: data,
      },
    });
  });

  revalidatePath(`/app/${auth.businessSlug}/social-posts`);
  revalidatePath(`/app/${auth.businessSlug}/social-posts/my-requests`);
  return { success: true, requestId: row.id };
}

// ─── 3. cancel (requester) ──────────────────────────────────────

const cancelSchema = z.object({
  businessSlug: z.string().min(1),
  requestId: z.string().min(1),
});

export type CancelSocialPostRequestResult =
  | { success: true; requestId: string }
  | {
      success: false;
      error: string;
      code?:
        | "FEATURE_DISABLED"
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput"
        | "NOT_FOUND"
        | "NOT_PENDING";
    };

export async function cancelSocialPostRequestAction(
  input: z.input<typeof cancelSchema>,
): Promise<CancelSocialPostRequestResult> {
  const validation = cancelSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const guard = await ensureFlagAndAuth(validation.data.businessSlug, {
    write: true,
  });
  if (!guard.success) {
    return {
      success: false,
      error: guard.error,
      code: guard.code as CancelSocialPostRequestResult extends {
        code?: infer C;
      }
        ? C
        : never,
    };
  }
  const { auth, actor } = guard;

  const row = await prisma.socialPostRequest.findFirst({
    where: { id: validation.data.requestId, business_id: actor.businessId },
    select: { id: true, status: true, requested_by_user_id: true },
  });
  if (!row) {
    return { success: false, error: "Request not found.", code: "NOT_FOUND" };
  }
  if (
    actor.actorType !== "OWNER" &&
    row.requested_by_user_id !== actor.userId
  ) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }
  if (row.status !== "PENDING") {
    return {
      success: false,
      error: "Only pending requests can be cancelled.",
      code: "NOT_PENDING",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPostRequest.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
    });
    await logAudit(tx, {
      entityType: "SocialPostRequest",
      entityId: row.id,
      action: "CANCELLED",
      actorId: actor.userId,
      actorType: "USER",
      businessId: actor.businessId,
      changes: {
        before: { status: row.status },
        after: { status: "CANCELLED" },
      },
    });
  });

  revalidatePath(`/app/${auth.businessSlug}/social-posts`);
  revalidatePath(`/app/${auth.businessSlug}/social-posts/my-requests`);
  return { success: true, requestId: row.id };
}

// ─── 4. approve (reviewer) ──────────────────────────────────────

const approveSchema = z.object({
  businessSlug: z.string().min(1),
  requestId: z.string().min(1),
  /**
   * Optional overrides applied at approval time. The reviewer may want
   * to tighten the topic / change the tone before the AI runs without
   * editing the original request. When omitted, the request's stored
   * fields are used verbatim.
   */
  overrideTopic: z.string().trim().min(1).max(TOPIC_MAX).optional(),
  overrideTone: z
    .string()
    .refine((v) => VALID_TONES.has(v), { message: "Invalid tone" })
    .optional(),
  generateImageNow: z.boolean().optional(),
});

export type ApproveSocialPostRequestResult =
  | {
      success: true;
      requestId: string;
      socialPostId: string;
    }
  | {
      success: false;
      error: string;
      code?:
        | "FEATURE_DISABLED"
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput"
        | "NOT_FOUND"
        | "NOT_PENDING"
        | "DRAFT_FAILED";
    };

export async function approveSocialPostRequestAction(
  input: z.input<typeof approveSchema>,
): Promise<ApproveSocialPostRequestResult> {
  const validation = approveSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const guard = await ensureFlagAndAuth(validation.data.businessSlug, {
    write: true,
  });
  if (!guard.success) {
    return {
      success: false,
      error: guard.error,
      code: guard.code as ApproveSocialPostRequestResult extends {
        code?: infer C;
      }
        ? C
        : never,
    };
  }
  const { auth, actor } = guard;

  if (!hasStaffPermission(actor, StaffPermission.SOCIAL_POST_REVIEW)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  const finishTelemetry = startSocialPostRequestTimer({
    action: "APPROVED",
    businessId: actor.businessId,
    actorRole: actor.actorType,
  });

  const row = await prisma.socialPostRequest.findFirst({
    where: { id: validation.data.requestId, business_id: actor.businessId },
    select: {
      id: true,
      status: true,
      topic: true,
      brief: true,
      category: true,
      desired_tone: true,
      attachment_url: true,
      requested_by_user_id: true,
    },
  });
  if (!row) {
    finishTelemetry({ success: false, errorCode: "NOT_FOUND" });
    return { success: false, error: "Request not found.", code: "NOT_FOUND" };
  }
  if (row.status !== "PENDING") {
    finishTelemetry({ success: false, errorCode: "NOT_PENDING" });
    return {
      success: false,
      error: "This request has already been reviewed.",
      code: "NOT_PENDING",
    };
  }

  // Lazy-import the createOrganicSocialPostAction to avoid a circular
  // server-action graph at module load time. The action takes care of
  // its own permission checking (requireOwnerTenantWriteAccess), which
  // we satisfy here because reviewers acting on a request are
  // operating with elevated trust.
  const { createOrganicSocialPostAction } = await import(
    "@/lib/server actions/social"
  );

  const topic = validation.data.overrideTopic ?? row.topic;
  const tone = (validation.data.overrideTone ?? row.desired_tone ?? "AUTO") as
    | "AUTO"
    | "FRIENDLY_TAGLISH"
    | "PREMIUM_LUXURY"
    | "WITTY_PLAYFUL"
    | "WARM_NURTURING"
    | "DIRECT_URGENT";

  const draft = await createOrganicSocialPostAction({
    businessSlug: validation.data.businessSlug,
    topic,
    category: row.category as
      | "SERVICE_SHOWCASE"
      | "BEHIND_THE_SCENES"
      | "TIPS_EDUCATION"
      | "SEASONAL_GREETING"
      | "TEAM_SPOTLIGHT"
      | "GENERAL",
    captionTone: tone,
    ownerCaptionDirection: row.brief ?? undefined,
    generateImageNow: validation.data.generateImageNow ?? false,
    sourceRequestId: row.id,
  });

  if (!draft.success) {
    // The downstream organic-post action did invoke AI even on failure
    // (Gemini may have run, may have errored). Tag accordingly so cost
    // attribution stays honest.
    finishTelemetry({ success: false, errorCode: "DRAFT_FAILED", aiInvoked: true });
    return {
      success: false,
      error: draft.error ?? "Failed to create draft from request.",
      code: "DRAFT_FAILED",
    };
  }

  // Marking the request APPROVED + linking the draft happens inside
  // createOrganicSocialPostAction's transaction (via sourceRequestId).
  // The audit + outbox below capture the reviewer's action.
  await prisma.$transaction(async (tx) => {
    await tx.socialPostRequest.update({
      where: { id: row.id },
      data: {
        reviewed_by_user_id: actor.userId,
        reviewed_at: new Date(),
      },
    });
    await logAudit(tx, {
      entityType: "SocialPostRequest",
      entityId: row.id,
      action: "APPROVED",
      actorId: actor.userId,
      actorType: "USER",
      businessId: actor.businessId,
      changes: {
        before: { status: "PENDING" },
        after: {
          status: "APPROVED",
          social_post_id: draft.data.postId,
          reviewed_at: new Date().toISOString(),
        },
      },
    });
    await publishEvent(tx, {
      type: "SOCIAL_POST_REQUEST_APPROVED",
      aggregateType: "SocialPostRequest",
      aggregateId: row.id,
      businessId: actor.businessId,
      payload: {
        requestId: row.id,
        businessId: actor.businessId,
        requestedByUserId: row.requested_by_user_id,
        reviewedByUserId: actor.userId,
        socialPostId: draft.data.postId,
        topic,
      },
    });
  });

  revalidatePath(`/app/${auth.businessSlug}/social-posts`);
  revalidatePath(`/app/${auth.businessSlug}/social-posts/my-requests`);
  finishTelemetry({ success: true, aiInvoked: true });
  return { success: true, requestId: row.id, socialPostId: draft.data.postId };
}

// ─── 5. reject (reviewer) ───────────────────────────────────────

const rejectSchema = z.object({
  businessSlug: z.string().min(1),
  requestId: z.string().min(1),
  reason: z.string().trim().min(1).max(REJECTION_REASON_MAX),
});

export type RejectSocialPostRequestResult =
  | { success: true; requestId: string }
  | {
      success: false;
      error: string;
      code?:
        | "FEATURE_DISABLED"
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput"
        | "NOT_FOUND"
        | "NOT_PENDING";
    };

export async function rejectSocialPostRequestAction(
  input: z.input<typeof rejectSchema>,
): Promise<RejectSocialPostRequestResult> {
  const validation = rejectSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const guard = await ensureFlagAndAuth(validation.data.businessSlug, {
    write: true,
  });
  if (!guard.success) {
    return {
      success: false,
      error: guard.error,
      code: guard.code as RejectSocialPostRequestResult extends {
        code?: infer C;
      }
        ? C
        : never,
    };
  }
  const { auth, actor } = guard;

  if (!hasStaffPermission(actor, StaffPermission.SOCIAL_POST_REVIEW)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  const row = await prisma.socialPostRequest.findFirst({
    where: { id: validation.data.requestId, business_id: actor.businessId },
    select: {
      id: true,
      status: true,
      topic: true,
      requested_by_user_id: true,
    },
  });
  if (!row) {
    return { success: false, error: "Request not found.", code: "NOT_FOUND" };
  }
  if (row.status !== "PENDING") {
    return {
      success: false,
      error: "This request has already been reviewed.",
      code: "NOT_PENDING",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPostRequest.update({
      where: { id: row.id },
      data: {
        status: "REJECTED",
        rejection_reason: validation.data.reason.trim(),
        reviewed_by_user_id: actor.userId,
        reviewed_at: new Date(),
      },
    });
    await logAudit(tx, {
      entityType: "SocialPostRequest",
      entityId: row.id,
      action: "REJECTED",
      actorId: actor.userId,
      actorType: "USER",
      businessId: actor.businessId,
      changes: {
        before: { status: "PENDING" },
        after: {
          status: "REJECTED",
          rejection_reason: validation.data.reason.trim(),
        },
      },
    });
    await publishEvent(tx, {
      type: "SOCIAL_POST_REQUEST_REJECTED",
      aggregateType: "SocialPostRequest",
      aggregateId: row.id,
      businessId: actor.businessId,
      payload: {
        requestId: row.id,
        businessId: actor.businessId,
        requestedByUserId: row.requested_by_user_id,
        reviewedByUserId: actor.userId,
        topic: row.topic,
        rejectionReason: validation.data.reason.trim(),
      },
    });
  });

  revalidatePath(`/app/${auth.businessSlug}/social-posts`);
  revalidatePath(`/app/${auth.businessSlug}/social-posts/my-requests`);
  return { success: true, requestId: row.id };
}

// ─── 6. list ────────────────────────────────────────────────────

const listSchema = z.object({
  businessSlug: z.string().min(1),
  /**
   * "MINE" returns only requests the actor submitted. "ALL" returns
   * every request in the business — gated on SOCIAL_POST_REVIEW.
   */
  scope: z.enum(["MINE", "ALL"]).default("MINE"),
  status: z
    .enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SocialPostRequestSummary = {
  id: string;
  topic: string;
  brief: string | null;
  category: string;
  desiredTone: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  attachmentUrl: string | null;
  dueDate: string | null;
  rejectionReason: string | null;
  socialPostId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; name: string };
  reviewedBy: { id: string; name: string } | null;
};

export type ListSocialPostRequestsResult =
  | { success: true; requests: SocialPostRequestSummary[] }
  | {
      success: false;
      error: string;
      code?: "FEATURE_DISABLED" | "Forbidden" | "Unauthorized" | "InvalidInput";
    };

export async function listSocialPostRequestsAction(
  input: z.input<typeof listSchema>,
): Promise<ListSocialPostRequestsResult> {
  const validation = listSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const guard = await ensureFlagAndAuth(validation.data.businessSlug, {
    write: false,
  });
  if (!guard.success) {
    return {
      success: false,
      error: guard.error,
      code: guard.code as ListSocialPostRequestsResult extends {
        code?: infer C;
      }
        ? C
        : never,
    };
  }
  const { actor } = guard;

  if (validation.data.scope === "ALL") {
    if (!hasStaffPermission(actor, StaffPermission.SOCIAL_POST_REVIEW)) {
      return { success: false, error: "Forbidden", code: "Forbidden" };
    }
  }

  const rows = await prisma.socialPostRequest.findMany({
    where: {
      business_id: actor.businessId,
      ...(validation.data.scope === "MINE"
        ? { requested_by_user_id: actor.userId }
        : {}),
      ...(validation.data.status ? { status: validation.data.status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: validation.data.limit,
    select: {
      id: true,
      topic: true,
      brief: true,
      category: true,
      desired_tone: true,
      status: true,
      attachment_url: true,
      due_date: true,
      rejection_reason: true,
      social_post_id: true,
      created_at: true,
      reviewed_at: true,
      requested_by_user: { select: { id: true, name: true } },
      reviewed_by_user: { select: { id: true, name: true } },
    },
  });

  return {
    success: true,
    requests: rows.map((r) => ({
      id: r.id,
      topic: r.topic,
      brief: r.brief,
      category: r.category,
      desiredTone: r.desired_tone,
      status: r.status,
      attachmentUrl: r.attachment_url,
      dueDate: r.due_date?.toISOString() ?? null,
      rejectionReason: r.rejection_reason,
      socialPostId: r.social_post_id,
      createdAt: r.created_at.toISOString(),
      reviewedAt: r.reviewed_at?.toISOString() ?? null,
      requestedBy: r.requested_by_user,
      reviewedBy: r.reviewed_by_user,
    })),
  };
}
