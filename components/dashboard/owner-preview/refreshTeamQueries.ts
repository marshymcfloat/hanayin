"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

export async function refreshTeamQueries(client: QueryClient, queryKey: QueryKey, additionalKeys: QueryKey[] = []) {
  const keys = [queryKey, ...additionalKeys];
  const predicate = (query: { queryKey: QueryKey }) => keys.some(key => key.every((part, index) => JSON.stringify(part) === JSON.stringify(query.queryKey[index])));
  if (client.isFetching({ predicate })) return;
  try {
    await client.refetchQueries({ predicate, type: "active" });
    const queries = client.getQueryCache().findAll({ predicate, type: "active" });
    if (!queries.length) return;
    if (queries.some(query => query.state.fetchStatus === "paused")) toast.warning("Refresh paused. Check your connection and try again.");
    else if (queries.some(query => query.state.status === "error")) toast.error("Could not refresh the data. Please try again.");
    else toast.success("Data refreshed.");
  } catch { toast.error("Could not refresh the data. Please try again."); }
}
