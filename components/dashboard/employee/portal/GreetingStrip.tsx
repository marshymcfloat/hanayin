"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * GreetingStrip — top of the employee portal.
 *
 * Two states:
 *   - **Expanded** (initial, scrollY ≈ 0): big avatar + role pill +
 *     greeting headline + business subline, generous padding.
 *   - **Compact** (after scrolling > ~64px): smaller avatar + a
 *     single-line headline showing just the first name and the role
 *     pill inline, tight padding, frosted-cream backdrop, hairline
 *     bottom border. The whole strip stays sticky to the top of the
 *     scrolling container the entire time.
 *
 * Sticky behavior depends on the EmployeePortalShell being its own
 * scroll container (it sets `h-full overflow-y-auto` on the wrapper).
 * The strip listens to `scroll` events on its own scrolling ancestor
 * via a ref-walked lookup so it works regardless of which shell
 * (frontdesk or sidebar) it lands inside.
 *
 * Reduced-motion users get the same content shifts but without
 * transitions or the entrance fade.
 */
export interface GreetingStripProps {
  /** Display name of the signed-in employee. */
  name: string | null | undefined;
  /** "Manager Portal" / "Cashier Portal" / "Employee Portal" */
  roleLabel: string;
  /** Optional secondary line (e.g. business name). Hidden in compact mode. */
  subline?: React.ReactNode;
  /** Right-hand action slot (BookingDialog, GiftCardClaimDialog, AccountDropdown). */
  actions?: React.ReactNode;
}

const COMPACT_SCROLL_THRESHOLD = 48;

export function GreetingStrip({
  name,
  roleLabel,
  subline,
  actions,
}: GreetingStripProps) {
  const reduced = useReducedMotion();
  const firstName = pickFirstName(name);
  const greeting = greetingForHour(new Date().getHours());

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    // Find the nearest scrolling ancestor — that's the element we
    // need to listen to. The shell wraps with overflow-y-auto, so
    // page-level window scroll is a no-op for us; we have to watch
    // the actual scroll container.
    const el = wrapperRef.current;
    if (!el) return;
    const scroller = findScrollContainer(el) ?? window;
    const update = () => {
      const top =
        scroller === window
          ? window.scrollY
          : (scroller as HTMLElement).scrollTop;
      setCompact(top > COMPACT_SCROLL_THRESHOLD);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "sticky top-0 z-30 transition-[background-color,backdrop-filter,border-color,padding] duration-300",
        compact
          ? "border-b border-black/[0.06] bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 transition-[padding] duration-300",
          compact ? "py-2.5" : "pt-5 pb-1 sm:pt-7 sm:pb-2",
        )}
      >
        <motion.header
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap items-center justify-between gap-3 sm:gap-4"
        >
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Avatar
              className={cn(
                "shrink-0 ring-1 ring-inset ring-primary/15 transition-[width,height] duration-300",
                compact ? "size-9" : "size-11 sm:size-12",
              )}
            >
              <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                {pickInitials(name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 leading-tight">
              {/* Role pill — shown above headline when expanded, inline
                  next to the first name when compact. */}
              {!compact ? (
                <span className="inline-flex items-center gap-2">
                  <RolePill label={roleLabel} />
                </span>
              ) : null}

              <div
                className={cn(
                  "flex items-center gap-2 transition-[margin] duration-300",
                  compact ? "" : "mt-1.5",
                )}
              >
                <h1
                  className={cn(
                    "truncate font-semibold tracking-[-0.01em] text-foreground transition-[font-size] duration-300",
                    compact
                      ? "text-base sm:text-lg"
                      : "text-xl sm:text-2xl",
                  )}
                >
                  {compact ? firstName : `${greeting}, ${firstName}.`}
                </h1>
                {compact ? <RolePill label={roleLabel} /> : null}
              </div>

              {!compact && subline ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
                  {subline}
                </p>
              ) : null}
            </div>
          </div>

          {actions ? (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {actions}
            </div>
          ) : null}
        </motion.header>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function RolePill({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary ring-1 ring-inset ring-primary/15">
      <span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-primary" />
      {label}
    </span>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function pickFirstName(full: string | null | undefined): string {
  if (!full) return "there";
  const trimmed = full.trim();
  if (!trimmed) return "there";
  const first = trimmed.split(/\s+/)[0];
  return first.length ? first : "there";
}

function pickInitials(full: string | null | undefined): string {
  if (!full) return "U";
  const trimmed = full.trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Walk up the DOM from `el` until we find an ancestor that scrolls
 * (overflow-y is auto/scroll/overlay). Returns null if none — caller
 * should fall back to window. We have to compute this dynamically
 * because EmployeePortalShell sets overflow on its wrapper to keep
 * sticky working under the sidebar shell's overflow-hidden parent.
 */
function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur);
    const overflowY = style.overflowY;
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}
