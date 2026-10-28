"use client";
/* eslint-disable @next/next/no-img-element */

import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import { toast } from "sonner";
import { OwnerSocialPostsStudy } from "@/components/dashboard/design-study/OwnerSocialPostsStudy";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createOrganicSocialPostAction,
  deleteSocialPostDraftAction,
  publishSocialPostAction,
  retrySocialPostTargetAction,
  updateSocialPostDraftAction,
} from "@/features/social/actions/social";
import type {
  OwnerSocialPostPreviewPost,
  OwnerSocialPostsPreviewData,
} from "@/features/social/types/owner-social-post-preview";

export type SocialPostDraft = {
  title: string;
  caption: string;
  hashtags: string;
  mediaUrl: string;
};
type Draft = SocialPostDraft;

export type Category =
  | "TIPS_EDUCATION"
  | "BEHIND_THE_SCENES"
  | "SEASONAL_GREETING"
  | "TEAM_SPOTLIGHT"
  | "SERVICE_SHOWCASE"
  | "GENERAL";

const categories: Array<{ value: Category; label: string }> = [
  { value: "GENERAL", label: "General" },
  { value: "SERVICE_SHOWCASE", label: "Service showcase" },
  { value: "TIPS_EDUCATION", label: "Tips & education" },
  { value: "BEHIND_THE_SCENES", label: "Behind the scenes" },
  { value: "SEASONAL_GREETING", label: "Seasonal greeting" },
  { value: "TEAM_SPOTLIGHT", label: "Team spotlight" },
];

function draftFor(post: OwnerSocialPostPreviewPost): Draft {
  return {
    title: post.title,
    caption: post.caption,
    hashtags: post.hashtags.join(", "),
    mediaUrl: post.mediaUrl ?? "",
  };
}

function normalizeHashtags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.startsWith("#") ? item : `#${item}`)),
    ),
  );
}

function statusClass(status: string) {
  if (status === "PUBLISHED") return "bg-[#EAF7E1] text-[#315E18]";
  if (status === "FAILED") return "bg-[#FFF0F0] text-[#B33A42]";
  if (status === "PUBLISHING" || status === "QUEUED")
    return "bg-[#FFF5DD] text-[#8A5A00]";
  if (status === "READY") return "bg-[#EAF1FF] text-[#2D5AA6]";
  return "bg-[#F0F1EE] text-[#696C67]";
}

function platformLabel(platform: string) {
  return platform === "INSTAGRAM_BUSINESS" ? "Instagram" : "Facebook";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function OwnerSocialPostsPreview({
  businessSlug,
  data,
  error,
  onChanged,
  redesign = false,
  fontClassName = "",
}: {
  businessSlug: string;
  data: OwnerSocialPostsPreviewData | null;
  error?: string | null;
  onChanged?: (posts?: OwnerSocialPostPreviewPost[]) => void;
  redesign?: boolean;
  fontClassName?: string;
}) {
  const dirtyDrafts = useRef(new Set<string>());
  const mutationLock = useRef(false);
  const [posts, setPosts] = useState<OwnerSocialPostPreviewPost[]>(
    data?.posts ?? [],
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(
    data?.posts[0]?.id ?? null,
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      (data?.posts ?? []).map((post) => [post.id, draftFor(post)]),
    ),
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(error ? { tone: "error", text: error } : null);
  const [pending, setPending] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<OwnerSocialPostPreviewPost | null>(null);
  const [createTopic, setCreateTopic] = useState("");
  const [createCategory, setCreateCategory] = useState<Category>("GENERAL");

  useEffect(() => {
    if (!data || pending) return;
    setPosts(data.posts);
    setDrafts((current) =>
      Object.fromEntries(
        data.posts.map((post) => [
          post.id,
          dirtyDrafts.current.has(post.id)
            ? (current[post.id] ?? draftFor(post))
            : draftFor(post),
        ]),
      ),
    );
    setSelectedPostId((current) =>
      current && data.posts.some((post) => post.id === current)
        ? current
        : (data.posts[0]?.id ?? null),
    );
  }, [data, pending]);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId],
  );
  const connectedCount =
    data?.connections.filter((connection) => connection.status === "CONNECTED")
      .length ?? 0;
  const draft = selectedPost
    ? (drafts[selectedPost.id] ?? draftFor(selectedPost))
    : null;
  const summaryCards: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
  }> = data
    ? [
        {
          label: "Total posts",
          value: data.metrics.totalPosts,
          icon: Megaphone,
        },
        {
          label: "Needs review",
          value: data.metrics.ready + data.metrics.failed,
          icon: AlertCircle,
        },
        { label: "Publishing", value: data.metrics.publishing, icon: Send },
        { label: "Published", value: data.metrics.published, icon: Check },
      ]
    : [];

  function showNotice(tone: "success" | "error", text: string) {
    if (redesign) toast[tone](text);
    else setNotice({ tone, text });
  }

  function updateDraft(field: keyof Draft, value: string) {
    if (!selectedPost || pending?.startsWith("save:")) return;
    dirtyDrafts.current.add(selectedPost.id);
    setDrafts((current) => ({
      ...current,
      [selectedPost.id]: {
        ...(current[selectedPost.id] ?? draftFor(selectedPost)),
        [field]: value,
      },
    }));
  }

  async function saveDraft() {
    if (!selectedPost || !draft || pending || mutationLock.current) return;
    mutationLock.current = true;
    const previousPosts = posts;
    const hashtags = normalizeHashtags(draft.hashtags);
    const nextPost: OwnerSocialPostPreviewPost = {
      ...selectedPost,
      title: draft.title.trim(),
      caption: draft.caption.trim(),
      hashtags,
      mediaUrl: draft.mediaUrl.trim() || null,
      status: draft.caption.trim() ? "READY" : "DRAFT",
      lastError: null,
    };

    const nextPosts = posts.map((post) =>
      post.id === selectedPost.id ? nextPost : post,
    );
    setPosts(nextPosts);
    setPending(`save:${selectedPost.id}`);
    setNotice(null);
    try {
      const result = await updateSocialPostDraftAction({
        businessSlug,
        postId: selectedPost.id,
        title: nextPost.title,
        captionFinal: nextPost.caption,
        hashtags,
        mediaUrl: nextPost.mediaUrl,
      });
      if (!result.success) {
        setPosts(previousPosts);
        showNotice("error", result.error || "Draft could not be saved.");
        return;
      }
      dirtyDrafts.current.delete(selectedPost.id);
      showNotice(
        "success",
        redesign ? "Draft saved." : "Draft saved. The preview will reconcile with the server.",
      );
      onChanged?.(nextPosts);
    } catch {
      setPosts(previousPosts);
      showNotice(
        "error",
        "Draft could not be saved. Your changes were rolled back.",
      );
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || pending || mutationLock.current) return;
    mutationLock.current = true;
    const previousPosts = posts;
    const deletingId = deleteTarget.id;
    const nextPosts = posts.filter((post) => post.id !== deletingId);
    setPosts(nextPosts);
    setSelectedPostId((current) =>
      current === deletingId
        ? (posts.find((post) => post.id !== deletingId)?.id ?? null)
        : current,
    );
    setPending(`delete:${deletingId}`);
    setNotice(null);
    try {
      const result = await deleteSocialPostDraftAction({
        businessSlug,
        postId: deletingId,
      });
      if (!result.success) {
        setPosts(previousPosts);
        setSelectedPostId(deletingId);
        setDeleteTarget(null);
        showNotice("error", result.error || "Draft could not be deleted.");
        return;
      }
      showNotice("success", "Draft deleted.");
      setDeleteTarget(null);
      dirtyDrafts.current.delete(deletingId);
      onChanged?.(nextPosts);
    } catch {
      setPosts(previousPosts);
      setSelectedPostId(deletingId);
      setDeleteTarget(null);
      showNotice("error", "Draft could not be deleted. It was restored.");
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  async function publish() {
    if (!selectedPost || pending || mutationLock.current) return;
    if (dirtyDrafts.current.has(selectedPost.id)) {
      showNotice("error", "Save your draft before publishing.");
      return;
    }
    mutationLock.current = true;
    setPending(`publish:${selectedPost.id}`);
    setNotice(null);
    try {
      const result = await publishSocialPostAction({
        businessSlug,
        postId: selectedPost.id,
      });
      if (!result.success) {
        showNotice("error", result.error || "Publish request was rejected.");
        return;
      }
      showNotice(
        "success",
        "Publish request queued. Status will update from the server.",
      );
      onChanged?.();
    } catch {
      showNotice(
        "error",
        "Publish request failed. No provider success was assumed.",
      );
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  async function retryTarget(targetId: string) {
    if (pending || mutationLock.current) return;
    mutationLock.current = true;
    setPending(`retry:${targetId}`);
    setNotice(null);
    try {
      const result = await retrySocialPostTargetAction({
        businessSlug,
        targetId,
      });
      if (!result.success) {
        showNotice("error", result.error || "Retry was rejected.");
        return;
      }
      showNotice(
        "success",
        "Retry queued. The channel status will reconcile from the server.",
      );
      onChanged?.();
    } catch {
      showNotice("error", "Retry failed. No provider success was assumed.");
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createTopic.trim() || pending || mutationLock.current) return;
    mutationLock.current = true;
    setPending("create");
    setNotice(null);
    try {
      const result = await createOrganicSocialPostAction({
        businessSlug,
        topic: createTopic.trim(),
        category: createCategory,
        generateImageNow: false,
      });
      if (!result.success) {
        showNotice("error", result.error || "Post could not be created.");
        return;
      }
      setCreateOpen(false);
      setCreateTopic("");
      showNotice("success", redesign ? "Draft created. Nothing has been published." : "Post created. Refreshing the backend preview.");
      onChanged?.();
    } catch {
      showNotice("error", "Post could not be created.");
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  if (redesign && data) return <OwnerSocialPostsStudy
    data={data} posts={posts} selectedPost={selectedPost} draft={draft}
    dirty={!!selectedPost && dirtyDrafts.current.has(selectedPost.id)} pending={pending}
    fontClassName={fontClassName} onSelect={setSelectedPostId} onUpdate={updateDraft}
    onSave={() => { void saveDraft(); }} onPublish={() => { void publish(); }} onRetry={id => { void retryTarget(id); }}
    createOpen={createOpen} onCreateOpen={setCreateOpen} createTopic={createTopic} onTopic={setCreateTopic}
    createCategory={createCategory} onCategory={setCreateCategory} categories={categories} onCreate={createPost}
    deleteTarget={deleteTarget} onDelete={setDeleteTarget} onConfirmDelete={() => { void confirmDelete(); }}
  />;

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#F5F6F3] font-[var(--font-body)] text-[#20211F]">
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]">
        <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link
                href={`/owner-dashboard-preview/${businessSlug}`}
                className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
              </Link>
              <p className="text-sm font-semibold text-[#696C67]">
                {data?.business.name ?? "Owner workspace"} · Social workspace
              </p>
              <h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">
                Social posts
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">
                Review real drafts, connected channels, campaign context, and
                delivery states from the backend.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-[#20211F] px-5 text-sm font-bold text-white outline-none hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 lg:self-auto"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New post
            </button>
          </header>

          {notice ? (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={`mt-5 rounded-[14px] px-3 py-2.5 text-sm font-semibold ${notice.tone === "error" ? "bg-[#FFF0F0] text-[#C74248]" : "bg-[#EFF9E8] text-[#315E18]"}`}
            >
              {notice.text}
            </p>
          ) : null}

          {error && !data ? (
            <section
              className="mt-6 rounded-[26px] border border-[#F0C8C8] bg-white p-8 text-center shadow-[0_14px_38px_rgba(32,33,31,0.045)]"
              role="alert"
            >
              <AlertCircle className="mx-auto h-8 w-8 text-[#C74248]" />
              <h2 className="mt-3 font-bold">Social posts are unavailable</h2>
              <p className="mt-1 text-sm text-[#696C67]">{error}</p>
            </section>
          ) : data ? (
            <>
              <section
                className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                aria-label="Social post summary"
              >
                {summaryCards.map(({ label, value, icon: Icon }) => (
                  <article
                    key={label}
                    className="rounded-[22px] border border-white bg-white p-4 shadow-[0_12px_32px_rgba(32,33,31,0.045)]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#EFF9E8] text-[#4D8F24]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#92958F]">
                        Live
                      </span>
                    </div>
                    <p className="mt-4 text-xs font-semibold text-[#696C67]">
                      {label}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold tracking-[-0.05em]">
                      {value}
                    </p>
                  </article>
                ))}
              </section>

              <section
                className={`mt-4 flex flex-col gap-2 rounded-[18px] border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${connectedCount > 0 ? "border-[#DDE8D5] bg-[#F8FCF5]" : "border-[#F0C8C8] bg-[#FFF8F8]"}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${connectedCount > 0 ? "bg-[#72CF35]" : "bg-[#C74248]"}`}
                  />
                  <span className="font-semibold">
                    {connectedCount > 0
                      ? `${connectedCount} connected channel${connectedCount === 1 ? "" : "s"}`
                      : "No connected channels"}
                  </span>
                  <span className="truncate text-[#696C67]">
                    {data.connections
                      .map(
                        (connection) =>
                          `${platformLabel(connection.platform)} · ${connection.displayName}`,
                      )
                      .join("  ·  ") ||
                      "Connect Facebook or Instagram before publishing."}
                  </span>
                </div>
                {connectedCount === 0 ? (
                  <span className="shrink-0 text-xs font-semibold text-[#B33A42]">
                    Publishing disabled
                  </span>
                ) : null}
              </section>

              {data.referenceAssets.length > 0 ? (
                <section
                  className="mt-4 rounded-[18px] border border-white bg-white px-4 py-3 shadow-[0_10px_24px_rgba(32,33,31,0.035)]"
                  aria-label="Reference asset library"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.08em]">
                        Reference library
                      </p>
                      <p className="mt-1 text-xs text-[#81847E]">
                        Backend brand assets available for social creative.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#F5F6F3] px-2 py-1 font-mono text-[10px] font-bold text-[#696C67]">
                      {data.referenceAssets.length}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {data.referenceAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="flex w-20 shrink-0 flex-col gap-1"
                      >
                        <img
                          src={asset.url}
                          alt={asset.alt ?? "Brand reference"}
                          className="h-16 w-20 rounded-[10px] border border-[#E7E9E4] object-cover"
                        />
                        <span className="truncate text-[10px] font-semibold text-[#696C67]">
                          {asset.referenceSubject ?? "Reference"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {posts.length === 0 ? (
                <section className="mt-6 grid min-h-64 place-items-center rounded-[26px] border border-dashed border-[#D9DDD5] bg-white p-8 text-center">
                  <div>
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F6F3] text-[#81847E]">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 font-bold">No social drafts yet</h2>
                    <p className="mt-1 max-w-sm text-sm text-[#696C67]">
                      Create an organic post or generate one from a sale event.
                      The list will stay connected to the backend.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(true)}
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#DDE0D9] px-4 text-sm font-bold text-[#315E18] hover:bg-[#EFF9E8]"
                    >
                      <Plus className="h-4 w-4" /> Create organic post
                    </button>
                  </div>
                </section>
              ) : (
                <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                  <section
                    className="min-w-0 space-y-3"
                    aria-label="Social posts"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-[0.08em]">
                          Post queue
                        </h2>
                        <p className="mt-1 text-xs text-[#81847E]">
                          Select a post to review or edit.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-bold text-[#696C67]">
                        {posts.length}
                      </span>
                    </div>
                    {posts.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        aria-pressed={selectedPostId === post.id}
                        onClick={() => setSelectedPostId(post.id)}
                        className={`w-full min-w-0 rounded-[20px] border p-4 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[#72CF35] ${selectedPostId === post.id ? "border-[#72CF35] bg-[#F8FCF5]" : "border-white bg-white hover:border-[#DDE0D9]"}`}
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold">
                              {post.title || "Untitled post"}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#696C67]">
                              {post.caption || "No caption yet"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${statusClass(post.status)}`}
                          >
                            {post.status}
                          </span>
                        </div>
                        <div className="mt-3 flex min-w-0 items-center justify-between gap-2 text-[11px] text-[#81847E]">
                          <span className="truncate">
                            {post.saleEvent?.title ??
                              post.growth?.anchorLabel ??
                              "Organic post"}
                          </span>
                          <span className="shrink-0">
                            {dateLabel(post.createdAt)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </section>

                  {selectedPost && draft ? (
                    <section
                      className="min-w-0 rounded-[26px] border border-white bg-white p-4 shadow-[0_14px_38px_rgba(32,33,31,0.045)] sm:p-6"
                      aria-label="Post editor"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#81847E]">
                            Reviewing post
                          </p>
                          <h2 className="mt-1 truncate text-xl font-bold tracking-[-0.03em]">
                            {selectedPost.title}
                          </h2>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${statusClass(selectedPost.status)}`}
                        >
                          {selectedPost.status}
                        </span>
                      </div>
                      {selectedPost.saleEvent ? (
                        <div className="mt-4 rounded-[16px] bg-[#F8F4EA] px-3 py-2.5 text-xs text-[#6B5A3D]">
                          <span className="font-bold">Sale event:</span>{" "}
                          {selectedPost.saleEvent.title} ·{" "}
                          {selectedPost.saleEvent.discountType === "PERCENTAGE"
                            ? `${selectedPost.saleEvent.discountValue}% off`
                            : `₱${selectedPost.saleEvent.discountValue} off`}
                        </div>
                      ) : null}
                      {selectedPost.growth ? (
                        <div className="mt-3 rounded-[16px] bg-[#EFF9E8] px-3 py-2.5 text-xs leading-5 text-[#315E18]">
                          <span className="font-bold">Growth context:</span>{" "}
                          {selectedPost.growth.anchorLabel} ·{" "}
                          {selectedPost.growth.opportunityReason}
                        </div>
                      ) : null}
                      <div className="mt-5 grid gap-4">
                        <label className="grid gap-1.5 text-xs font-bold text-[#696C67]">
                          Title
                          <input
                            value={draft.title}
                            onChange={(event) =>
                              updateDraft("title", event.target.value)
                            }
                            disabled={
                              Boolean(pending?.startsWith("save:")) ||
                              selectedPost.status === "PUBLISHED" ||
                              selectedPost.status === "PUBLISHING"
                            }
                            className="min-h-11 rounded-[12px] border border-[#DDE0D9] bg-[#FAFBF8] px-3 text-sm font-normal text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs font-bold text-[#696C67]">
                          Caption
                          <textarea
                            value={draft.caption}
                            onChange={(event) =>
                              updateDraft("caption", event.target.value)
                            }
                            disabled={
                              Boolean(pending?.startsWith("save:")) ||
                              selectedPost.status === "PUBLISHED" ||
                              selectedPost.status === "PUBLISHING"
                            }
                            rows={6}
                            className="resize-y rounded-[12px] border border-[#DDE0D9] bg-[#FAFBF8] px-3 py-2.5 text-sm font-normal leading-6 text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs font-bold text-[#696C67]">
                          Hashtags
                          <span className="text-[11px] font-normal text-[#81847E]">
                            Comma-separated; hashtags are normalized by the
                            backend action.
                          </span>
                          <input
                            value={draft.hashtags}
                            onChange={(event) =>
                              updateDraft("hashtags", event.target.value)
                            }
                            disabled={
                              Boolean(pending?.startsWith("save:")) ||
                              selectedPost.status === "PUBLISHED" ||
                              selectedPost.status === "PUBLISHING"
                            }
                            className="min-h-11 rounded-[12px] border border-[#DDE0D9] bg-[#FAFBF8] px-3 text-sm font-normal text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs font-bold text-[#696C67]">
                          Media URL
                          <span className="text-[11px] font-normal text-[#81847E]">
                            Optional. Provider-specific media is never
                            fabricated in preview.
                          </span>
                          <input
                            value={draft.mediaUrl}
                            onChange={(event) =>
                              updateDraft("mediaUrl", event.target.value)
                            }
                            disabled={
                              Boolean(pending?.startsWith("save:")) ||
                              selectedPost.status === "PUBLISHED" ||
                              selectedPost.status === "PUBLISHING"
                            }
                            className="min-h-11 rounded-[12px] border border-[#DDE0D9] bg-[#FAFBF8] px-3 text-sm font-normal text-[#20211F] outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
                          />
                        </label>
                      </div>
                      {draft.mediaUrl ? (
                        <div className="mt-4 overflow-hidden rounded-[16px] border border-[#E7E9E4] bg-[#FAFBF8]">
                          <div className="flex items-center gap-2 border-b border-[#E7E9E4] px-3 py-2 text-xs font-bold text-[#696C67]">
                            <ImageIcon className="h-3.5 w-3.5" /> Backend media
                            reference
                          </div>
                          <div className="p-2">
                            <img
                              src={draft.mediaUrl}
                              alt="Social post media preview"
                              className="max-h-64 w-full rounded-[12px] object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-5 rounded-[16px] border border-[#E7E9E4] bg-[#FAFBF8] p-3">
                        <p className="text-xs font-bold text-[#696C67]">
                          Delivery targets
                        </p>
                        <div className="mt-2 grid gap-2">
                          {selectedPost.targets.length === 0 ? (
                            <p className="text-xs text-[#B33A42]">
                              No channels selected for this post.
                            </p>
                          ) : (
                            selectedPost.targets.map((target) => (
                              <div
                                key={target.id}
                                className="flex min-w-0 items-center justify-between gap-2 text-xs"
                              >
                                <span className="min-w-0 truncate font-semibold">
                                  {platformLabel(target.connection.platform)} ·{" "}
                                  {target.connection.displayName}
                                  <span className="ml-1 font-normal text-[#81847E]">
                                    ({target.connection.status.toLowerCase()})
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${statusClass(target.status)}`}
                                  >
                                    {target.status}
                                  </span>
                                  {target.status === "FAILED" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void retryTarget(target.id)
                                      }
                                      disabled={pending !== null}
                                      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[#DDE0D9] px-2.5 font-bold text-[#315E18] hover:bg-white disabled:opacity-60"
                                    >
                                      {pending === `retry:${target.id}` ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3" />
                                      )}{" "}
                                      Retry
                                    </button>
                                  ) : null}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(selectedPost)}
                          disabled={
                            pending !== null ||
                            selectedPost.status === "PUBLISHED" ||
                            selectedPost.status === "PUBLISHING"
                          }
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#F0C8C8] px-4 text-sm font-bold text-[#B33A42] hover:bg-[#FFF8F8] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" /> Delete draft
                        </button>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => void saveDraft()}
                            disabled={
                              pending !== null ||
                              selectedPost.status === "PUBLISHED" ||
                              selectedPost.status === "PUBLISHING"
                            }
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#DDE0D9] px-4 text-sm font-bold text-[#20211F] hover:bg-[#F5F6F3] disabled:opacity-50"
                          >
                            {pending === `save:${selectedPost.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}{" "}
                            Save draft
                          </button>
                          <button
                            type="button"
                            onClick={() => void publish()}
                            disabled={
                              pending !== null ||
                              connectedCount === 0 ||
                              selectedPost.targets.length === 0 ||
                              dirtyDrafts.current.has(selectedPost.id) ||
                              selectedPost.status === "PUBLISHED" ||
                              selectedPost.status === "PUBLISHING"
                            }
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#20211F] px-4 text-sm font-bold text-white hover:bg-[#343633] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {pending === `publish:${selectedPost.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}{" "}
                            Publish request
                          </button>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[24px] border-[#E1E3DE] bg-white sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create organic post</DialogTitle>
            <DialogDescription>
              Create a real draft through the existing social action. Provider
              delivery is not started here.
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-social-post"
            onSubmit={createPost}
            className="grid gap-4 py-2"
          >
            <label className="grid gap-1.5 text-sm font-semibold">
              Topic
              <input
                autoFocus
                value={createTopic}
                onChange={(event) => setCreateTopic(event.target.value)}
                placeholder="e.g. Sunday reset rituals"
                className="min-h-11 rounded-[12px] border border-[#DDE0D9] px-3 font-normal outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              Category
              <select
                value={createCategory}
                onChange={(event) =>
                  setCreateCategory(event.target.value as Category)
                }
                className="min-h-11 rounded-[12px] border border-[#DDE0D9] bg-white px-3 font-normal outline-none focus:border-[#72CF35]"
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-11 rounded-full border border-[#DDE0D9] px-4 text-sm font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-social-post"
              disabled={!createTopic.trim() || pending !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#20211F] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending === "create" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}{" "}
              Create draft
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && pending === null) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-[24px] border-[#E1E3DE]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}” will be removed. If the server rejects the delete, the draft will be restored.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={pending !== null}
              className="bg-[#B33A42] hover:bg-[#962F37]"
            >
              {pending?.startsWith("delete:") ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}{" "}
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
