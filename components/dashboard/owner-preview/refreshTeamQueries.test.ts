import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
beforeEach(() => vi.clearAllMocks());
it("refreshes active date-keyed Team queries and confirms completion", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const key = ["team", "attendance", { date: "2026-10-11" }];
  client.setQueryData(key, {});
  const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => ({ saved: true }) });
  const stop = observer.subscribe(() => {});
  await refreshTeamQueries(client, ["team", "attendance"]);
  expect(toast.success).toHaveBeenCalledWith("Data refreshed."); stop(); client.clear();
});
it("reports refetch errors without claiming success", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const key = ["team", "owners"];
  client.setQueryData(key, {});
  const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => { throw new Error("offline"); } });
  const stop = observer.subscribe(() => {});
  await refreshTeamQueries(client, key);
  expect(toast.error).toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled(); stop(); client.clear();
});
it("does not emit a success toast without an active query", async () => {
  const client = new QueryClient();
  await refreshTeamQueries(client, ["team"]);
  expect(toast.success).not.toHaveBeenCalled(); client.clear();
});
it("refreshes the lifecycle cache alongside the preview without touching another owner", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const preview = vi.fn().mockResolvedValue({});
  const lifecycle = vi.fn().mockResolvedValue({});
  const otherOwner = vi.fn().mockResolvedValue({});
  const entries = [
    { queryKey: ["preview", "payroll"], queryFn: preview },
    { queryKey: ["payroll-lifecycle", "studio", "owner", 1], queryFn: lifecycle },
    { queryKey: ["payroll-lifecycle", "studio", "other", 1], queryFn: otherOwner },
  ];
  const stops = entries.map(options => {
    client.setQueryData(options.queryKey, {});
    return new QueryObserver(client, options).subscribe(() => {});
  });
  await refreshTeamQueries(client, ["preview", "payroll"], [["payroll-lifecycle", "studio", "owner"]]);
  expect(preview).toHaveBeenCalledTimes(1);
  expect(lifecycle).toHaveBeenCalledTimes(1);
  expect(otherOwner).not.toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledTimes(1);
  stops.forEach(stop => stop()); client.clear();
});
