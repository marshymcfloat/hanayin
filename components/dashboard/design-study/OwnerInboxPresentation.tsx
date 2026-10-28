"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Root, Viewport } from "@radix-ui/react-scroll-area";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import inbox from "@/components/dashboard/design-study/owner-inbox.module.css";

export function OwnerInboxPresentation({ children }: { children: ReactNode }) {
  return <div className={cn(styles.page, inbox.theme)}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard/customers" className={styles.back}><ArrowLeft size={14} aria-hidden="true" />Customers</Link>
    <header className={cn(styles.header, inbox.heading)}><div><p className={styles.eyebrow}>Customer conversations</p><h1>Customer inbox</h1><p className={styles.description}>Messenger conversations, reply suggestions, and human takeover.</p></div></header>
    {children}
  </div></div>;
}

export function InboxScrollArea({ children, label, messages = false, editor = false, resetKey }: { children: ReactNode; label: string; messages?: boolean; editor?: boolean; resetKey?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (messages && node && followLatest.current) node.scrollTop = node.scrollHeight;
  }, [children, messages, resetKey]);
  return <Root type="scroll" scrollHideDelay={800} className={cn(inbox.scroll, editor ? inbox.editorScroll : messages ? inbox.messages : inbox.conversations)}>
    <Viewport ref={viewport} data-slot="scroll-area-viewport" tabIndex={0} aria-label={label} className="size-full" onScroll={(event) => {
      const node = event.currentTarget;
      followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
    }}>{children}</Viewport><ScrollBar />
  </Root>;
}
