"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

/** Feedback only for explicit refresh/retry clicks, never automatic refetches. */
export async function refreshCatalogWithToast(client: QueryClient, key: QueryKey) {
  if (client.isFetching({ queryKey: key, exact: true })) return;
  try {
    await client.refetchQueries({ queryKey: key, exact: true });
    const state = client.getQueryState(key);
    if (state?.fetchStatus === "paused") {
      toast.warning("Refresh paused. Check your connection and try again.");
    } else if (state?.status === "success") {
      toast.success("Catalog refreshed.");
    } else {
      toast.error("Could not refresh the catalog. Please try again.");
    }
  } catch {
    toast.error("Could not refresh the catalog. Please try again.");
  }
}
