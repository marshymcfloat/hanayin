import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveTenantActorContext: vi.fn(),
  hasStaffPermission: vi.fn(),
  rateLimit: vi.fn(),
  isSocialPostRequestsEnabledForBusiness: vi.fn(),
  socialPostRequestFindFirst: vi.fn(),
  socialPostRequestFindMany: vi.fn(),
  socialPostRequestCreate: vi.fn(),
  socialPostRequestUpdate: vi.fn(),
  outboxMessageCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  revalidatePath: vi.fn(),
  createOrganicSocialPostAction: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: mocks.resolveTenantActorContext,
  hasStaffPermission: mocks.hasStaffPermission,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/features/social-post-requests", () => ({
  isSocialPostRequestsEnabledForBusiness:
    mocks.isSocialPostRequestsEnabledForBusiness,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/server actions/social", () => ({
  createOrganicSocialPostAction: mocks.createOrganicSocialPostAction,
}));

vi.mock("@/prisma/prisma", () => {
  const txDelegate = {
    socialPostRequest: {
      findFirst: mocks.socialPostRequestFindFirst,
      findMany: mocks.socialPostRequestFindMany,
      create: mocks.socialPostRequestCreate,
      update: mocks.socialPostRequestUpdate,
    },
    outboxMessage: { create: mocks.outboxMessageCreate },
    auditLog: { create: mocks.auditLogCreate },
  };
  return {
    prisma: {
      ...txDelegate,
      $transaction: async <T>(fn: (tx: typeof txDelegate) => Promise<T>) =>
        fn(txDelegate),
    },
  };
});

import {
  approveSocialPostRequestAction,
  cancelSocialPostRequestAction,
  listSocialPostRequestsAction,
  rejectSocialPostRequestAction,
  submitSocialPostRequestAction,
  updateSocialPostRequestAction,
} from "./social-post-requests";

const baseManager = {
  success: true as const,
  businessId: "biz_1",
  businessSlug: "demo",
  userId: "user_manager",
  actorType: "EMPLOYEE" as const,
  role: Role.EMPLOYEE,
  employeeId: 42,
  ownerId: null,
  profile: StaffProfile.MANAGER,
  permissions: [
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    StaffPermission.SOCIAL_POST_REVIEW,
  ],
  businessPolicy: {
    structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const,
    allowEmployeeSelfBooking: true,
    managerCanServe: true,
  },
};

const baseStaff = {
  ...baseManager,
  userId: "user_staff",
  profile: StaffProfile.STAFF,
  permissions: [StaffPermission.SOCIAL_POST_REQUEST_CREATE],
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.isSocialPostRequestsEnabledForBusiness.mockReturnValue(true);
  mocks.requireAuth.mockResolvedValue({
    success: true,
    businessSlug: "demo",
    session: { user: { id: "user_manager" } },
  });
  mocks.resolveTenantActorContext.mockResolvedValue(baseManager);
  mocks.hasStaffPermission.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: Date.now() + 60_000,
  });
  mocks.socialPostRequestFindFirst.mockResolvedValue(null);
  mocks.socialPostRequestFindMany.mockResolvedValue([]);
  mocks.socialPostRequestCreate.mockResolvedValue({
    id: "req_1",
    requested_by_user: { name: "Maria Cruz" },
  });
  mocks.socialPostRequestUpdate.mockResolvedValue({});
  mocks.outboxMessageCreate.mockResolvedValue({});
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.createOrganicSocialPostAction.mockResolvedValue({
    success: true,
    data: { postId: "post_1" },
  });
});

// ─── submit ──────────────────────────────────────────────────────

describe("submitSocialPostRequestAction", () => {
  const validInput = {
    businessSlug: "demo",
    topic: "Skin tag care",
    category: "TIPS_EDUCATION",
  } as const;

  it("creates a request and fires the outbox event on happy path", async () => {
    const result = await submitSocialPostRequestAction(validInput);
    expect(result).toMatchObject({ success: true, requestId: "req_1" });
    expect(mocks.socialPostRequestCreate).toHaveBeenCalled();
    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "SOCIAL_POST_REQUEST_SUBMITTED",
        }),
      }),
    );
  });

  it("rejects when feature flag is off", async () => {
    mocks.isSocialPostRequestsEnabledForBusiness.mockReturnValue(false);
    const result = await submitSocialPostRequestAction(validInput);
    expect(result).toMatchObject({ success: false, code: "FEATURE_DISABLED" });
  });

  it("rejects when actor lacks SOCIAL_POST_REQUEST_CREATE", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await submitSocialPostRequestAction(validInput);
    expect(result).toMatchObject({ code: "Forbidden" });
    expect(mocks.socialPostRequestCreate).not.toHaveBeenCalled();
  });

  it("rate-limits per user (1/min)", async () => {
    // First call: rateLimit returns ok. Second call: rateLimit returns
    // not ok for the user-key. We model this by failing the first
    // rateLimit call (the per-user one) outright.
    mocks.rateLimit.mockResolvedValueOnce({
      success: false,
      limit: 1,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    const result = await submitSocialPostRequestAction(validInput);
    expect(result).toMatchObject({ code: "RATE_LIMITED_USER" });
  });

  it("rate-limits per business (50/day)", async () => {
    // First call (per-user) ok, second call (per-business) fails.
    mocks.rateLimit
      .mockResolvedValueOnce({
        success: true,
        limit: 1,
        remaining: 0,
        reset: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        success: false,
        limit: 50,
        remaining: 0,
        reset: Date.now() + 86_400_000,
      });
    const result = await submitSocialPostRequestAction(validInput);
    expect(result).toMatchObject({ code: "RATE_LIMITED_BUSINESS" });
  });

  it("surfaces a duplicate warning when same topic+category exists in last 14 days", async () => {
    mocks.socialPostRequestFindFirst.mockResolvedValueOnce({
      id: "req_existing",
      topic: "skin tag care",
    });
    const result = await submitSocialPostRequestAction(validInput);
    expect(result).toMatchObject({
      success: true,
      duplicateWarning: {
        existingRequestId: "req_existing",
        existingTopic: "skin tag care",
      },
    });
  });

  it("rejects unknown category at zod boundary", async () => {
    const result = await submitSocialPostRequestAction({
      ...validInput,
      category: "MADE_UP_CATEGORY" as never,
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });
});

// ─── approve ─────────────────────────────────────────────────────

describe("approveSocialPostRequestAction", () => {
  const pendingRow = {
    id: "req_1",
    status: "PENDING" as const,
    topic: "Skin tag care",
    brief: "Educational angle",
    category: "TIPS_EDUCATION",
    desired_tone: "AUTO",
    attachment_url: null,
    requested_by_user_id: "user_staff",
  };

  beforeEach(() => {
    mocks.socialPostRequestFindFirst.mockResolvedValue(pendingRow);
  });

  it("calls createOrganicSocialPostAction and links the post on happy path", async () => {
    const result = await approveSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });

    expect(result).toMatchObject({
      success: true,
      requestId: "req_1",
      socialPostId: "post_1",
    });

    // The downstream organic-post create receives the request's
    // topic + category + tone, plus sourceRequestId so the link
    // is established atomically.
    expect(mocks.createOrganicSocialPostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "Skin tag care",
        category: "TIPS_EDUCATION",
        captionTone: "AUTO",
        sourceRequestId: "req_1",
      }),
    );

    expect(mocks.outboxMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: "SOCIAL_POST_REQUEST_APPROVED",
        }),
      }),
    );
  });

  it("rejects when actor lacks SOCIAL_POST_REVIEW", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await approveSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
    expect(mocks.createOrganicSocialPostAction).not.toHaveBeenCalled();
  });

  it("rejects when request is not PENDING", async () => {
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      ...pendingRow,
      status: "APPROVED",
    });
    const result = await approveSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });
    expect(result).toMatchObject({ code: "NOT_PENDING" });
  });

  it("returns DRAFT_FAILED when the downstream create fails", async () => {
    mocks.createOrganicSocialPostAction.mockResolvedValue({
      success: false,
      error: "Gemini exploded",
    });
    const result = await approveSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });
    expect(result).toMatchObject({ code: "DRAFT_FAILED" });
  });

  it("respects override topic and tone", async () => {
    await approveSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
      overrideTopic: "Sharper topic",
      overrideTone: "PREMIUM_LUXURY",
    });
    expect(mocks.createOrganicSocialPostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "Sharper topic",
        captionTone: "PREMIUM_LUXURY",
      }),
    );
  });
});

// ─── reject ──────────────────────────────────────────────────────

describe("rejectSocialPostRequestAction", () => {
  beforeEach(() => {
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      id: "req_1",
      status: "PENDING",
      topic: "x",
      requested_by_user_id: "user_staff",
    });
  });

  it("rejects with reason on happy path", async () => {
    const result = await rejectSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
      reason: "Too narrow for this season",
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.socialPostRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REJECTED",
          rejection_reason: "Too narrow for this season",
        }),
      }),
    );
  });

  it("rejects empty reason at the input layer", async () => {
    const result = await rejectSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
      reason: "   ",
    });
    expect(result).toMatchObject({ code: "InvalidInput" });
  });

  it("rejects when reviewer lacks SOCIAL_POST_REVIEW", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await rejectSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
      reason: "x",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
  });
});

// ─── cancel ──────────────────────────────────────────────────────

describe("cancelSocialPostRequestAction", () => {
  it("requester can cancel their own PENDING request", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue(baseStaff);
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      id: "req_1",
      status: "PENDING",
      requested_by_user_id: baseStaff.userId,
    });
    const result = await cancelSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });
    expect(result).toMatchObject({ success: true });
  });

  it("non-requester non-owner cannot cancel someone else's request", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue(baseStaff);
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      id: "req_1",
      status: "PENDING",
      requested_by_user_id: "someone_else",
    });
    const result = await cancelSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
  });

  it("rejects already-cancelled / approved / rejected", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue(baseStaff);
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      id: "req_1",
      status: "APPROVED",
      requested_by_user_id: baseStaff.userId,
    });
    const result = await cancelSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
    });
    expect(result).toMatchObject({ code: "NOT_PENDING" });
  });
});

// ─── update ──────────────────────────────────────────────────────

describe("updateSocialPostRequestAction", () => {
  it("requester can edit their own PENDING request", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue(baseStaff);
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      id: "req_1",
      status: "PENDING",
      requested_by_user_id: baseStaff.userId,
      topic: "old",
      brief: null,
      category: "GENERAL",
      desired_tone: null,
      attachment_url: null,
      due_date: null,
    });
    const result = await updateSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
      topic: "new",
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.socialPostRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ topic: "new" }),
      }),
    );
  });

  it("rejects edits once status leaves PENDING", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue(baseStaff);
    mocks.socialPostRequestFindFirst.mockResolvedValue({
      id: "req_1",
      status: "REJECTED",
      requested_by_user_id: baseStaff.userId,
      topic: "old",
      brief: null,
      category: "GENERAL",
      desired_tone: null,
      attachment_url: null,
      due_date: null,
    });
    const result = await updateSocialPostRequestAction({
      businessSlug: "demo",
      requestId: "req_1",
      topic: "new",
    });
    expect(result).toMatchObject({ code: "NOT_PENDING" });
  });
});

// ─── list ────────────────────────────────────────────────────────

describe("listSocialPostRequestsAction", () => {
  it("scope=ALL requires SOCIAL_POST_REVIEW", async () => {
    mocks.hasStaffPermission.mockReturnValue(false);
    const result = await listSocialPostRequestsAction({
      businessSlug: "demo",
      scope: "ALL",
    });
    expect(result).toMatchObject({ code: "Forbidden" });
  });

  it("scope=MINE works for any tenant user", async () => {
    mocks.hasStaffPermission.mockReturnValue(false); // no review perm
    const result = await listSocialPostRequestsAction({
      businessSlug: "demo",
      scope: "MINE",
    });
    expect(result).toMatchObject({ success: true, requests: [] });
  });

  it("filters MINE by requested_by_user_id", async () => {
    mocks.resolveTenantActorContext.mockResolvedValue(baseStaff);
    await listSocialPostRequestsAction({
      businessSlug: "demo",
      scope: "MINE",
    });
    expect(mocks.socialPostRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          business_id: baseStaff.businessId,
          requested_by_user_id: baseStaff.userId,
        }),
      }),
    );
  });

  it("optional status filter narrows the query", async () => {
    await listSocialPostRequestsAction({
      businessSlug: "demo",
      scope: "ALL",
      status: "APPROVED",
    });
    expect(mocks.socialPostRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "APPROVED" }),
      }),
    );
  });
});
