import type { QueryClient } from "@tanstack/react-query";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

export function invalidateOwnerBookingViews(client: QueryClient, identity: OwnerPreviewIdentity) {
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "bookings") });
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "today") });
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "queue") });
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "performance") });
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "customers") });
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "reports") });
}
