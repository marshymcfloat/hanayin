import { describe, expect, it } from "vitest";

import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";
import type { ViewerContextValue } from "@/lib/auth/viewer-context";

import { deriveSocialViewerContext } from "./viewer-context";

function viewer(
  overrides: Partial<ViewerContextValue> = {},
): ViewerContextValue {
  return {
    actorType: "EMPLOYEE",
    role: Role.EMPLOYEE,
    staffProfile: StaffProfile.STAFF,
    permissions: [],
    businessId: "biz_1",
    businessSlug: "demo",
    userId: "user_1",
    ownerId: null,
    employeeId: 1,
    ...overrides,
  };
}

describe("deriveSocialViewerContext", () => {
  it("OWNER gets every flag", () => {
    expect(
      deriveSocialViewerContext(
        viewer({
          actorType: "OWNER",
          role: Role.OWNER,
          staffProfile: null,
          ownerId: 1,
          employeeId: null,
        }),
      ),
    ).toEqual({
      canSubmitRequest: true,
      canReviewRequests: true,
      canEditDraft: true,
      canPublish: true,
      canViewAnalytics: true,
    });
  });

  it("MANAGER with default permissions can submit + review + edit draft + view analytics", () => {
    expect(
      deriveSocialViewerContext(
        viewer({
          staffProfile: StaffProfile.MANAGER,
          permissions: [
            StaffPermission.SOCIAL_POST_REQUEST_CREATE,
            StaffPermission.SOCIAL_POST_REVIEW,
          ],
        }),
      ),
    ).toEqual({
      canSubmitRequest: true,
      canReviewRequests: true,
      canEditDraft: true,
      canPublish: false,
      canViewAnalytics: true,
    });
  });

  it("MANAGER with explicit SOCIAL_POST_PUBLISH grant can publish", () => {
    expect(
      deriveSocialViewerContext(
        viewer({
          staffProfile: StaffProfile.MANAGER,
          permissions: [
            StaffPermission.SOCIAL_POST_REQUEST_CREATE,
            StaffPermission.SOCIAL_POST_REVIEW,
            StaffPermission.SOCIAL_POST_PUBLISH,
          ],
        }),
      ).canPublish,
    ).toBe(true);
  });

  it("STAFF with default permissions can only submit a request", () => {
    expect(
      deriveSocialViewerContext(
        viewer({
          staffProfile: StaffProfile.STAFF,
          permissions: [StaffPermission.SOCIAL_POST_REQUEST_CREATE],
        }),
      ),
    ).toEqual({
      canSubmitRequest: true,
      canReviewRequests: false,
      canEditDraft: false,
      canPublish: false,
      canViewAnalytics: false,
    });
  });

  it("CASHIER with default permissions can only submit a request", () => {
    expect(
      deriveSocialViewerContext(
        viewer({
          staffProfile: StaffProfile.CASHIER,
          permissions: [StaffPermission.SOCIAL_POST_REQUEST_CREATE],
        }),
      ),
    ).toEqual({
      canSubmitRequest: true,
      canReviewRequests: false,
      canEditDraft: false,
      canPublish: false,
      canViewAnalytics: false,
    });
  });

  it("employee with no permissions sees nothing", () => {
    expect(
      deriveSocialViewerContext(
        viewer({
          staffProfile: StaffProfile.STAFF,
          permissions: [],
        }),
      ),
    ).toEqual({
      canSubmitRequest: false,
      canReviewRequests: false,
      canEditDraft: false,
      canPublish: false,
      canViewAnalytics: false,
    });
  });
});
