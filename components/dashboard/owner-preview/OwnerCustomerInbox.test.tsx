import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxConversationDetail, InboxSnapshot } from "@/features/social/customer-messaging/contracts";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), settings: vi.fn(), takeover: vi.fn(), replace: vi.fn(), capture: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { id: "owner-a", role: "OWNER", businessSlug: "studio-a" } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/features/social/customer-messaging/actions", () => ({ updateOwnerInboxSettingsAction: mocks.settings, setOwnerInboxTakeoverAction: mocks.takeover }));
vi.mock("@/components/dashboard/owner-preview/OwnerConversationAssistant", () => ({ OwnerConversationAssistant: () => <button type="button">Test auto-replies</button> }));
import { OwnerCustomerInboxRoute } from "@/components/dashboard/owner-preview/OwnerCustomerInbox";
import { OwnerPreviewQueryProvider } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";

const identity = { userId: "owner-a", businessId: "business-a", businessSlug: "studio-a", businessName: "Studio A", ownerName: "Owner" };
const setup: InboxSnapshot & { aiEntitled: boolean } = {
  setupStatus: "SETUP_REQUIRED", readinessReasons: ["CHANNEL_UNVERIFIED", "PERMISSIONS_UNVERIFIED", "WEBHOOK_UNCONFIGURED", "WORKER_DISABLED", "DELIVERY_DISABLED", "PILOT_UNVERIFIED"], channel: null,
  settings: { mode: "OFF", consent: false, aiConsent: false, paused: false, defaultLanguage: "EN" }, canEnableAuto: false, conversations: [], aiEntitled: true,
};
const conversation = { id: "conversation-a", title: "Customer A", status: "OPEN" as const, lastActivityAt: "2026-10-04T05:00:00Z", takeover: false, optedOut: false };
const ready = { ...setup, setupStatus: "READY" as const, readinessReasons: [], channel: { displayName: "Studio Messenger", verified: true }, canEnableAuto: true, conversations: [conversation] };
const detail: InboxConversationDetail = {
  conversation, messages: [{ id: "message-a", direction: "INBOUND", text: "How much is a manicure?", occurredAt: "2026-10-04T05:00:00Z", deliveryStatus: "NONE" }],
  draft: { text: "A manicure starts at ₱280.", createdAt: "2026-10-04T05:02:00Z" }, deliveryTruth: "UNKNOWN",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function CaptureCache() {
  const client = useQueryClient();
  useEffect(() => { mocks.capture(client); }, [client]);
  return null;
}
function renderInbox(redesign = false) {
  return render(<OwnerPreviewQueryProvider identity={identity}><CaptureCache /><OwnerCustomerInboxRoute redesign={redesign} /></OwnerPreviewQueryProvider>);
}
function cache() { return mocks.capture.mock.calls.at(-1)?.[0] as QueryClient; }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : setup));
  mocks.settings.mockResolvedValue({ success: true, data: setup.settings });
  mocks.takeover.mockResolvedValue({ success: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Customer Inbox", () => {
  it("guards unsaved settings without changing consent on the server", async () => {
    renderInbox(true);
    fireEvent.click(await screen.findByRole("button", { name: "Inbox settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Allow this inbox/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Keep your changes?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep draft" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("checkbox", { name: /Allow this inbox/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Inbox settings" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Inbox settings" }));
    expect(screen.getByRole("checkbox", { name: /Allow this inbox/ })).not.toBeChecked();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("retries only the failed detail read without issuing a messaging mutation", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? { error: "Unavailable" } : ready, url.includes("conversationId") ? 503 : 200));
    renderInbox(true);
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    const retry = await screen.findByRole("button", { name: "Retry conversation" });
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    fireEvent.click(retry);
    expect(await screen.findByText("How much is a manicure?")).toBeInTheDocument();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.takeover).not.toHaveBeenCalled();
  });
  it("reads a redesign conversation without any mutation, unread fiction, or send retry", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? { ...detail, deliveryTruth: "FAILED" } : ready));
    renderInbox(true);
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    await screen.findByText("Send failed");
    expect(screen.getByText("Read status unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText("Message history")).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("button", { name: /send|retry send/i })).not.toBeInTheDocument();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.takeover).not.toHaveBeenCalled();
  });

  it("keeps a pending settings sheet open, prevents duplicate writes, and preserves a failed draft", async () => {
    let resolve!: (value: unknown) => void;
    mocks.settings.mockReturnValue(new Promise(done => { resolve = done; }));
    renderInbox(true);
    fireEvent.click(await screen.findByRole("button", { name: "Inbox settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Allow this inbox/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    await act(async () => resolve({ success: false, error: "Settings unavailable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Settings unavailable");
    expect(screen.getByRole("checkbox", { name: /Allow this inbox/ })).toBeChecked();
    expect(mocks.toastError).toHaveBeenCalledWith("Settings unavailable");
  });

  it("keeps the conversation list mounted while detail loads and reports pending sends honestly", async () => {
    let resolve!: (value: Response) => void;
    mocks.fetch.mockImplementation((url: string) => url.includes("conversationId") ? new Promise<Response>(done => { resolve = done; }) : Promise.resolve(response(ready)));
    renderInbox(true);
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    expect(screen.getByLabelText("Loading conversation")).toBeInTheDocument();
    expect(screen.getByLabelText("Conversation list")).toBeInTheDocument();
    await act(async () => resolve(response({ ...detail, deliveryTruth: "PENDING" })));
    expect(await screen.findByText("Awaiting send confirmation")).toBeInTheDocument();
    expect(screen.queryByText("Send confirmed")).not.toBeInTheDocument();
  });

  it("shows honest setup, an empty collection, and default off unchecked consent", async () => {
    renderInbox();
    expect(await screen.findByText("Messaging setup required")).toBeInTheDocument();
    expect(screen.getByText(/A publishing connection does not grant inbox access/)).toBeInTheDocument();
    expect(screen.getByText("No customer conversations")).toBeInTheDocument();
    expect(screen.queryByText("Customer A")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inbox settings" }));
    expect(screen.getByRole("radio", { name: /Off/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Allow this inbox/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /external AI provider/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Automatic replies/ })).toBeDisabled();
    expect(screen.queryByLabelText("Fallback language")).not.toBeInTheDocument();
    expect(screen.getByText(/Unclear messages receive a language clarification/)).toBeInTheDocument();
    expect(screen.getByText(/up to 7 days/)).toHaveTextContent("up to 30 days");
    expect(screen.getByText(/keyed stop-preference fingerprint/)).toHaveTextContent("while the channel is connected, including beyond 30 days");
    expect(screen.getByText(/keyed stop-preference fingerprint/)).toHaveTextContent("no message text or contact details");
  });

  it("requires separate owner and external AI consent before suggestion controls become available", async () => {
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "Inbox settings" }));
    const suggestion = screen.getByRole("radio", { name: /Suggestions only/ });
    expect(suggestion).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Allow this inbox/ }));
    expect(suggestion).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /external AI provider/ }));
    expect(suggestion).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Automatic replies/ })).toBeDisabled();
    fireEvent.click(suggestion);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mocks.settings).toHaveBeenCalledWith({ businessSlug: "studio-a", settings: { ...setup.settings, mode: "SUGGEST", consent: true, aiConsent: true } }));
    expect(screen.queryByText("Send confirmed")).not.toBeInTheDocument();
  });

  it("shows proposed and unknown outcomes without a fake send action or confirmed delivery", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    expect(await screen.findByText("How much is a manicure?")).toBeInTheDocument();
    expect(screen.getByText("Proposed reply · not sent")).toBeInTheDocument();
    expect(screen.getByText("Send outcome unknown · needs review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Send confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take over" })).toHaveClass("min-h-11");
  });

  it("moves keyboard focus into details and restores the selected conversation on return", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    renderInbox();
    const selected = await screen.findByRole("button", { name: /Customer A/ });
    fireEvent.click(selected);
    expect(screen.getByRole("heading", { name: "Customer A" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Back to conversations" }));
    expect(selected).toHaveFocus();
    expect(screen.getByRole("button", { name: "Refresh inbox" })).toHaveClass("min-w-11");
  });

  it("labels provider confirmation as a send and does not imply recipient delivery or reading", async () => {
    const confirmed = { ...detail, deliveryTruth: "CONFIRMED", draft: null, messages: [{ ...detail.messages[0], direction: "OUTBOUND", deliveryStatus: "CONFIRMED", text: "Public service reply." }] };
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? confirmed : ready));
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    expect(await screen.findAllByText(/Send confirmed/)).toHaveLength(2);
    expect(screen.getByText(/does not confirm recipient delivery or reading/)).toBeInTheDocument();
    expect(screen.queryByText("Delivery confirmed")).not.toBeInTheDocument();
  });

  it("retains visible messages during manual refresh and provides a local retry on failure", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    await screen.findByText("How much is a manicure?");
    const resolves: Array<(value: Response) => void> = [];
    mocks.fetch.mockImplementation(() => new Promise<Response>((done) => { resolves.push(done); }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" }));
    expect(screen.getByText("How much is a manicure?")).toBeInTheDocument();
    await act(async () => { resolves.forEach((resolve) => resolve(response({ error: "Unavailable" }, 503))); });
    await screen.findByText("Refresh failed. Retry to update the inbox.");
    expect(screen.getByText("How much is a manicure?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh inbox" })).toHaveAttribute("title", expect.stringContaining("Retry inbox"));
  });

  it("does not change takeover or send status before the server confirms persistence", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    let resolve!: (value: unknown) => void;
    mocks.takeover.mockReturnValue(new Promise((done) => { resolve = done; }));
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Take over" }));
    expect(screen.getByRole("button", { name: "Take over" })).toBeDisabled();
    expect(screen.queryByText(/Human takeover ·/)).not.toBeInTheDocument();
    await act(async () => resolve({ success: false, error: "Takeover failed. Please retry." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Takeover failed");
    expect(screen.getByText("Send outcome unknown · needs review")).toBeInTheDocument();
    expect(screen.queryByText(/Human takeover ·/)).not.toBeInTheDocument();
  });

  it("clears sensitive queries on navigation and does not show old conversation text on revisit", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    const first = renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    await screen.findByText("How much is a manicure?");
    const client = cache();
    first.unmount();
    expect(client.getQueriesData({ queryKey: ownerPreviewKeys.page(identity, "inbox") })).toHaveLength(0);
    mocks.fetch.mockResolvedValue(response(setup));
    renderInbox();
    await screen.findByText("No customer conversations");
    expect(screen.queryByText("How much is a manicure?")).not.toBeInTheDocument();
  });

  it("revokes the owner cache and removes all content after an authorization failure", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response(url.includes("conversationId") ? detail : ready));
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Customer A/ }));
    await screen.findByText("How much is a manicure?");
    const client = cache();
    mocks.fetch.mockResolvedValue(response({ error: "Forbidden" }, 403));
    fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("How much is a manicure?")).not.toBeInTheDocument();
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  it("polls only after readiness is verified and only while the page is visible", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    const visibility = (value: string) => { Object.defineProperty(document, "visibilityState", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")); };
    try {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      renderInbox();
      await screen.findByText("Messaging setup required");
      const initial = mocks.fetch.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(60_000); });
      expect(mocks.fetch).toHaveBeenCalledTimes(initial);
      mocks.fetch.mockImplementation(async () => response(ready));
      fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" }));
      await screen.findByText("Studio Messenger");
      const beforePoll = mocks.fetch.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(30_000); });
      await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(beforePoll + 1));
      await act(async () => { visibility("hidden"); });
      await act(async () => { vi.advanceTimersByTime(60_000); });
      expect(mocks.fetch).toHaveBeenCalledTimes(beforePoll + 1);
    } finally {
      if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
      else Reflect.deleteProperty(document, "visibilityState");
    }
  });
});
