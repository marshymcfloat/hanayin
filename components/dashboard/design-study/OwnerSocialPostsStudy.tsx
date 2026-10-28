"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ImageIcon, Megaphone, Plus, Search, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import type { Category, SocialPostDraft } from "@/components/dashboard/owner-preview/OwnerSocialPostsPreview";
import type { OwnerSocialPostPreviewPost as Post, OwnerSocialPostsPreviewData } from "@/features/social/types/owner-social-post-preview";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import ui from "@/components/dashboard/design-study/owner-social-posts.module.css";

type Props = {
  data: OwnerSocialPostsPreviewData; posts: Post[]; selectedPost: Post | null; draft: SocialPostDraft | null;
  dirty: boolean; pending: string | null; fontClassName: string;
  onSelect: (id: string) => void; onUpdate: (field: keyof SocialPostDraft, value: string) => void;
  onSave: () => void; onPublish: () => void; onRetry: (id: string) => void;
  createOpen: boolean; onCreateOpen: (open: boolean) => void; createTopic: string; onTopic: (value: string) => void;
  createCategory: Category; onCategory: (value: Category) => void; categories: { value: Category; label: string }[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  deleteTarget: Post | null; onDelete: (post: Post | null) => void; onConfirmDelete: () => void;
};

const statusLabel = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
const channel = (value: string) => value === "INSTAGRAM_BUSINESS" ? "Instagram" : "Facebook";
const date = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export function OwnerSocialPostsStudy(props: Props) {
  const { data, posts, selectedPost: post, draft, pending, fontClassName, dirty } = props;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(12);
  const [editing, setEditing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => posts.filter(item => (status === "all" || item.status === status) && `${item.title} ${item.caption} ${item.saleEvent?.title ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())), [posts, search, status]);
  const shown = visible.slice(0, limit);
  const capture = useSelectionMotion(root, shown.map(item => item.id).join(","), "social");
  const connected = data.connections.filter(item => item.status === "CONNECTED");
  const locked = !!pending || post?.status === "PUBLISHED" || post?.status === "PUBLISHING" || !!post?.targets.some(target => target.status === "QUEUED" || target.status === "PUBLISHING");
  const canPublish = !!post && !locked && !dirty && !!draft?.caption.trim() && post.targets.some(target => target.connection.status === "CONNECTED");
  const metrics = [{ label: "Drafts", value: data.metrics.drafts, detail: "Ideas still taking shape" }, { label: "Ready to share", value: data.metrics.ready, detail: "Review before publishing" }, { label: "Published", value: data.metrics.published, detail: "Confirmed by your channels" }, { label: "Needs attention", value: data.metrics.failed, detail: "Review delivery details" }];
  return <div className={`${styles.page} ${ui.page} ${fontClassName}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{data.business.name} · Social posts</p><h1>A little more to share.</h1><p className={styles.description}>Shape your next post, review the details, then share it with your community.</p></div><button className={styles.primary} disabled={!!pending} data-catalog-focus="social-create" onClick={() => props.onCreateOpen(true)}><Plus size={17} aria-hidden="true"/>New post</button></header>
    <section className={styles.summary} aria-label="Social post overview">{metrics.map(item => <article className={styles.metric} key={item.label}><div className={styles.metricLabel}>{item.label}</div><strong>{item.value}</strong><small>{item.detail}</small></article>)}</section>
<section className={ui.channels} aria-label="Social channels"><div><span className={ui.channelIcon}><Megaphone size={21} aria-hidden="true"/></span><div><h2>{connected.length ? `${connected.length} connected ${connected.length === 1 ? "channel" : "channels"}` : "Your posts, ready for their audience."}</h2><p>{connected.length ? connected.map(item => `${channel(item.platform)} · ${item.displayName}`).join(" / ") : "You can prepare drafts now. Connect a channel in social settings before publishing."}</p></div></div><Link className={styles.secondary} href={`/app/${encodeURIComponent(data.business.slug)}/business`}>Social settings<ArrowUpRight size={14} aria-hidden="true"/></Link></section>
    <div ref={root}><section className={styles.catalog} aria-labelledby="social-library-heading"><div className={styles.toolbar}><div><h2 id="social-library-heading">Your post library</h2><span className={styles.count} role="status">{visible.length} of {posts.length} posts</span></div><div className={styles.filters}><label className={styles.search}><Search size={16} aria-hidden="true"/><span className="sr-only">Search social posts</span><input value={search} placeholder="Find a post…" onChange={event => { capture(); setSearch(event.target.value); setLimit(12); }}/></label><Select value={status} onValueChange={value => { capture(); setStatus(value); setLimit(12); }}><SelectTrigger className={styles.select} aria-label="Filter social posts"><SelectValue/></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="all">All posts</SelectItem>{["DRAFT", "READY", "PUBLISHING", "PUBLISHED", "FAILED"].map(value => <SelectItem value={value} key={value}>{statusLabel(value)}</SelectItem>)}</SelectContent></Select></div></div>
      <ul className={ui.library} data-social-area>{shown.map(item => <li data-social-row={item.id} key={item.id}><button className={ui.post} disabled={!!pending} data-catalog-focus={`social-${item.id}`} onClick={() => { props.onSelect(item.id); setConfirmPublish(false); setEditing(true); }}><span className={ui.art}>{item.mediaUrl ? <img src={item.mediaUrl} loading="lazy" alt=""/> : <ImageIcon size={28} aria-hidden="true"/>}<span className={ui.status}>{pending === `save:${item.id}` ? "Saving…" : statusLabel(item.status)}</span></span><span className={ui.postCopy}><small>{date.format(new Date(item.createdAt))}{item.saleEvent ? " · Sale event" : " · Organic post"}</small><strong>{item.title}</strong><span>{item.caption || "A new idea waiting for your words."}</span><span className={ui.postAction}>Review post<ArrowUpRight size={15} aria-hidden="true"/></span></span></button></li>)}</ul>
      {!shown.length && <div className={styles.empty}><div><span className={styles.emptyIcon}><Megaphone size={28} aria-hidden="true"/></span><h3>{search || status !== "all" ? "No matching posts" : "Your next conversation starts here."}</h3><p>{search || status !== "all" ? "Try a different search or status." : "Start with a topic. Save a draft and make it yours before sharing."}</p><button className={styles.secondary} disabled={!!pending} onClick={() => { if (search || status !== "all") { capture(); setSearch(""); setStatus("all"); } else props.onCreateOpen(true); }}>{search || status !== "all" ? "Clear filters" : "Create your first post"}</button></div></div>}
      {shown.length < visible.length && <div className={styles.loadMore}><button className={styles.secondary} onClick={() => { capture(); setLimit(value => value + 12); }}>Show more posts</button></div>}
      <div className={styles.footer}><Link href="/redesign/owner-dashboard/business/sale-events">Planning an offer? Manage sale events ↗</Link><span>Delivery updates come from your connected channels.</span></div>
    </section></div>
    <CatalogEditorOverlay open={props.createOpen} onOpenChange={value => { if (!pending) props.onCreateOpen(value); }} title="Create a post" description="Start with a topic. Nothing is published when you create a draft." restoreFocusKey="social-create" className={`${fontClassName} ${ui.sheet}`}>
      <ScrollArea className={ui.scroll}><form id="social-create-form" className={ui.body} onSubmit={props.onCreate}><label>What would you like to share?<input required maxLength={200} value={props.createTopic} onChange={event => props.onTopic(event.target.value)} disabled={!!pending} placeholder="A treatment tip, a team moment, a new service…"/></label><label id="social-category-label">Post category</label><Select value={props.createCategory} disabled={!!pending} onValueChange={value => props.onCategory(value as Category)}><SelectTrigger className={ui.select} aria-labelledby="social-category-label"><SelectValue/></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}>{props.categories.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><p className={ui.hint}>You’ll review the caption before requesting publication. No image is generated at this step.</p></form></ScrollArea><CatalogEditorFooter className={ui.footer}><button form="social-create-form" type="submit" className={styles.primary} disabled={!!pending || !props.createTopic.trim()}>{pending === "create" ? "Creating draft…" : "Create draft"}</button></CatalogEditorFooter>
    </CatalogEditorOverlay>
    <CatalogEditorOverlay open={editing && !!post} onOpenChange={value => { if (!pending) { setEditing(value); setConfirmPublish(false); props.onDelete(null); } }} title="Review your post" description="Save your edits before sharing. Delivery is confirmed by each channel." restoreFocusKey={`social-${post?.id}`} className={`${fontClassName} ${ui.sheet}`}>
      {post && draft && <><ScrollArea className={ui.scroll}><div className={ui.body}>
        <span className={ui.pill}>{pending === `save:${post.id}` ? "Saving…" : statusLabel(post.status)}</span>
        {post.saleEvent && <p className={ui.context}>Sale event · {post.saleEvent.title} · {post.saleEvent.discountType === "PERCENTAGE" ? `${post.saleEvent.discountValue}%` : `₱${post.saleEvent.discountValue}`} off</p>}
        {post.growth && <p className={ui.context}>{post.growth.anchorLabel} · {post.growth.opportunityReason}</p>}
        <label>Title<input value={draft.title} disabled={locked} onChange={event => props.onUpdate("title", event.target.value)}/></label>
        <label>Caption<textarea rows={7} value={draft.caption} disabled={locked} onChange={event => props.onUpdate("caption", event.target.value)}/></label>
        <label>Hashtags<input value={draft.hashtags} disabled={locked} onChange={event => props.onUpdate("hashtags", event.target.value)}/><small>Separate tags with commas.</small></label>
        <label>Image URL<input type="url" value={draft.mediaUrl} disabled={locked} onChange={event => props.onUpdate("mediaUrl", event.target.value)}/><small>Optional. Use an image you have permission to share.</small></label>
        <section className={ui.delivery} aria-label="Delivery status"><h3>Where it will be shared</h3>{!post.targets.length && <p>No channels selected for this post. Manage its channels in social settings.</p>}{post.targets.map(target => <div key={target.id}><strong>{channel(target.connection.platform)} · {target.connection.displayName}</strong><p>{statusLabel(target.status)} · {statusLabel(target.connection.status)}</p>{target.lastError && <p>{target.lastError}</p>}{target.status === "FAILED" && <button className={styles.secondary} disabled={!!pending || target.connection.status !== "CONNECTED"} onClick={() => props.onRetry(target.id)}>Retry delivery</button>}</div>)}</section>
        {post.lastError && <p className={ui.context}>{post.lastError}</p>}
        {!locked && <button className={ui.delete} onClick={() => props.onDelete(post)}>Delete draft</button>}
        {props.deleteTarget && <div className={ui.confirm} role="group" aria-label="Confirm deletion"><strong>Delete this draft?</strong><p>This removes the saved draft. Published posts cannot be deleted here.</p><div><button className={styles.secondary} disabled={!!pending} onClick={() => props.onDelete(null)}>Cancel</button><button className={styles.primary} disabled={!!pending} onClick={() => { props.onConfirmDelete(); setConfirmPublish(false); }}>Delete draft</button></div></div>}
        {confirmPublish && <div className={ui.confirm} role="group" aria-label="Confirm publication"><strong>Share this post with your audience?</strong><p>This sends a publication request to the connected channels listed above.</p><div><button className={styles.secondary} disabled={!!pending} onClick={() => setConfirmPublish(false)}>Cancel</button><button className={styles.primary} disabled={!canPublish} onClick={() => { setConfirmPublish(false); props.onPublish(); }}>Confirm publish</button></div></div>}
      </div></ScrollArea><CatalogEditorFooter className={ui.footer}><small>{dirty ? "Unsaved edits · kept here while you work" : "Changes saved before sharing"}</small><div><button className={styles.secondary} disabled={locked || !dirty || !draft.title.trim()} onClick={props.onSave}><Check size={15} aria-hidden="true"/>Save draft</button><button className={styles.primary} disabled={!canPublish} onClick={() => setConfirmPublish(true)}><Send size={15} aria-hidden="true"/>Publish post</button></div></CatalogEditorFooter></>}
    </CatalogEditorOverlay>
  </div>;
}
