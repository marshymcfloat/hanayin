"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSocialPostDraftAction,
  generateSocialPostImageAction,
  publishSocialPostAction,
  regenerateSocialPostCaptionAction,
  retrySocialPostTargetAction,
  updateSocialPostDraftAction,
} from "@/lib/server actions/social";
import { uploadImageAction } from "@/lib/server actions/upload";
import {
  DiscountType,
  SocialPlatform,
  SocialPostStatus,
  SocialTargetStatus,
} from "@/prisma/generated/prisma/enums";
import { ImagePlus, Loader2, Megaphone, Send, Trash2 } from "lucide-react";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  SOCIAL_IMAGE_PROFILE_OPTIONS,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";
import {
  buildDefaultOverlayDraftFromPost,
  sanitizeOverlayDraft,
  SOCIAL_IMAGE_CARD_SIZE_MAX,
  SOCIAL_IMAGE_CARD_SIZE_MIN,
  SOCIAL_IMAGE_OVERLAY_LAYOUTS,
  SOCIAL_IMAGE_OVERLAY_THEMES,
  type SocialImageOverlayDraft,
} from "@/lib/services/social/image-overlay";
import {
  canvasToFile,
  loadImage,
  renderComposedCanvas,
  SOCIAL_IMAGE_LOGO_SIZE_DEFAULT,
  SOCIAL_IMAGE_LOGO_SIZE_MAX,
  SOCIAL_IMAGE_LOGO_SIZE_MIN,
  type SocialImageLogoOverlay,
} from "./image-composer";
import { SocialImageComposerPreview } from "./SocialImageComposerPreview";
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

type ComposerState = {
  includeTextOverlay: boolean;
  includeLogoOverlay: boolean;
  logoOverlay: SocialImageLogoOverlay;
};

function toComposerState(hasBusinessLogo: boolean): ComposerState {
  return {
    includeTextOverlay: false,
    includeLogoOverlay: hasBusinessLogo,
    logoOverlay: {
      xPercent: 4,
      yPercent: 4,
      sizePercent: SOCIAL_IMAGE_LOGO_SIZE_DEFAULT,
    },
  };
}

function toOverlayDraftState(post: SocialPostView, businessName: string) {
  if (post.sale_event) {
    return buildDefaultOverlayDraftFromPost({
      businessName,
      title: post.sale_event.title,
      saleDescription: post.sale_event.description,
      discountType: post.sale_event.discount_type,
      discountValue: post.sale_event.discount_value,
      startDate: new Date(post.sale_event.start_date),
      endDate: new Date(post.sale_event.end_date),
    });
  }

  return sanitizeOverlayDraft({
    businessName,
    discountLine: "",
    titleLine: post.title,
    dateLine: "",
    ctaLine: "Book now on ServiceFlow",
    supportLine: post.caption_final || post.caption_draft || "Limited-time offer",
  });
}

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
  const [applyingOverlayPostId, setApplyingOverlayPostId] = useState<
    string | null
  >(null);
  const [overlayPreviewUrlByPostId, setOverlayPreviewUrlByPostId] = useState<
    Record<string, string>
  >({});
  const [overlayPreviewErrorByPostId, setOverlayPreviewErrorByPostId] =
    useState<Record<string, string>>({});
  const [overlayRenderPostId, setOverlayRenderPostId] = useState<string | null>(
    null,
  );
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
  const [overlayDrafts, setOverlayDrafts] = useState<
    Record<string, SocialImageOverlayDraft>
  >(() =>
    Object.fromEntries(
      props.initialPosts.map((post) => [
        post.id,
        toOverlayDraftState(post, props.businessName),
      ]),
    ),
  );
  const [composerByPostId, setComposerByPostId] = useState<
    Record<string, ComposerState>
  >(() =>
    Object.fromEntries(
      props.initialPosts.map((post) => [
        post.id,
        toComposerState(Boolean(props.businessImageUrl)),
      ]),
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
    setOverlayDrafts((previous) =>
      Object.fromEntries(
        posts.map((post) => [
          post.id,
          previous[post.id] || toOverlayDraftState(post, props.businessName),
        ]),
      ),
    );
  }, [posts, props.businessName]);

  useEffect(() => {
    setComposerByPostId((previous) =>
      Object.fromEntries(
        posts.map((post) => [
          post.id,
          previous[post.id] || toComposerState(Boolean(props.businessImageUrl)),
        ]),
      ),
    );
  }, [posts, props.businessImageUrl]);

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
  const selectedOverlayDraft = selectedPost
    ? overlayDrafts[selectedPost.id]
    : null;
  const selectedComposer = selectedPost
    ? composerByPostId[selectedPost.id] || toComposerState(Boolean(props.businessImageUrl))
    : null;
  const selectedOverlayPreviewUrl = selectedPost
    ? overlayPreviewUrlByPostId[selectedPost.id]
    : "";
  const selectedOverlayPreviewError = selectedPost
    ? overlayPreviewErrorByPostId[selectedPost.id]
    : "";

  useEffect(() => {
    if (!selectedPost) {
      return;
    }

    const draft = drafts[selectedPost.id];
    const overlay = overlayDrafts[selectedPost.id];
    const composer =
      composerByPostId[selectedPost.id] ||
      toComposerState(Boolean(props.businessImageUrl));
    const backgroundUrl = draft?.mediaUrl?.trim();
    const shouldRenderTextOverlay = composer.includeTextOverlay && Boolean(overlay);
    const shouldRenderLogoOverlay =
      composer.includeLogoOverlay && Boolean(props.businessImageUrl?.trim());
    const hasRenderableOverlay = shouldRenderTextOverlay || shouldRenderLogoOverlay;

    if (!draft || !backgroundUrl || !hasRenderableOverlay) {
      setOverlayPreviewUrlByPostId((previous) => {
        if (!(selectedPost.id in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[selectedPost.id];
        return next;
      });
      setOverlayPreviewErrorByPostId((previous) => {
        if (!(selectedPost.id in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[selectedPost.id];
        return next;
      });
      return;
    }

    let cancelled = false;
    setOverlayRenderPostId(selectedPost.id);
    setOverlayPreviewErrorByPostId((previous) => ({
      ...previous,
      [selectedPost.id]: "",
    }));

    const renderPreview = async () => {
      try {
        const image = await loadImage(backgroundUrl);
        if (cancelled) {
          return;
        }

        let logoImage: HTMLImageElement | null = null;
        if (shouldRenderLogoOverlay && props.businessImageUrl?.trim()) {
          try {
            logoImage = await loadImage(
              props.businessImageUrl.trim(),
              "Unable to load business logo for manual overlay.",
            );
          } catch {
            logoImage = null;
          }
        }

        const sourceWidth = "naturalWidth" in image ? image.naturalWidth : 1024;
        const sourceHeight = "naturalHeight" in image ? image.naturalHeight : 1536;
        const canvas = renderComposedCanvas(
          image,
          sourceWidth || 1024,
          sourceHeight || 1536,
          shouldRenderTextOverlay ? overlay : null,
          {
            logoImage,
            logoOverlay: shouldRenderLogoOverlay ? composer.logoOverlay : null,
          },
        );
        const previewUrl = canvas.toDataURL("image/png");
        if (cancelled) {
          return;
        }
        setOverlayPreviewUrlByPostId((previous) => ({
          ...previous,
          [selectedPost.id]: previewUrl,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setOverlayPreviewErrorByPostId((previous) => ({
          ...previous,
          [selectedPost.id]:
            error instanceof Error
              ? error.message
              : "Unable to render overlay preview.",
        }));
      } finally {
        if (!cancelled) {
          setOverlayRenderPostId((current) =>
            current === selectedPost.id ? null : current,
          );
        }
      }
    };

    void renderPreview();

    return () => {
      cancelled = true;
    };
  }, [
    selectedPost,
    drafts,
    overlayDrafts,
    composerByPostId,
    props.businessImageUrl,
  ]);

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

  const updateOverlayDraft = (
    postId: string,
    changes: Partial<SocialImageOverlayDraft>,
  ) => {
    const post = posts.find((entry) => entry.id === postId);
    if (!post) {
      return;
    }

    setOverlayDrafts((previous) => {
      const fallback = previous[postId] || toOverlayDraftState(post, props.businessName);
      return {
        ...previous,
        [postId]: sanitizeOverlayDraft({ ...fallback, ...changes }, fallback),
      };
    });
  };

  const updateComposerState = (postId: string, changes: Partial<ComposerState>) => {
    setComposerByPostId((previous) => {
      const fallback = previous[postId] || toComposerState(Boolean(props.businessImageUrl));
      return {
        ...previous,
        [postId]: {
          ...fallback,
          ...changes,
          logoOverlay: {
            ...fallback.logoOverlay,
            ...(changes.logoOverlay || {}),
          },
        },
      };
    });
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
      setComposerByPostId((previous) => {
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
      toast.success("Image generated and attached to this draft.");
    } catch {
      toast.error("Unexpected error while generating image.");
    } finally {
      setGeneratingImagePostId(null);
    }
  };

  const applyOverlay = async (postId: string) => {
    const draft = drafts[postId];
    const overlay = overlayDrafts[postId];
    const composer = composerByPostId[postId] || toComposerState(Boolean(props.businessImageUrl));
    const backgroundUrl = draft?.mediaUrl?.trim();
    const includeTextOverlay = composer.includeTextOverlay;
    const includeLogoOverlay =
      composer.includeLogoOverlay && Boolean(props.businessImageUrl?.trim());

    if (!draft || !backgroundUrl) {
      toast.error("Generate an image first before applying the overlay.");
      return;
    }

    if (!includeTextOverlay && !includeLogoOverlay) {
      toast.error("Enable text overlay or logo overlay before applying composition.");
      return;
    }

    if (includeTextOverlay && !overlay) {
      toast.error("Text overlay data is unavailable for this post.");
      return;
    }

    setApplyingOverlayPostId(postId);
    try {
      const image = await loadImage(backgroundUrl);
      let logoImage: HTMLImageElement | null = null;
      if (includeLogoOverlay && props.businessImageUrl?.trim()) {
        logoImage = await loadImage(
          props.businessImageUrl.trim(),
          "Unable to load business logo for manual overlay.",
        );
      }

      const sourceWidth = image.naturalWidth || 1024;
      const sourceHeight = image.naturalHeight || 1536;
      const canvas = renderComposedCanvas(
        image,
        sourceWidth,
        sourceHeight,
        includeTextOverlay ? overlay : null,
        {
          logoImage,
          logoOverlay: includeLogoOverlay ? composer.logoOverlay : null,
        },
      );
      const file = await canvasToFile(
        canvas,
        `${props.businessSlug}-social-${postId}.png`,
      );
      const formData = new FormData();
      formData.set("file", file);

      const uploadedUrl = await uploadImageAction(formData);
      updateDraft(postId, { mediaUrl: uploadedUrl });
      toast.success("Composition applied and uploaded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to apply overlay composition.",
      );
    } finally {
      setApplyingOverlayPostId(null);
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
              Review, edit, and publish posts to connected channels
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (posts.length === 0) {
    return (
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
              <p className="text-sm text-muted-foreground max-w-sm">
                Create a sale event with social draft enabled to start publishing.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedPost) {
    return null;
  }

  const draft = drafts[selectedPost.id] || toDraftState(selectedPost);
  const composer = selectedComposer || toComposerState(Boolean(props.businessImageUrl));
  const failedTargets = selectedPost.targets.filter(
    (target) => target.status === "FAILED",
  );
  const publishError = publishErrors[selectedPost.id];
  const hasBusinessLogo = Boolean(props.businessImageUrl?.trim());
  const canApplyComposition =
    Boolean(draft.mediaUrl) &&
    (composer.includeTextOverlay || (composer.includeLogoOverlay && hasBusinessLogo));

  return (
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
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
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
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
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
                  <span className="text-xs opacity-80">{post.status}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Card key={selectedPost.id} className="rounded-2xl border-border shadow-sm">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Media URL
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg cursor-pointer"
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Image Style
                </p>
                <select
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                <p className="text-xs text-muted-foreground">
                  {
                    SOCIAL_IMAGE_PROFILE_OPTIONS.find(
                      (option) => option.value === draft.imageProfile,
                    )?.description
                  }
                </p>
              </div>
            </div>
          </div>

          {selectedOverlayDraft ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Final Composition
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyOverlay(selectedPost.id)}
                  disabled={applyingOverlayPostId === selectedPost.id || !canApplyComposition}
                >
                  {applyingOverlayPostId === selectedPost.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Apply Composition"
                  )}
                </Button>
              </div>

              <p className="text-[11px] text-zinc-500">
                Text overlay is optional and starts off. Keep it off if the AI image already has
                good centered text.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-foreground/70">
                    Text Card Overlay
                  </span>
                  <Switch
                    checked={composer.includeTextOverlay}
                    onCheckedChange={(checked) =>
                      updateComposerState(selectedPost.id, {
                        includeTextOverlay: Boolean(checked),
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-foreground/70">
                    Business Logo Overlay
                  </span>
                  <Switch
                    checked={composer.includeLogoOverlay && hasBusinessLogo}
                    onCheckedChange={(checked) =>
                      updateComposerState(selectedPost.id, {
                        includeLogoOverlay: Boolean(checked),
                      })
                    }
                    disabled={!hasBusinessLogo}
                  />
                </label>
              </div>

              {composer.includeLogoOverlay ? (
                hasBusinessLogo ? (
                  <div className="grid gap-3 rounded-xl border border-border bg-background p-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Logo Size ({Math.round(composer.logoOverlay.sizePercent || 0)}%)
                      </p>
                      <Input
                        type="range"
                        min={SOCIAL_IMAGE_LOGO_SIZE_MIN}
                        max={SOCIAL_IMAGE_LOGO_SIZE_MAX}
                        value={Math.round(
                          composer.logoOverlay.sizePercent || SOCIAL_IMAGE_LOGO_SIZE_DEFAULT,
                        )}
                        onChange={(event) =>
                          updateComposerState(selectedPost.id, {
                            logoOverlay: {
                              ...composer.logoOverlay,
                              sizePercent: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Logo X ({Math.round(composer.logoOverlay.xPercent || 0)}%)
                        </p>
                        <Input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(composer.logoOverlay.xPercent || 0)}
                          onChange={(event) =>
                            updateComposerState(selectedPost.id, {
                              logoOverlay: {
                                ...composer.logoOverlay,
                                xPercent: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Logo Y ({Math.round(composer.logoOverlay.yPercent || 0)}%)
                        </p>
                        <Input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(composer.logoOverlay.yPercent || 0)}
                          onChange={(event) =>
                            updateComposerState(selectedPost.id, {
                              logoOverlay: {
                                ...composer.logoOverlay,
                                yPercent: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Upload a business image/logo in Business Settings to enable manual logo
                    overlay.
                  </p>
                )
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                {composer.includeTextOverlay ? (
                  <div className="grid gap-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Theme
                        </p>
                        <select
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={selectedOverlayDraft.theme}
                          onChange={(event) =>
                            updateOverlayDraft(selectedPost.id, {
                              theme: event.target.value as SocialImageOverlayDraft["theme"],
                            })
                          }
                        >
                          {SOCIAL_IMAGE_OVERLAY_THEMES.map((theme) => (
                            <option key={theme} value={theme}>
                              {theme}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Layout
                        </p>
                        <select
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={selectedOverlayDraft.layoutStyle || "soft-editorial"}
                          onChange={(event) =>
                            updateOverlayDraft(selectedPost.id, {
                              layoutStyle:
                                event.target.value as SocialImageOverlayDraft["layoutStyle"],
                            })
                          }
                        >
                          {SOCIAL_IMAGE_OVERLAY_LAYOUTS.map((layoutStyle) => (
                            <option key={layoutStyle} value={layoutStyle}>
                              {layoutStyle}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Card Size ({Math.round(selectedOverlayDraft.cardSizePercent || 100)}%)
                      </p>
                      <Input
                        type="range"
                        min={SOCIAL_IMAGE_CARD_SIZE_MIN}
                        max={SOCIAL_IMAGE_CARD_SIZE_MAX}
                        value={Math.round(selectedOverlayDraft.cardSizePercent || 100)}
                        onChange={(event) =>
                          updateOverlayDraft(selectedPost.id, {
                            cardSizePercent: Number(event.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Business
                        </p>
                        <Input
                          value={selectedOverlayDraft.businessName}
                          onChange={(event) =>
                            updateOverlayDraft(selectedPost.id, {
                              businessName: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Discount
                        </p>
                        <Input
                          value={selectedOverlayDraft.discountLine}
                          onChange={(event) =>
                            updateOverlayDraft(selectedPost.id, {
                              discountLine: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Title
                      </p>
                      <Input
                        value={selectedOverlayDraft.titleLine}
                        onChange={(event) =>
                          updateOverlayDraft(selectedPost.id, {
                            titleLine: event.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Dates
                        </p>
                        <Input
                          value={selectedOverlayDraft.dateLine}
                          onChange={(event) =>
                            updateOverlayDraft(selectedPost.id, {
                              dateLine: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          CTA
                        </p>
                        <Input
                          value={selectedOverlayDraft.ctaLine}
                          onChange={(event) =>
                            updateOverlayDraft(selectedPost.id, {
                              ctaLine: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Support Line
                      </p>
                      <Input
                        value={selectedOverlayDraft.supportLine}
                        onChange={(event) =>
                          updateOverlayDraft(selectedPost.id, {
                            supportLine: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Text overlay controls are hidden while text card overlay is turned off.
                  </div>
                )}

                <SocialImageComposerPreview
                  previewUrl={selectedOverlayPreviewUrl || null}
                  backgroundUrl={draft.mediaUrl || null}
                  isRendering={overlayRenderPostId === selectedPost.id}
                  errorMessage={selectedOverlayPreviewError || null}
                  overlayDraft={composer.includeTextOverlay ? selectedOverlayDraft : null}
                  onCardPositionChange={
                    composer.includeTextOverlay
                      ? (position) => updateOverlayDraft(selectedPost.id, position)
                      : undefined
                  }
                />
              </div>
            </div>
          ) : null}

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
              <p className="text-xs text-muted-foreground">
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
              {selectedPost.targets.map((target) => (
                <div
                  key={target.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
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

          {failedTargets.length > 0 && selectedPost.status === "FAILED" && (
            <p className="text-xs text-muted-foreground">
              This post has {failedTargets.length} failed channel
              {failedTargets.length > 1 ? "s" : ""}. Fix the issue and retry.
            </p>
          )}
        </CardContent>
      </Card>
      </div>
      </div>
    </div>
  );
}
