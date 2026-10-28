"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Keep independent drafts alive while their optimistic requests settle. */
export function useCatalogEditorSessions<T>() {
  const sequence = useRef(0);
  const active = useRef<number | null>(null);
  const states = useRef(new Map<number, string>());
  useEffect(() => {
    const current = states.current;
    return () => { current.clear(); };
  }, []);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<{ id: number; item: T | null; state: "draft" | "pending" | "failed" | "saved" }[]>([]);
  function select(id: number | null) {
    active.current = id;
    setActiveId(id);
  }
  function open(item: T | null = null) {
    const id = ++sequence.current;
    for (const [key, state] of states.current) if (state === "saved") states.current.delete(key);
    states.current.set(id, "draft");
    setSessions(current => [...current.filter(entry => entry.state !== "saved"), { id, item, state: "draft" }]);
    select(id);
  }
  function resume(id: number) {
    if (!["draft", "failed"].includes(states.current.get(id) ?? "")) return;
    if (active.current !== null && active.current !== id) {
      toast.error("Close the current form before reopening this draft.");
      return;
    }
    select(id);
  }
  function status(id: number, state: "pending" | "failed" | "saved") {
    if (!states.current.has(id)) return;
    states.current.set(id, state);
    setSessions(current => current.map(entry => entry.id === id ? { ...entry, state } : entry));
  }
  function dismiss(id: number) {
    if (active.current === id) select(null);
  }
  function failed(id: number, error: string) {
    status(id, "failed");
    toast.error(error, { duration: 10000, action: { label: "Review draft", onClick: () => resume(id) } });
  }
  return { sessions, activeId, open, resume, dismiss, failed, status };
}
