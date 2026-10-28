"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCatalogEditorSessions } from "@/components/dashboard/owner-preview/useCatalogEditorSessions";

export function useTeamAvailabilitySessions<T>(otherEditorOpen: boolean) {
  const sessions = useCatalogEditorSessions<T>();
  const blocked = useRef(otherEditorOpen);
  useEffect(() => { blocked.current = otherEditorOpen; }, [otherEditorOpen]);
  return { ...sessions, failed(id: number, error: string) {
    sessions.status(id, "failed");
    toast.error(error, { duration: 10000, action: { label: "Review draft", onClick: () => {
      if (blocked.current) { toast.error("Close the current form before reopening this draft."); return; }
      sessions.resume(id);
    } } });
  } };
}
