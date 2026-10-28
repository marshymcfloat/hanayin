"use client";
import { useRef } from "react";

export function useCommandKeys() {
  const requests = useRef(new Map<string, string>());
  return function command<T extends object>(operation: string, payload: T): T & { key: string } {
    const identity = operation + ":" + JSON.stringify(payload);
    let key = requests.current.get(identity);
    if (!key) { key = crypto.randomUUID(); requests.current.set(identity, key); }
    return { ...payload, key };
  };
}
