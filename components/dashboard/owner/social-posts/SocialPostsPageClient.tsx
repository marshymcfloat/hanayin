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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteSocialPostDraftAction,
  generateSocialPostImageAction,
  publishSocialPostAction,
  regenerateSocialPostCaptionAction,
  retrySocialPostTargetAction,
  updateSocialPostDraftAction,
} from "@/lib/server actions/social";
import {
  SocialPlatform,
  SocialPostStatus,
  SocialTargetStatus,
} from "@/prisma/generated/prisma/enums";
import { ImagePlus, Loader2, Megaphone, Trash2 } from "lucide-react";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  SOCIAL_IMAGE_PROFILE_OPTIONS,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";
import { GrowthFlowChecklist } from "../growth/GrowthFlowChecklist";
import type { GrowthFlowContext } from "../growth/types";

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
  sale_event: { title: string } | null;
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
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
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

export function SocialPostsPageClient(props: {
  businessSlug: string;
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
  const [draftToDeleteId, setDraftToDeleteId] = useState<string | null>(null);
  const [regeneratingCaptionPostId, setRegeneratingCaptionPostId] = useState<
    string | null
  >(null);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>(
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
  const draftToDelete = useMemo(
    () => posts.find((post) => post.id === draftToDeleteId) || null,
    [posts, draftToDeleteId],
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
      setDraftToDeleteId(null);
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
      toast.success("Image generated and attached to this draft.");
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

  if (posts.length === 0) {
    return (
      <div className="space-y-6">
        <GrowthFlowChecklist
          businessSlug={props.businessSlug}
          flowContext={props.flowContext}
          activeStep={3}
          completedSteps={[1, ...(hasStep2Signal ? ([2] as const) : [])]}
          nextAction={nextActionText}
        />

        <Card className="rounded-3xl border-zinc-200/70">
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <Megaphone className="h-6 w-6 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">
              No social drafts yet
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Create a sale event with social draft enabled to start publishing.
            </p>
          </CardContent>
        </Card>
      </div>
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
  const hasConnectedChannels = selectedPost.targets.length > 0;

  return (
    <div className="space-y-6">
      <GrowthFlowChecklist
        businessSlug={props.businessSlug}
        flowContext={props.flowContext}
        activeStep={3}
        completedSteps={[1, ...(hasStep2Signal ? ([2] as const) : [])]}
        nextAction={nextActionText}
      />

      {actionNeededPosts.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-900">
                Action needed now
              </h2>
              <p className="text-xs text-zinc-500">
                Ready and failed posts should be reviewed first.
              </p>
            </div>
            <Badge variant="outline" className="bg-zinc-100 text-zinc-700">
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
                <button
                  key={post.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPostId(post.id)}
                  className={`min-w-[240px] rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-sm font-semibold ${
                        isSelected ? "text-white" : "text-zinc-900"
                      }`}
                    >
                      {postDraft.title || post.title}
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        isSelected
                          ? "border-white/30 bg-white/10 text-white"
                          : statusBadgeClass(post.status)
                      }
                    >
                      {post.status}
                    </Badge>
                  </div>
                  <p
                    className={`mt-1 text-xs ${
                      isSelected ? "text-zinc-200" : "text-zinc-500"
                    }`}
                  >
                    {captionPreview}
                  </p>
                  <p
                    className={`mt-2 text-xs ${
                      isSelected ? "text-zinc-300" : "text-zinc-400"
                    }`}
                  >
                    {post.sale_event ? post.sale_event.title : "Manual social draft"}
                    {dateLabel ? ` | ${dateLabel}` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {draftPosts.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-900">
                Saved Drafts
              </h2>
              <p className="text-xs text-zinc-500">
                Click a draft to open it in the editor.
              </p>
            </div>
            <Badge variant="outline" className="bg-zinc-100 text-zinc-700">
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
                <div key={post.id} className="relative min-w-[240px]">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedPostId(post.id)}
                    disabled={deletingPostId === post.id}
                    className={`w-full rounded-2xl border px-3 py-2 pr-11 text-left transition sm:px-4 sm:py-3 sm:pr-20 ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-sm font-semibold ${
                          isSelected ? "text-white" : "text-zinc-900"
                        }`}
                      >
                        {postDraft.title || post.title}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          isSelected
                            ? "border-white/30 bg-white/10 text-white"
                            : statusBadgeClass(post.status)
                        }
                      >
                        {post.status}
                      </Badge>
                    </div>
                    <p
                      className={`mt-1 h-8 overflow-hidden text-xs leading-4 sm:h-auto sm:overflow-visible ${
                        isSelected ? "text-zinc-200" : "text-zinc-500"
                      }`}
                    >
                      {captionPreview}
                    </p>
                    <p
                      className={`mt-1.5 truncate text-xs ${
                        isSelected ? "text-zinc-300" : "text-zinc-400"
                      }`}
                    >
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
                      setDraftToDeleteId(post.id);
                    }}
                    disabled={deletingPostId === post.id}
                    className={`absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition sm:h-7 sm:w-7 ${
                      isSelected
                        ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
                        : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
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

      {otherPosts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  <span className="mr-2 inline-block max-w-[220px] truncate align-bottom">
                    {post.title}
                  </span>
                  <span className="text-xs opacity-80">{post.status}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Card key={selectedPost.id} className="rounded-3xl border-zinc-200/70">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-zinc-900">
              {selectedPost.title}
            </CardTitle>
            <Badge
              variant="outline"
              className={statusBadgeClass(selectedPost.status)}
            >
              {selectedPost.status}
            </Badge>
          </div>
          <p className="text-sm text-zinc-500">
            {selectedPost.sale_event
              ? `From sale event: ${selectedPost.sale_event.title}`
              : "Manual social draft"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedPost.targets.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No connected channels on this draft. Connect Facebook/Instagram or
              choose channels first.{" "}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Post Title
              </p>
              <Input
                value={draft.title}
                onChange={(event) =>
                  updateDraft(selectedPost.id, { title: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Media URL
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateImage(selectedPost.id)}
                  disabled={generatingImagePostId === selectedPost.id}
                >
                  {generatingImagePostId === selectedPost.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="mr-2 h-4 w-4" />
                      Generate Image
                    </>
                  )}
                </Button>
              </div>
              <Input
                placeholder="https://..."
                value={draft.mediaUrl}
                onChange={(event) =>
                  updateDraft(selectedPost.id, { mediaUrl: event.target.value })
                }
              />
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Image Style
                </p>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.imageProfile}
                  onChange={(event) =>
                    updateDraft(selectedPost.id, {
                      imageProfile: event.target.value as SocialImageProfile,
                    })
                  }
                >
                  {SOCIAL_IMAGE_PROFILE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">
                  {
                    SOCIAL_IMAGE_PROFILE_OPTIONS.find(
                      (option) => option.value === draft.imageProfile,
                    )?.description
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Caption
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => regenerateCaption(selectedPost.id)}
                disabled={
                  regeneratingCaptionPostId === selectedPost.id ||
                  !selectedPost.sale_event
                }
              >
                {regeneratingCaptionPostId === selectedPost.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Regenerate Caption"
                )}
              </Button>
            </div>
            {!selectedPost.sale_event ? (
              <p className="text-xs text-zinc-500">
                Caption regeneration is available for sale-event drafts.
              </p>
            ) : null}
            <Textarea
              className="min-h-[140px]"
              value={draft.caption}
              onChange={(event) =>
                updateDraft(selectedPost.id, { caption: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Hashtags (comma separated)
            </p>
            <Textarea
              className="min-h-[72px] sm:min-h-[40px]"
              value={draft.hashtagsCsv}
              onChange={(event) =>
                updateDraft(selectedPost.id, {
                  hashtagsCsv: event.target.value,
                })
              }
            />
          </div>

          {selectedPost.last_error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {selectedPost.last_error}
            </p>
          )}

          <div className="rounded-2xl border border-zinc-200 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Channel Status
            </p>
            {selectedPost.targets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3">
                <p className="text-sm font-medium text-zinc-700">
                  No connected channels for this draft yet.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Connect Facebook/Instagram in Business settings, then return to publish.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedPost.targets.map((target) => (
                  <div
                    key={target.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {platformLabel(target.social_connection.platform)} |{" "}
                        {target.social_connection.display_name}
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
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={savingPostId === selectedPost.id}
              onClick={() => saveDraft(selectedPost.id)}
            >
              {savingPostId === selectedPost.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save Draft"
              )}
            </Button>
            <Button
              disabled={
                publishingPostId === selectedPost.id || !hasConnectedChannels
              }
              title={
                !hasConnectedChannels
                  ? "Connect a channel first to publish."
                  : undefined
              }
              onClick={() => publishPost(selectedPost.id)}
            >
              {publishingPostId === selectedPost.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Publish to connected channels"
              )}
            </Button>
          </div>

          {failedTargets.length > 0 && selectedPost.status === "FAILED" && (
            <p className="text-xs text-zinc-500">
              This post has {failedTargets.length} failed channel
              {failedTargets.length > 1 ? "s" : ""}. Fix the issue and retry.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!draftToDelete}
        onOpenChange={(open) => {
          if (!open && !deletingPostId) {
            setDraftToDeleteId(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Social Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete
              {" "}
              <span className="font-medium text-zinc-900">
                {draftToDelete?.title || "this draft"}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={!!deletingPostId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!draftToDelete || !!deletingPostId}
              onClick={() => {
                if (!draftToDelete) return;
                void deleteDraft(draftToDelete.id);
              }}
            >
              {deletingPostId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
