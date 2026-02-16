import { describe, expect, it } from "vitest";

import { groupSocialPostsForUx, type SocialPostView } from "./SocialPostsPageClient";

function makePost(id: string, status: SocialPostView["status"]): SocialPostView {
  return {
    id,
    title: `Post ${id}`,
    status,
    caption_draft: "Draft caption",
    caption_final: null,
    hashtags: [],
    media_url: null,
    last_error: null,
    created_at: new Date("2026-02-14T00:00:00.000Z"),
    sale_event: null,
    targets: [],
  };
}

describe("groupSocialPostsForUx", () => {
  it("puts READY and FAILED into action-needed lane", () => {
    const result = groupSocialPostsForUx([
      makePost("a", "READY"),
      makePost("b", "FAILED"),
      makePost("c", "DRAFT"),
      makePost("d", "PUBLISHED"),
    ]);

    expect(result.actionNeededPosts.map((post) => post.id)).toEqual(["a", "b"]);
    expect(result.draftPosts.map((post) => post.id)).toEqual(["c"]);
    expect(result.otherPosts.map((post) => post.id)).toEqual(["d"]);
  });
});
