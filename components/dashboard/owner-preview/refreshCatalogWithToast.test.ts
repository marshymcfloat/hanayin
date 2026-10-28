import { QueryClient, onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshCatalogWithToast } from "@/components/dashboard/owner-preview/refreshCatalogWithToast";

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: feedback }));
const clients: QueryClient[] = [];
function setup(section = "services") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const key = ["owner-preview", "owner", "business", section, "catalog"];
  return { client, key };
}
afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

describe("explicit catalog refresh feedback", () => {
  it.each(["services", "packages", "vouchers", "gift-cards"])("toasts only the requested %s refresh, not automatic reads", async section => {
    const { client, key } = setup(section);
    const queryFn = vi.fn().mockResolvedValue({ items: [] });
    await client.fetchQuery({ queryKey: key, queryFn });
    expect(feedback.success).not.toHaveBeenCalled();
    await refreshCatalogWithToast(client, key);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(feedback.success).toHaveBeenCalledExactlyOnceWith("Catalog refreshed.");
  });

  it("reports failure even when cached rows remain and allows retry", async () => {
    const { client, key } = setup();
    const queryFn = vi.fn().mockResolvedValue({ items: [1] });
    await client.fetchQuery({ queryKey: key, queryFn });
    queryFn.mockRejectedValueOnce(new Error("private server details"));
    await refreshCatalogWithToast(client, key);
    expect(client.getQueryData(key)).toEqual({ items: [1] });
    expect(feedback.error).toHaveBeenCalledExactlyOnceWith("Could not refresh the catalog. Please try again.");
    expect(feedback.success).not.toHaveBeenCalled();
    await refreshCatalogWithToast(client, key);
    expect(feedback.success).toHaveBeenCalledTimes(1);
  });

  it("does not repeat an in-flight request or announce success early", async () => {
    const { client, key } = setup();
    const queryFn = vi.fn().mockResolvedValue([]);
    await client.fetchQuery({ queryKey: key, queryFn });
    let resolve!: (value: unknown[]) => void;
    queryFn.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = refreshCatalogWithToast(client, key);
    await refreshCatalogWithToast(client, key);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(feedback.success).not.toHaveBeenCalled();
    resolve([]);
    await pending;
    expect(feedback.success).toHaveBeenCalledTimes(1);
  });

  it("warns when offline rather than reporting cached data as refreshed", async () => {
    const { client, key } = setup();
    await client.fetchQuery({ queryKey: key, queryFn: async () => [] });
    onlineManager.setOnline(false);
    await refreshCatalogWithToast(client, key);
    expect(feedback.warning).toHaveBeenCalledExactlyOnceWith("Refresh paused. Check your connection and try again.");
    expect(feedback.success).not.toHaveBeenCalled();
  });
});
