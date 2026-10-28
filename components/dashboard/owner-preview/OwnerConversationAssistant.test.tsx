import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), simulate: vi.fn() }));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
vi.mock("@/features/social/conversation-assistant/actions", () => ({ getOwnerAssistantLabContextAction: mocks.context, simulateOwnerAssistantReplyAction: mocks.simulate }));
vi.mock("@/components/dashboard/owner-preview/CatalogEditorOverlay", () => ({
  CatalogEditorOverlay: ({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (value: boolean) => void; title: string; description: string; children: React.ReactNode }) => open ? <div role="dialog" aria-label={title}><h2>{title}</h2><p>{description}</p><button type="button" onClick={() => onOpenChange(false)}>Close editor</button>{children}</div> : null,
  CatalogEditorBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CatalogEditorFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  CatalogEditorClose: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));
import { OwnerConversationAssistant } from "@/components/dashboard/owner-preview/OwnerConversationAssistant";

const context = {
  success: true, data: {
    liveEnabled: false, aiPreviewAvailable: false,
    facts: { businessId: "lab-business", businessSlug: "lab-studio", name: "Lab Studio", timezone: "Asia/Manila", generatedAt: "2026-10-04T04:00:00Z", services: [{ id: 7, name: "Manicure", category: "Nails", price: 280, durationMinutes: 30 }], hours: [] },
  },
};
const proposed = { success: true, data: { decisionSource: "OWNER_SELECTED_SCENARIO", factsGeneratedAt: context.data.facts.generatedAt, result: { mode: "DRY_RUN", sent: false, status: "PROPOSED", reason: "GROUNDED_TEMPLATE", reply: "Manicure · base price ₱280. No booking is reserved.", eligibleAt: null } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(context);
  mocks.simulate.mockResolvedValue(proposed);
});

async function openLab() {
  render(<OwnerConversationAssistant businessSlug="lab-studio" />);
  fireEvent.click(screen.getByRole("button", { name: "Test auto-replies" }));
  await screen.findByLabelText("Synthetic customer message");
  await waitFor(() => expect(screen.getByRole("button", { name: "Run simulation" })).toBeEnabled());
}

describe("OwnerConversationAssistant", () => {
  it("uses themed accessible menus in the redesign without running a simulation", async () => {
    render(<OwnerConversationAssistant businessSlug="lab-studio" redesign fontClassName="test-font" />);
    fireEvent.click(screen.getByRole("button", { name: "Test auto-replies" }));
    const service = await screen.findByRole("combobox", { name: "Public service" });
    await waitFor(() => expect(service).toBeEnabled());
    expect(service.tagName).toBe("BUTTON");
    fireEvent.keyDown(service, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Manicure" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Manicure" }));
    expect(service).toHaveTextContent("Manicure");
    expect(screen.getByRole("group", { name: "Simulation mode" })).toBeInTheDocument();
    expect(mocks.simulate).not.toHaveBeenCalled();
  });
  it("labels the lab, assumed permissions, and offline policy mode without a live-enable control", async () => {
    await openLab();
    expect(screen.getByText("Simulation only")).toBeInTheDocument();
    expect(screen.getByText(/Live messaging is not enabled/)).toBeInTheDocument();
    expect(screen.getByText(/publishing connection does not verify messaging access/)).toBeInTheDocument();
    expect(screen.getByText(/not AI classification and never contacts a provider/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable|send to customer/i })).not.toBeInTheDocument();
    expect(mocks.context).toHaveBeenCalledWith({ businessSlug: "lab-studio" });
  });

  it("submits only the canned scenario and simulated state, not facts, decisions, or tenant IDs", async () => {
    await openLab();
    fireEvent.change(screen.getByLabelText("Public service"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByText("Proposed reply")).toBeInTheDocument();
    expect(screen.getByText("Not sent")).toBeInTheDocument();
    expect(screen.getByText(/not an AI-generated decision/)).toBeInTheDocument();
    expect(mocks.simulate).toHaveBeenCalledWith({ businessSlug: "lab-studio", mode: "POLICY", message: "Hello, what services and prices do you offer?", scenario: "services", serviceId: 7, date: null, elapsedSeconds: 120, humanReplied: false, paused: false, optedOut: false });
  });

  it("clicking checkbox text toggles compact safeguard rows", async () => {
    await openLab();
    fireEvent.click(screen.getByText("A person already replied"));
    expect(screen.getByLabelText("A person already replied")).toBeChecked();
    expect(screen.getByLabelText("A person already replied").closest("label")).toHaveClass("min-h-11");
    expect(screen.getByLabelText("Synthetic customer message")).toHaveAttribute("maxLength", "700");
  });

  it("disables duplicate submissions and keeps a retryable local error without assuming success", async () => {
    let resolve!: (value: unknown) => void;
    mocks.simulate.mockReturnValue(new Promise((done) => { resolve = done; }));
    await openLab();
    const submit = screen.getByRole("button", { name: "Run simulation" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.simulate).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Testing…" })).toBeDisabled();
    resolve({ success: false, error: "Please retry the simulation." });
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
    await waitFor(() => expect(screen.getByRole("button", { name: "Run simulation" })).toBeEnabled());
    expect(screen.queryByText("Proposed reply")).not.toBeInTheDocument();
  });

  it("uses an explicit unchecked per-call consent and displays unavailable Jev honestly", async () => {
    await openLab();
    fireEvent.click(screen.getByRole("button", { name: "Jev preview" }));
    expect(screen.getByText(/Jev preview is unavailable on this server/)).toBeInTheDocument();
    const consent = screen.getByRole("checkbox", { name: /Allow this synthetic message/ });
    expect(consent).not.toBeChecked();
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await waitFor(() => expect(mocks.simulate).toHaveBeenCalledWith({ businessSlug: "lab-studio", mode: "AI", message: "Hello, what services and prices do you offer?", consentForExternalProcessing: true, elapsedSeconds: 120, humanReplied: false, paused: false, optedOut: false }));
  });

  it("discards late context/results on close and clears synthetic text on the next opening", async () => {
    let resolve!: (value: unknown) => void;
    mocks.simulate.mockReturnValue(new Promise((done) => { resolve = done; }));
    await openLab();
    fireEvent.change(screen.getByLabelText("Synthetic customer message"), { target: { value: "A temporary invented test message" } });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    resolve(proposed);
    await waitFor(() => expect(screen.queryByText("Proposed reply")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Test auto-replies" }));
    expect(await screen.findByLabelText("Synthetic customer message")).toHaveValue("Hello, what services and prices do you offer?");
    expect(screen.queryByText("Proposed reply")).not.toBeInTheDocument();
  });

  it("retries a denied/failed context read locally without rendering synthetic data as live", async () => {
    mocks.context.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    render(<OwnerConversationAssistant businessSlug="lab-studio" />);
    fireEvent.click(screen.getByRole("button", { name: "Test auto-replies" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(screen.queryByLabelText("Synthetic customer message")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry loading facts" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Retry loading facts" }));
    expect(await screen.findByLabelText("Synthetic customer message")).toBeInTheDocument();
  });
});
