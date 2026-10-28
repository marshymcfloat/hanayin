import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { OwnerPreviewQueryProvider, useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mockSession = vi.hoisted(() => ({
  status: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  user: { id: "owner-a", role: "OWNER", businessSlug: "studio-a" },
}));
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: mockSession.status, data: { user: mockSession.user } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const identity: OwnerPreviewIdentity = {
  userId: "owner-a",
  businessId: "business-a",
  businessSlug: "studio-a",
  businessName: "Studio A",
  ownerName: "Avery",
};

function Probe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();
  const context = useOwnerPreviewContext();
  const fetchPreview = useOwnerPreviewFetch();
  const [message, setMessage] = useState("");
  onClient(client);
  return (
    <div>
      <span>{context.businessName}</span>
      <button onClick={() => void fetchPreview<{ message: string }>("/api/owner-dashboard-preview/studio-a/test").then((data) => setMessage(data.message)).catch(() => setMessage("error"))}>Fetch</button>
      <span>{message}</span>
    </div>
  );
}

beforeEach(() => {
  mockSession.status = "authenticated";
  mockSession.user = { id: "owner-a", role: "OWNER", businessSlug: "studio-a" };
  mockReplace.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("OwnerPreviewQueryProvider", () => {
  it("exposes verified identity and creates a distinct cache when the owner or business changes", () => {
    let currentClient: QueryClient | undefined;
    const first = render(
      <OwnerPreviewQueryProvider key="owner-a:business-a" identity={identity}>
        <Probe onClient={(client) => { currentClient = client; }} />
      </OwnerPreviewQueryProvider>,
    );
    const firstClient = currentClient;
    expect(screen.getByText("Studio A")).toBeInTheDocument();
    firstClient?.setQueryData(ownerPreviewKeys.section(identity, "services", "catalog"), { private: true });

    mockSession.user = { id: "owner-b", role: "OWNER", businessSlug: "studio-b" };
    const second = { ...identity, userId: "owner-b", businessId: "business-b", businessSlug: "studio-b", businessName: "Studio B" };
    first.rerender(
      <OwnerPreviewQueryProvider key="owner-b:business-b" identity={second}>
        <Probe onClient={(client) => { currentClient = client; }} />
      </OwnerPreviewQueryProvider>,
    );
    expect(screen.getByText("Studio B")).toBeInTheDocument();
    expect(currentClient).not.toBe(firstClient);
    expect(currentClient?.getQueryData(ownerPreviewKeys.section(identity, "services", "catalog"))).toBeUndefined();
  });

  it("does not reuse private results after a slug change on the same owner and business ID", () => {
    let currentClient: QueryClient | undefined;
    const view = render(
      <OwnerPreviewQueryProvider key="owner-a:business-a:studio-a" identity={identity}>
        <Probe onClient={(client) => { currentClient = client; }} />
      </OwnerPreviewQueryProvider>,
    );
    const firstClient = currentClient;
    firstClient?.setQueryData(ownerPreviewKeys.section(identity, "services", "catalog"), { private: true });

    const renamed = { ...identity, businessSlug: "studio-renamed", businessName: "Renamed Studio" };
    mockSession.user = { id: "owner-a", role: "OWNER", businessSlug: "studio-renamed" };
    view.rerender(
      <OwnerPreviewQueryProvider key="owner-a:business-a:studio-renamed" identity={renamed}>
        <Probe onClient={(client) => { currentClient = client; }} />
      </OwnerPreviewQueryProvider>,
    );

    expect(currentClient).not.toBe(firstClient);
    expect(screen.getByText("Renamed Studio")).toBeInTheDocument();
    expect(currentClient?.getQueryData(ownerPreviewKeys.section(identity, "services", "catalog"))).toBeUndefined();
  });

  it("hides the workspace and clears cached data as soon as the session changes", async () => {
    let client: QueryClient | undefined;
    const view = render(
      <OwnerPreviewQueryProvider identity={identity}>
        <Probe onClient={(value) => { client = value; }} />
      </OwnerPreviewQueryProvider>,
    );
    client?.setQueryData(ownerPreviewKeys.section(identity, "services", "catalog"), { private: true });
    mockSession.user = { id: "different-owner", role: "OWNER", businessSlug: "studio-a" };
    view.rerender(
      <OwnerPreviewQueryProvider identity={identity}>
        <Probe onClient={(value) => { client = value; }} />
      </OwnerPreviewQueryProvider>,
    );

    expect(screen.queryByText("Studio A")).not.toBeInTheDocument();
    await waitFor(() => expect(client?.getQueryCache().getAll()).toHaveLength(0));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it.each([401, 403])("clears private data after a %i response", async (status) => {
    let client: QueryClient | undefined;
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <OwnerPreviewQueryProvider identity={identity}>
        <Probe onClient={(value) => { client = value; }} />
      </OwnerPreviewQueryProvider>,
    );
    client?.setQueryData(ownerPreviewKeys.section(identity, "services", "catalog"), { private: true });

    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(client?.getQueryCache().getAll()).toHaveLength(0));
    expect(screen.queryByText("Studio A")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(fetchMock).toHaveBeenCalledWith("/api/owner-dashboard-preview/studio-a/test", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  });

  it("returns successful JSON without invalidating existing private data", async () => {
    let client: QueryClient | undefined;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "fresh" }) }));
    render(
      <OwnerPreviewQueryProvider identity={identity}>
        <Probe onClient={(value) => { client = value; }} />
      </OwnerPreviewQueryProvider>,
    );
    client?.setQueryData(ownerPreviewKeys.section(identity, "services", "catalog"), { private: true });

    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    expect(await screen.findByText("fresh")).toBeInTheDocument();
    expect(client?.getQueryCache().getAll()).toHaveLength(1);
  });
});
