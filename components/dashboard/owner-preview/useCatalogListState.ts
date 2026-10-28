"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { type Dispatch, type RefObject, type SetStateAction, useContext, useEffect, useRef, useState } from "react";

/** Owner-provider memory only; clearing the authenticated cache clears this too. */
export function useCatalogListState<T>(scope: string, field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const client = useContext(QueryClientContext);
  const key = ["catalog-list-ui", scope, field];
  const [value, setValue] = useState<T>(() => client?.getQueryData<T>(key) ?? initial);
  const current = useRef(value);
  function update(next: SetStateAction<T>) {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(current.current) : next;
    current.current = resolved;
    setValue(resolved);
    client?.setQueryData(key, resolved);
  }
  return [value, update];
}

export function useCatalogScroll(scope: string, ref: RefObject<HTMLElement | null>) {
  const client = useContext(QueryClientContext);
  useEffect(() => {
    if (!client || !ref.current) return;
    let element: HTMLElement | null = ref.current.parentElement;
    while (element && !/(auto|scroll)/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
    const scroller = element ?? document.scrollingElement;
    if (!scroller) return;
    const key = ["catalog-list-ui", scope, "scroll"];
    const frame = requestAnimationFrame(() => {
      const saved = client.getQueryData<number>(key);
      if (saved !== undefined) scroller.scrollTop = saved;
    });
    let position = scroller.scrollTop;
    const remember = () => { position = scroller.scrollTop; };
    const target = element ?? window;
    target.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", remember);
      client.setQueryData(key, position);
    };
  }, [client, ref, scope]);
}
