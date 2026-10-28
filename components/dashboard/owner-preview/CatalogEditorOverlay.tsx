"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { gsap } from "gsap";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./CatalogEditorOverlay.module.css";

export function CatalogEditorOverlay({
  open,
  onOpenChange,
  title,
  description,
  restoreFocusKey,
  size = "standard",
  onExited,
  className,
  initialFocus = "field",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  restoreFocusKey: string;
  size?: "standard" | "booking";
  onExited?: () => void;
  className?: string;
  initialFocus?: "field" | "panel";
  children: ReactNode;
}) {
  const [present, setPresent] = useState(open);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.activeElement as HTMLElement,
  );

  if (open && !present) {
    setPresent(true);
  }

  function finishExit() {
    onExited?.();
    setPresent(false);
    requestAnimationFrame(() => {
      const keyedTargets = Array.from(
        document.querySelectorAll<HTMLElement>("[data-catalog-focus]"),
      ).filter((element) => element.dataset.catalogFocus === restoreFocusKey);
      const target =
        keyedTargets.find((element) => element.getClientRects().length > 0) ??
        keyedTargets[0] ??
        (restoreFocusRef.current?.isConnected
          ? restoreFocusRef.current
          : null);
      window.setTimeout(() => {
        if (target?.isConnected && !document.querySelector('[data-testid="catalog-editor-overlay"]')) {
          target.focus();
        }
      }, 0);
    });
  }

  if (!present) return null;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogPrimitive.Portal forceMount>
        <CatalogEditorSurface
          open={open}
          overlayRef={overlayRef}
          panelRef={panelRef}
          title={title}
          description={description}
          size={size}
          className={className}
          initialFocus={initialFocus}
          onExited={finishExit}
        >
          {children}
        </CatalogEditorSurface>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CatalogEditorSurface({
  open,
  overlayRef,
  panelRef,
  title,
  description,
  size,
  className,
  initialFocus,
  onExited,
  children,
}: {
  open: boolean;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  description: string;
  size: "standard" | "booking";
  className?: string;
  initialFocus: "field" | "panel";
  onExited: () => void;
  children: ReactNode;
}) {
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const canMatchMedia = typeof window.matchMedia === "function";
    if (!canMatchMedia) {
      if (open) {
        overlay.style.opacity = "1";
        overlay.style.visibility = "visible";
        overlay.style.backdropFilter = "blur(4px)";
        panel.style.opacity = "1";
        panel.style.visibility = "visible";
        panel.style.transform = "translate(0, 0)";
        return;
      }
      const frame = requestAnimationFrame(() => onExitedRef.current());
      return () => cancelAnimationFrame(frame);
    }

    let frame = 0;
    const context = gsap.context(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const duration = reduceMotion ? 0.01 : open ? 0.32 : 0.22;
      const xPercent = reduceMotion || mobile ? 0 : 100;
      const yPercent = reduceMotion || !mobile ? 0 : 100;
      if (document.visibilityState === "hidden") {
        overlay.style.opacity = open ? "1" : "0";
        overlay.style.visibility = open ? "visible" : "hidden";
        overlay.style.backdropFilter = open ? "blur(4px)" : "blur(0px)";
        panel.style.opacity = open ? "1" : "0";
        panel.style.visibility = open ? "visible" : "hidden";
        panel.style.transform = open ? "translate(0, 0)" : mobile ? "translateY(100%)" : "translateX(100%)";
        if (!open) queueMicrotask(() => onExitedRef.current());
        return;
      }
      const timeline = gsap.timeline({
        paused: true,
        defaults: { overwrite: "auto" },
        onComplete: open ? undefined : () => onExitedRef.current(),
      });

      if (open) {
        timeline
          .fromTo(
            overlay,
            { autoAlpha: 0, backdropFilter: "blur(0px)" },
            {
              autoAlpha: 1,
              backdropFilter: "blur(4px)",
              duration,
              ease: "power2.out",
            },
          )
          .fromTo(
            panel,
            { autoAlpha: 0, xPercent, yPercent },
            {
              autoAlpha: 1,
              xPercent: 0,
              yPercent: 0,
              duration,
              ease: "power3.out",
            },
            0,
          );
      } else {
        timeline
          .to(panel, {
            autoAlpha: 0,
            xPercent,
            yPercent,
            duration,
            ease: "power2.in",
          })
          .to(
            overlay,
            {
              autoAlpha: 0,
              backdropFilter: "blur(0px)",
              duration,
              ease: "power1.in",
            },
            0,
          );
      }

      frame = requestAnimationFrame(() => timeline.play(0));
    }, panel);

    return () => {
      cancelAnimationFrame(frame);
      context.revert();
    };
  }, [open, overlayRef, panelRef]);

  return (
    <>
      <DialogPrimitive.Overlay
        ref={overlayRef}
        forceMount
        data-testid="catalog-editor-backdrop"
        className={cn(styles.backdrop, "fixed inset-0 z-50")}
      />
      <DialogPrimitive.Content
        ref={panelRef}
        forceMount
        inert={!open}
        aria-hidden={!open}
        data-testid="catalog-editor-overlay"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const field = initialFocus === "field" ? Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
                "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled])",
              ) ?? []).find((element) => element.getClientRects().length > 0) : undefined;
              (field ?? panelRef.current)?.focus();
            });
          });
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if ((target instanceof Node && panelRef.current?.contains(target)) ||
            (size === "booking" && target instanceof Element && target.closest("[data-owner-booking-calendar]"))) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if ((target instanceof Node && panelRef.current?.contains(target)) ||
            (size === "booking" && target instanceof Element && target.closest("[data-owner-booking-calendar]"))) event.preventDefault();
        }}
        className={cn(styles.panel, size === "booking" && styles.bookingPanel, "fixed inset-x-0 bottom-0 z-50 flex min-h-0 flex-col overflow-hidden rounded-t-[26px] border border-[#E1E3DE] bg-white shadow-[0_-24px_70px_rgba(23,24,23,0.22)] outline-none", className)}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#D8DBD5] md:hidden" aria-hidden="true" />
        <header className="shrink-0 border-b border-[#ECEEE9] px-5 pb-4 pt-4 pr-14 md:px-6 md:py-5 md:pr-16">
          <DialogPrimitive.Title className="text-lg font-bold leading-tight text-[#20211F]">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-[13px] leading-5 text-[#696C67]">
            {description}
          </DialogPrimitive.Description>
        </header>
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            aria-label="Close editor"
            className="absolute right-3 top-3 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#696C67] outline-none hover:bg-[#F1F2EF] focus-visible:ring-3 focus-visible:ring-[#72CF35] md:right-4 md:top-4"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </>
  );
}

export function CatalogEditorBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-6", className)} {...props} />;
}

export function CatalogEditorFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.footer, "grid shrink-0 grid-cols-2 gap-2 border-t border-[#ECEEE9] bg-[#FAFBF8] px-5 pt-3 md:flex md:justify-end md:px-6", className)} {...props} />;
}

export function CatalogEditorClose({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <DialogPrimitive.Close asChild>
      <button type="button" {...props}>{children}</button>
    </DialogPrimitive.Close>
  );
}
