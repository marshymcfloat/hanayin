"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSocialPostDraftAction,
  generateSocialPostImageAction,
  publishSocialPostAction,
  regenerateSocialPostCaptionAction,
  retrySocialPostTargetAction,
  updateSocialPostDraftAction,
} from "@/lib/server actions/social";
import {
  DiscountType,
  SocialPlatform,
  SocialPostStatus,
  SocialTargetStatus,
} from "@/prisma/generated/prisma/enums";
import {
  ImageOff,
  ImagePlus,
  Loader2,
  Megaphone,
  PenLine,
  RefreshCcw,
  Send,
  Trash2,
} from "lucide-react";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  SOCIAL_IMAGE_PROFILE_OPTIONS,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";
import { GrowthFlowChecklist } from "../growth/GrowthFlowChecklist";
import type { GrowthFlowContext } from "../growth/types";
import { CreateOrganicPostDialog } from "./CreateOrganicPostDialog";

type SocialPostTargetView = {
  id: string;
  status: SocialTargetStatus;
  last_error: string | null;
  published_at: Date | null;
  remote_permalink: string | null;
  social_connection: {
    platform: SocialPlatform;
    display_name: string;
  };
};

export type SocialPostView = {
  id: string;
  title: string;
  status: SocialPostStatus;
  caption_draft: string;
  caption_final: string | null;
  hashtags: string[];
  media_url: string | null;
  last_error: string | null;
  created_at: Date;
  sale_event: {
    title: string;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;
    start_date: Date;
    end_date: Date;
  } | null;
  targets: SocialPostTargetView[];
};

type DraftState = {
  title: string;
  caption: string;
  hashtagsCsv: string;
  mediaUrl: string;
  imageProfile: SocialImageProfile;
};

type SocialPostGroups = {
  actionNeededPosts: SocialPostView[];
  draftPosts: SocialPostView[];
  otherPosts: SocialPostView[];
};

function toDraftState(post: SocialPostView): DraftState {
  return {
    title: post.title,
    caption: post.caption_final || post.caption_draft,
    hashtagsCsv: post.hashtags.join(", "),
    mediaUrl: post.media_url || "",
    imageProfile: DEFAULT_SOCIAL_IMAGE_PROFILE,
  };
}

function platformLabel(platform: SocialPlatform) {
  if (platform === "FACEBOOK_PAGE") return "Facebook";
  return "Instagram";
}

function statusBadgeClass(status: SocialPostStatus | SocialTargetStatus) {
  switch (status) {
    case "PUBLISHED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "FAILED":
      return "bg-red-100 text-red-700 border-red-200";
    case "PUBLISHING":
    case "QUEUED":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "READY":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatPostDate(value: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function groupSocialPostsForUx(
  posts: SocialPostView[],
): SocialPostGroups {
  const actionNeededPosts = posts.filter(
    (post) => post.status === "READY" || post.status === "FAILED",
  );
  const draftPosts = posts.filter((post) => post.status === "DRAFT");
  const otherPosts = posts.filter(
    (post) =>
      post.status !== "READY" &&
      post.status !== "FAILED" &&
      post.status !== "DRAFT",
  );

  return { actionNeededPosts, draftPosts, otherPosts };
}

function getDefaultSelectedPostId(
  posts: SocialPostView[],
  flowContext?: GrowthFlowContext,
) {
  if (
    flowContext?.socialPostId &&
    posts.some((post) => post.id === flowContext.socialPostId)
  ) {
    return flowContext.socialPostId;
  }

  return (
    posts.find((post) => post.status === "READY")?.id ||
    posts.find((post) => post.status === "DRAFT")?.id ||
    posts[0]?.id ||
    null
  );
}

function isLikelyImageUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function SocialPostsPageClient(props: {
  businessSlug: string;
  businessName: string;
  businessImageUrl?: string | null;
  initialPosts: SocialPostView[];
  flowContext?: GrowthFlowContext;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<SocialPostView[]>(props.initialPosts);
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [retryingTargetId, setRetryingTargetId] = useState<string | null>(null);
  const [generatingImagePostId, setGeneratingImagePostId] = useState<
    string | null
  >(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [regeneratingCaptionPostId, setRegeneratingCaptionPostId] = useState<
    string | null
  >(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>(
    {},
  );
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, true>>(
    {},
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(() =>
    getDefaultSelectedPostId(props.initialPosts, props.flowContext),
  );

  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() =>
    Object.fromEntries(
      props.initialPosts.map((post) => [post.id, toDraftState(post)]),
    ),
  );

  const { actionNeededPosts, draftPosts, otherPosts } = useMemo(
    () => groupSocialPostsForUx(posts),
    [posts],
  );

  // Days since the most recent post — used to nudge owners who've gone quiet.
  // Returns null when there are no posts yet (the empty state already covers
  // that case with its own CTA).
  const daysSinceLastPost = useMemo<number | null>(() => {
    if (posts.length === 0) return null;
    const newest = posts.reduce<Date | null>((acc, post) => {
      const t = new Date(post.created_at).getTime();
      if (Number.isNaN(t)) return acc;
      if (!acc || t > acc.getTime()) return new Date(t);
      return acc;
    }, null);
    if (!newest) return null;
    return Math.floor((Date.now() - newest.getTime()) / (24 * 60 * 60 * 1000));
  }, [posts]);

  useEffect(() => {
    setPosts(props.initialPosts);
  }, [props.initialPosts]);

  useEffect(() => {
    setDrafts((previous) =>
      Object.fromEntries(
        posts.map((post) => [post.id, previous[post.id] || toDraftState(post)]),
      ),
    );
  }, [posts]);

  useEffect(() => {
    if (posts.length === 0) {
      setSelectedPostId(null);
      return;
    }

    setSelectedPostId((currentSelected) => {
      if (
        currentSelected &&
        posts.some((post) => post.id === currentSelected)
      ) {
        return currentSelected;
      }

      return getDefaultSelectedPostId(posts, props.flowContext);
    });
  }, [posts, props.flowContext]);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) || null,
    [posts, selectedPostId],
  );

  const hasStep2Signal =
    posts.some((post) => !!post.sale_event) ||
    typeof props.flowContext?.saleEventId === "number";

  const nextActionText = selectedPost
    ? selectedPost.targets.length === 0
      ? "Connect channels first, then publish this post."
      : selectedPost.status === "PUBLISHED"
        ? "Pick another draft or ready post to continue publishing."
        : "Review content, save draft, then publish to connected channels."
    : "Go back to Sale Events and create a draft event with social post.";

  const updateDraft = (postId: string, changes: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {
          title: "",
          caption: "",
          hashtagsCsv: "",
          mediaUrl: "",
          imageProfile: DEFAULT_SOCIAL_IMAGE_PROFILE,
        }),
        ...changes,
      },
    }));
    if ("mediaUrl" in changes) {
      setImageLoadErrors((prev) => {
        if (!(postId in prev)) return prev;
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    }
  };

  const saveDraft = async (postId: string) => {
    const draft = drafts[postId];
    if (!draft) return;

    setSavingPostId(postId);
    try {
      const result = await updateSocialPostDraftAction({
        businessSlug: props.businessSlug,
        postId,
        title: draft.title,
        captionFinal: draft.caption,
        hashtags: draft.hashtagsCsv
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        mediaUrl: draft.mediaUrl || null,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to save social draft.");
        return;
      }

      toast.success("Social draft saved.");
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred while saving the draft.");
    } finally {
      setSavingPostId(null);
    }
  };

  const publishPost = async (postId: string) => {
    setPublishingPostId(postId);
    setPublishErrors((prev) => ({ ...prev, [postId]: "" }));

    try {
      const result = await publishSocialPostAction({
        businessSlug: props.businessSlug,
        postId,
      });

      if (!result.success) {
        const message = result.error || "Failed to queue social publish.";
        setPublishErrors((prev) => ({ ...prev, [postId]: message }));
        toast.error(message);
        return;
      }

      toast.success("Post queued for publishing.");
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred while publishing.");
    } finally {
      setPublishingPostId(null);
    }
  };

  const retryTarget = async (targetId: string) => {
    setRetryingTargetId(targetId);
    try {
      const result = await retrySocialPostTargetAction({
        businessSlug: props.businessSlug,
        targetId,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to queue retry.");
        return;
      }

      toast.success("Retry queued.");
      router.refresh();
    } catch {
      toast.error("Unexpected error while retrying.");
    } finally {
      setRetryingTargetId(null);
    }
  };

  const deleteDraft = async (postId: string) => {
    const post = posts.find((entry) => entry.id === postId);
    if (!post || post.status !== "DRAFT") return;

    const confirmed = window.confirm(
      `Delete draft "${post.title}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingPostId(postId);
    try {
      const result = await deleteSocialPostDraftAction({
        businessSlug: props.businessSlug,
        postId,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to delete social draft.");
        return;
      }

      setPosts((previous) => previous.filter((entry) => entry.id !== postId));
      setDrafts((previous) => {
        if (!(postId in previous)) return previous;
        const next = { ...previous };
        delete next[postId];
        return next;
      });
      setPublishErrors((previous) => {
        if (!(postId in previous)) return previous;
        const next = { ...previous };
        delete next[postId];
        return next;
      });

      toast.success("Draft deleted.");
      router.refresh();
    } catch {
      toast.error("Unexpected error while deleting draft.");
    } finally {
      setDeletingPostId(null);
    }
  };

  const generateImage = async (postId: string) => {
    setGeneratingImagePostId(postId);
    try {
      const result = await generateSocialPostImageAction({
        businessSlug: props.businessSlug,
        postId,
        imageProfile:
          drafts[postId]?.imageProfile || DEFAULT_SOCIAL_IMAGE_PROFILE,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to generate social image.");
        return;
      }

      updateDraft(postId, { mediaUrl: result.data.mediaUrl });
      toast.success("Fresh image generated.");
    } catch {
      toast.error("Unexpected error while generating image.");
    } finally {
      setGeneratingImagePostId(null);
    }
  };

  const regenerateCaption = async (postId: string) => {
    setRegeneratingCaptionPostId(postId);
    try {
      const result = await regenerateSocialPostCaptionAction({
        businessSlug: props.businessSlug,
        postId,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to regenerate caption.");
        return;
      }

      updateDraft(postId, {
        caption: result.data.caption,
        hashtagsCsv: result.data.hashtags.join(", "),
      });
      toast.success("Caption regenerated. Review and save draft.");
    } catch {
      toast.error("Unexpected error while regenerating caption.");
    } finally {
      setRegeneratingCaptionPostId(null);
    }
  };

  const pageHeader = (
    <div className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Send className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] sm:text-xl font-bold tracking-tight text-foreground">
                Social Posts
              </h1>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                {posts.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              Generate, review, and publish to your connected channels.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setCreateDialogOpen(true)}
        >
          <PenLine className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Post something</span>
          <span className="sm:hidden">Post</span>
        </Button>
      </div>
    </div>
  );

  if (posts.length === 0) {
    return (
      <>
        <div className="flex flex-col bg-background">
          {pageHeader}
          <div className="px-4 sm:px-8 py-4 sm:py-6">
            <div className="max-w-7xl mx-auto w-full flex flex-col gap-4">
              <GrowthFlowChecklist
                businessSlug={props.businessSlug}
                flowContext={props.flowContext}
                activeStep={3}
                completedSteps={[1, ...(hasStep2Signal ? ([2] as const) : [])]}
                nextAction={nextActionText}
              />
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                  <Megaphone className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  No social drafts yet
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Create a sale event with social draft enabled, or create an
                  organic post to keep your page active.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Create Organic Post
                </Button>
              </div>
            </div>
          </div>
        </div>
        <CreateOrganicPostDialog
          open={createDialogOpen}
          businessSlug={props.businessSlug}
          onOpenChange={setCreateDialogOpen}
          onCreated={(postId) => {
            router.refresh();
            setSelectedPostId(postId);
          }}
        />
      </>
    );
  }

  if (!selectedPost) {
    return null;
  }

  const draft = drafts[selectedPost.id] || toDraftState(selectedPost);
  const failedTargets = selectedPost.targets.filter(
    (target) => target.status === "FAILED",
  );
  const publishError = publishErrors[selectedPost.id];
  const previewImageUrl = isLikelyImageUrl(draft.mediaUrl) ? draft.mediaUrl : "";
  const hasImageLoadError = !!imageLoadErrors[selectedPost.id];

  return (
    <>
      <div className="flex flex-col bg-background">
        {pageHeader}
        <div className="px-4 sm:px-8 py-4 sm:py-6">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            <GrowthFlowChecklist
              businessSlug={props.businessSlug}
              flowContext={props.flowContext}
              activeStep={3}
              completedSteps={[1, ...(hasStep2Signal ? ([2] as const) : [])]}
              nextAction={nextActionText}
            />

            {/* Quiet-page nudge — surfaces when the most recent post is older
                than 14 days. Encourages owners to keep the page active without
                being preachy about it. */}
            {daysSinceLastPost !== null && daysSinceLastPost >= 14 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Megaphone className="h-4 w-4 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    Your page has been quiet for{" "}
                    {daysSinceLastPost < 30
                      ? `${daysSinceLastPost} days`
                      : `${Math.floor(daysSinceLastPost / 7)} weeks`}
                  </p>
                  <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                    Steady posting keeps your page in feeds. Try a quick organic
                    post — it doesn&apos;t have to be tied to a sale.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Post something
                </Button>
              </div>
            )}

            {actionNeededPosts.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                      Action needed now
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Ready and failed posts should be reviewed first.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-muted text-muted-foreground border-border"
                  >
                    {actionNeededPosts.length} post
                    {actionNeededPosts.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {actionNeededPosts.map((post) => {
                    const postDraft = drafts[post.id] || toDraftState(post);
                    const trimmedCaption = (
                      postDraft.caption || post.caption_draft
                    ).trim();
                    const captionPreview = trimmedCaption
                      ? `${trimmedCaption.slice(0, 72)}${
                          trimmedCaption.length > 72 ? "..." : ""
                        }`
                      : "No caption yet";
                    const isSelected = selectedPost.id === post.id;
                    const dateLabel = formatPostDate(post.created_at);

                    return (
                      <div key={post.id} className="relative min-w-[240px]">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedPostId(post.id)}
                          disabled={deletingPostId === post.id}
                          className={`w-full rounded-2xl border px-4 py-3 pr-12 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card hover:bg-accent/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`truncate text-sm font-semibold ${
                                isSelected ? "text-primary" : "text-foreground"
                              }`}
                            >
                              {postDraft.title || post.title}
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                isSelected
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : statusBadgeClass(post.status)
                              }
                            >
                              {post.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {captionPreview}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground/60">
                            {post.sale_event
                              ? post.sale_event.title
                              : "Manual social draft"}
                            {dateLabel ? ` | ${dateLabel}` : ""}
                          </p>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete draft ${postDraft.title || post.title}`}
                          onClick={() => {
                            void deleteDraft(post.id);
                          }}
                          disabled={deletingPostId === post.id}
                          className="absolute bottom-2 right-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors cursor-pointer hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        >
                          {deletingPostId === post.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {draftPosts.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                      Saved Drafts
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Click a draft to open it in the editor.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-muted text-muted-foreground border-border"
                  >
                    {draftPosts.length} draft{draftPosts.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {draftPosts.map((post) => {
                    const postDraft = drafts[post.id] || toDraftState(post);
                    const trimmedCaption = (
                      postDraft.caption || post.caption_draft
                    ).trim();
                    const captionPreview = trimmedCaption
                      ? `${trimmedCaption.slice(0, 72)}${
                          trimmedCaption.length > 72 ? "..." : ""
                        }`
                      : "No caption yet";
                    const isSelected = selectedPost.id === post.id;
                    const dateLabel = formatPostDate(post.created_at);

                    return (
                      <button
                        key={post.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedPostId(post.id)}
                        className={`min-w-[240px] rounded-2xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:bg-accent/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`truncate text-sm font-semibold ${
                              isSelected ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {postDraft.title || post.title}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              isSelected
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : statusBadgeClass(post.status)
                            }
                          >
                            {post.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {captionPreview}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground/60">
                          {post.sale_event
                            ? post.sale_event.title
                            : "Manual social draft"}
                          {dateLabel ? ` | ${dateLabel}` : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {otherPosts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Other posts
                </p>
                <div className="flex flex-wrap gap-2">
                  {otherPosts.map((post) => {
                    const isSelected = selectedPost.id === post.id;

                    return (
                      <button
                        key={post.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedPostId(post.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground hover:bg-accent/30"
                        }`}
                      >
                        <span className="mr-2 inline-block max-w-[220px] truncate align-bottom">
                          {post.title}
                        </span>
                        <span className="text-xs opacity-80">
                          {post.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Card
              key={selectedPost.id}
              className="rounded-2xl border-border shadow-sm"
            >
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-lg font-semibold text-foreground">
                    {selectedPost.title}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(selectedPost.status)}
                  >
                    {selectedPost.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedPost.sale_event
                    ? `From sale event: ${selectedPost.sale_event.title}`
                    : "Manual social draft"}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {selectedPost.targets.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    No connected channels on this draft. Connect Facebook or
                    Instagram first.{" "}
                    <Link
                      href={`/app/${props.businessSlug}/business`}
                      className="font-semibold underline underline-offset-2"
                    >
                      Open social connection settings
                    </Link>
                    .
                  </p>
                ) : null}

                {publishError ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {publishError}
                  </p>
                ) : null}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  {/* ── Left column: editable content ─────────────────── */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Post Title
                      </p>
                      <Input
                        value={draft.title}
                        onChange={(event) =>
                          updateDraft(selectedPost.id, {
                            title: event.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Caption
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => regenerateCaption(selectedPost.id)}
                          disabled={
                            regeneratingCaptionPostId === selectedPost.id
                          }
                        >
                          {regeneratingCaptionPostId === selectedPost.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                              Regenerate
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        className="min-h-[160px]"
                        value={draft.caption}
                        onChange={(event) =>
                          updateDraft(selectedPost.id, {
                            caption: event.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Hashtags (comma separated)
                      </p>
                      <Input
                        value={draft.hashtagsCsv}
                        onChange={(event) =>
                          updateDraft(selectedPost.id, {
                            hashtagsCsv: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* ── Right column: image preview + controls ─────────── */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Post Image
                    </p>
                    <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-muted">
                      {previewImageUrl && !hasImageLoadError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewImageUrl}
                          alt={`Preview for ${draft.title || selectedPost.title}`}
                          className="h-full w-full object-cover"
                          onError={() =>
                            setImageLoadErrors((prev) => ({
                              ...prev,
                              [selectedPost.id]: true,
                            }))
                          }
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                          {hasImageLoadError ? (
                            <ImageOff className="h-7 w-7 text-muted-foreground/40" />
                          ) : (
                            <ImagePlus className="h-7 w-7 text-muted-foreground/40" />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {hasImageLoadError
                              ? "Image URL could not be loaded."
                              : "Generate an image or paste a media URL below."}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Image Style
                      </p>
                      <select
                        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={draft.imageProfile}
                        onChange={(event) =>
                          updateDraft(selectedPost.id, {
                            imageProfile: event.target
                              .value as SocialImageProfile,
                          })
                        }
                      >
                        {SOCIAL_IMAGE_PROFILE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        {
                          SOCIAL_IMAGE_PROFILE_OPTIONS.find(
                            (option) => option.value === draft.imageProfile,
                          )?.description
                        }
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full rounded-xl cursor-pointer"
                      onClick={() => generateImage(selectedPost.id)}
                      disabled={generatingImagePostId === selectedPost.id}
                    >
                      {generatingImagePostId === selectedPost.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <ImagePlus className="mr-2 h-4 w-4" />
                          {previewImageUrl
                            ? "Regenerate Image"
                            : "Generate Image"}
                        </>
                      )}
                    </Button>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Or paste a media URL
                      </p>
                      <Input
                        placeholder="https://..."
                        value={draft.mediaUrl}
                        onChange={(event) =>
                          updateDraft(selectedPost.id, {
                            mediaUrl: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {selectedPost.last_error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {selectedPost.last_error}
                  </p>
                )}

                <div className="rounded-2xl border border-border bg-muted/20 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Channel Status
                  </p>
                  <div className="space-y-2">
                    {selectedPost.targets.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No channels selected.
                      </p>
                    ) : (
                      selectedPost.targets.map((target) => (
                        <div
                          key={target.id}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {platformLabel(target.social_connection.platform)}{" "}
                              | {target.social_connection.display_name}
                            </p>
                            {target.last_error && (
                              <p className="text-xs text-red-600">
                                {target.last_error}
                              </p>
                            )}
                            {target.remote_permalink && (
                              <a
                                className="text-xs text-blue-600 underline"
                                href={target.remote_permalink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View published post
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={statusBadgeClass(target.status)}
                            >
                              {target.status}
                            </Badge>
                            {target.status === "FAILED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retryingTargetId === target.id}
                                onClick={() => retryTarget(target.id)}
                              >
                                {retryingTargetId === target.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Retry"
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl cursor-pointer"
                    disabled={savingPostId === selectedPost.id}
                    onClick={() => saveDraft(selectedPost.id)}
                  >
                    {savingPostId === selectedPost.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save Draft
                  </Button>
                  <Button
                    className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                    disabled={publishingPostId === selectedPost.id}
                    onClick={() => publishPost(selectedPost.id)}
                  >
                    {publishingPostId === selectedPost.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Publish to connected channels
                  </Button>
                </div>

                {failedTargets.length > 0 &&
                  selectedPost.status === "FAILED" && (
                    <p className="text-xs text-muted-foreground">
                      This post has {failedTargets.length} failed channel
                      {failedTargets.length > 1 ? "s" : ""}. Fix the issue and
                      retry.
                    </p>
                  )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <CreateOrganicPostDialog
        open={createDialogOpen}
        businessSlug={props.businessSlug}
        onOpenChange={setCreateDialogOpen}
        onCreated={(postId) => {
          router.refresh();
          setSelectedPostId(postId);
        }}
      />
    </>
  );
}
