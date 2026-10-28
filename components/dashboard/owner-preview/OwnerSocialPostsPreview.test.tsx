import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changed: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  publish: vi.fn(),
  retry: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/bookings/design-study/SelectionMotion", () => ({ useSelectionMotion: () => () => {} }));

vi.mock("./OwnerDashboardPreview", () => ({
  PreviewDesktopRail: () => <nav aria-label="Desktop preview navigation" />,
  PreviewMobileNavigation: () => <nav aria-label="Mobile preview navigation" />,
}));
vi.mock("@/features/social/actions/social", () => ({
  createOrganicSocialPostAction: (...args: unknown[]) => mocks.create(...args),
  updateSocialPostDraftAction: (...args: unknown[]) => mocks.update(...args),
  deleteSocialPostDraftAction: (...args: unknown[]) => mocks.remove(...args),
  publishSocialPostAction: (...args: unknown[]) => mocks.publish(...args),
  retrySocialPostTargetAction: (...args: unknown[]) => mocks.retry(...args),
}));

import type { OwnerSocialPostsPreviewData } from "@/features/social/types/owner-social-post-preview";
import { OwnerSocialPostsPreview } from "./OwnerSocialPostsPreview";

const data: OwnerSocialPostsPreviewData = {
  section: "social-posts",
  generatedAt: "2026-09-25T00:00:00.000Z",
  business: { slug: "studio-luna", name: "Studio Luna", imageUrl: null },
  metrics: { totalPosts: 1, drafts: 0, ready: 0, publishing: 0, published: 0, failed: 1 },
  connections: [{ id: "connection-1", platform: "FACEBOOK_PAGE", displayName: "Studio page", status: "CONNECTED" }],
  referenceAssets: [],
  posts: [{
    id: "post-1",
    title: "Rainy day reset",
    status: "FAILED",
    caption: "A calm reset for rainy days.",
    hashtags: ["#reset"],
    mediaUrl: "https://cdn.example.test/post.jpg",
    lastError: "Provider timeout",
    createdAt: "2026-09-20T00:00:00.000Z",
    publishedAt: null,
    saleEvent: { title: "Rainy offer", description: null, discountType: "PERCENTAGE", discountValue: 15, startDate: "2026-09-20T00:00:00.000Z", endDate: "2026-09-30T00:00:00.000Z" },
    growth: { anchorLabel: "Rainy-season comfort", opportunityReason: "Quiet afternoon", audience: "Local clients" },
    targets: [{ id: "target-1", status: "FAILED", lastError: "Provider timeout", publishedAt: null, remotePermalink: null, connection: { platform: "FACEBOOK_PAGE", displayName: "Studio page", status: "CONNECTED" } }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.create.mockResolvedValue({ success: true, data: { postId: "post-2" } });
  mocks.update.mockResolvedValue({ success: true });
  mocks.remove.mockResolvedValue({ success: true });
  mocks.publish.mockResolvedValue({ success: true });
  mocks.retry.mockResolvedValue({ success: true });
});

describe("redesigned social posts", () => {
  function show(next = data) { return render(<OwnerSocialPostsPreview redesign businessSlug="studio-luna" data={next} onChanged={mocks.changed}/>); }
  function openPost() { fireEvent.click(screen.getByRole("button", { name: /Rainy day reset/ })); }
  it("searches the full library and exposes the redesigned sale-events route", () => {
    show({ ...data, posts: Array.from({ length: 14 }, (_, index) => ({ ...data.posts[0], id: `${index}`, title: `Post ${index}` })) });
    expect(document.querySelectorAll("[data-social-row]")).toHaveLength(12);
    fireEvent.change(screen.getByLabelText("Search social posts"), { target: { value: "Post 13" } });
    expect(document.querySelectorAll("[data-social-row]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Planning an offer/ })).toHaveAttribute("href", "/redesign/owner-dashboard/business/sale-events");
    expect(screen.getByRole("link", { name: "Social settings" })).toHaveAttribute("href", "/app/studio-luna/business");
  });
  it("creates through a styled sheet, locks it while pending, and reports failures only by toast", async () => {
    let finish!: (value: unknown) => void;
    mocks.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    show(); fireEvent.click(screen.getByRole("button", { name: "New post" }));
    expect(screen.getByRole("dialog", { name: "Create a post" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Post category" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What would you like to share?"), { target: { value: "A salon tip" } });
    act(() => { fireEvent.submit(document.getElementById("social-create-form")!); fireEvent.submit(document.getElementById("social-create-form")!); });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("What would you like to share?")).toBeDisabled();
    await act(async () => finish({ success: false, error: "Draft unavailable" }));
    expect(mocks.error).toHaveBeenCalledWith("Draft unavailable");
    expect(screen.queryByText("Draft unavailable")).not.toBeInTheDocument();
    expect(screen.getByLabelText("What would you like to share?")).toHaveValue("A salon tip");
  });
  it("keeps failed optimistic edits and blocks publication while unsaved", async () => {
    let finish!: (value: unknown) => void;
    mocks.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    show(); openPost();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed title" } });
    expect(screen.getByRole("button", { name: "Publish post" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(document.querySelector('[data-social-row="post-1"]')).toHaveTextContent("Changed title");
    expect(screen.getByLabelText("Title")).toBeDisabled();
    await act(async () => finish({ success: false, error: "Save rejected" }));
    expect(document.querySelector('[data-social-row="post-1"]')).toHaveTextContent("Rainy day reset");
    expect(screen.getByLabelText("Title")).toHaveValue("Changed title");
    expect(mocks.error).toHaveBeenCalledWith("Save rejected");
  });
  it("requires explicit confirmation and never marks queued publication as published", async () => {
    show(); openPost();
    fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm publication" })).getByRole("button", { name: "Cancel" }));
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith({ businessSlug: "studio-luna", postId: "post-1" }));
    expect(document.querySelector('[data-social-row="post-1"]')).toHaveTextContent("Failed");
  });
  it("locks editing and publishing while a channel is queued", () => {
    show({ ...data, posts: [{ ...data.posts[0], targets: [{ ...data.posts[0].targets[0], status: "QUEUED" }] }] });
    openPost(); expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish post" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
  });
  it("restores a rejected deletion and uses toast feedback", async () => {
    mocks.remove.mockResolvedValue({ success: false, error: "Delete rejected" });
    show(); openPost(); fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm deletion" })).getByRole("button", { name: "Delete draft" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Delete rejected"));
    expect(document.querySelector('[data-social-row="post-1"]')).toHaveTextContent("Rainy day reset");
  });
});

describe("OwnerSocialPostsPreview", () => {
  it("renders backend content, lifecycle status, sale context, and provider state", () => {
    render(<OwnerSocialPostsPreview businessSlug="studio-luna" data={data} onChanged={mocks.changed} />);

    expect(screen.getAllByText("Rainy day reset").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);
    expect(screen.getByText(/Sale event:/)).toBeInTheDocument();
    expect(screen.getByText(/Growth context:/)).toBeInTheDocument();
    expect(screen.getByText(/1 connected channel/)).toBeInTheDocument();
    expect(screen.getByText(/Provider-specific media is never fabricated/)).toBeInTheDocument();
    expect(screen.queryByText(/access_token|external_account_id/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Test auto-replies/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Customer conversation assistant lab" })).not.toBeInTheDocument();
  });

  it("optimistically edits and rolls back when the server rejects the draft", async () => {
    let resolve!: (value: unknown) => void;
    mocks.update.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<OwnerSocialPostsPreview businessSlug="studio-luna" data={data} />);

    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Edited title" } });
    expect(screen.getByRole("button", { name: "Publish request" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByDisplayValue("Edited title")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(screen.getByLabelText("Caption")).toBeDisabled();

    resolve({ success: false, error: "Draft locked" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Draft locked");
    expect(screen.getByDisplayValue("Edited title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish request" })).toBeDisabled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("restores a deleted draft when the delete action fails", async () => {
    mocks.remove.mockResolvedValue({ success: false, error: "Delete denied" });
    render(<OwnerSocialPostsPreview businessSlug="studio-luna" data={data} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete denied");
    expect(screen.getAllByText("Rainy day reset").length).toBeGreaterThan(0);
  });

  it("keeps publish and retry pending until server reconciliation", async () => {
    let resolvePublish!: (value: unknown) => void;
    mocks.publish.mockReturnValue(new Promise((done) => { resolvePublish = done; }));
    render(<OwnerSocialPostsPreview businessSlug="studio-luna" data={data} onChanged={mocks.changed} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish request" }));
    expect(mocks.publish).toHaveBeenCalledWith({ businessSlug: "studio-luna", postId: "post-1" });
    expect(screen.getByRole("button", { name: /Publish request/ })).toBeDisabled();
    resolvePublish({ success: true });
    await waitFor(() => expect(mocks.changed).toHaveBeenCalled());

    mocks.retry.mockResolvedValue({ success: true });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith({ businessSlug: "studio-luna", targetId: "target-1" }));
  });

  it("shows a safe empty state and create form", () => {
    render(<OwnerSocialPostsPreview businessSlug="studio-luna" data={{ ...data, posts: [], metrics: { ...data.metrics, totalPosts: 0, failed: 0 } }} />);
    expect(screen.getByText("No social drafts yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create organic post" }));
    expect(screen.getByRole("dialog", { name: "Create organic post" })).toBeInTheDocument();
  });

  it("keeps an unsaved editor draft through background status updates", () => {
    const view = render(<OwnerSocialPostsPreview businessSlug="studio-luna" data={data} />);
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "My unsaved caption" } });
    view.rerender(<OwnerSocialPostsPreview businessSlug="studio-luna" data={{
      ...data,
      posts: [{ ...data.posts[0], status: "PUBLISHING", targets: [{ ...data.posts[0].targets[0], status: "QUEUED" }] }],
    }} />);
    expect(screen.getByDisplayValue("My unsaved caption")).toBeInTheDocument();
    expect(screen.getAllByText("PUBLISHING").length).toBeGreaterThan(0);
  });
});
