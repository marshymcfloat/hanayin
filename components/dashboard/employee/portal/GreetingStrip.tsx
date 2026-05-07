"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PhilippinePeso } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * GreetingStrip — sticky top of the employee portal.
 *
 * Two states, animated with motion/react so sizes, padding, and
 * the subline collapse / expand smoothly:
 *
 *   - **Expanded** (initial, scrollY ≈ 0): big avatar + greeting
 *     headline + business subline, generous padding.
 *   - **Compact** (after scrolling > ~48px): smaller avatar +
 *     same headline at a smaller font, subline collapsed away,
 *     tight padding, frosted backdrop with hairline border.
 *
 * The strip listens to the nearest scrolling ancestor (or window
 * if none) so it works under any shell. Reduced-motion users get
 * the layout shift without animation.
 */
export interface GreetingStripProps {
  /** Display name of the signed-in employee. */
  name: string | null | undefined;
  /** Reserved for future use. Currently unused — the role pill was
   *  removed to keep the greeting visually quiet. Kept in the prop
   *  list so call sites don't have to change when we re-introduce
   *  it (or another role badge) later. */
  roleLabel?: string;
  /** Optional secondary line (e.g. business name). Collapsed in compact mode. */
  subline?: React.ReactNode;
  /**
   * Salary estimate (PHP) to render as a compact green pill anchored
   * to the right edge of the greeting block. Fills the empty
   * horizontal space when the row has slack, and stays grouped with
   * the avatar/headline (not the actions) so it never wraps to the
   * actions row on its own.
   */
  salaryEstimate?: number;
  /** Right-hand action slot (BookingDialog, GiftCardClaimDialog, AccountDropdown). */
  actions?: React.ReactNode;
}

const COMPACT_SCROLL_THRESHOLD = 48;
const SPRING = { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as const;

export function GreetingStrip({
  name,
  roleLabel: _roleLabel,
  subline,
  salaryEstimate,
  actions,
}: GreetingStripProps) {
  const reduced = useReducedMotion();
  const firstName = pickFirstName(name);
  const greeting = greetingForHour(new Date().getHours());

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
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

  // Single source of truth for animated values. Motion handles the
  // tween between these two snapshots, so every property animates
  // on the same curve at the same time — no popping.
  const targets = compact
    ? {
        outerPaddingY: 10,
        avatarSize: 36,
        headlineSize: 18,
      }
    : {
        outerPaddingY: 24,
        avatarSize: 48,
        headlineSize: 26,
      };

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "sticky top-0 z-30 transition-[background-color,backdrop-filter,border-color] duration-300",
        compact
          ? "border-b border-black/[0.06] bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <motion.div
        animate={
          reduced
            ? undefined
            : { paddingTop: targets.outerPaddingY, paddingBottom: targets.outerPaddingY }
        }
        transition={SPRING}
        className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
        style={
          reduced
            ? {
                paddingTop: targets.outerPaddingY,
                paddingBottom: targets.outerPaddingY,
              }
            : undefined
        }
      >
        {/* Two flex items at the top level — greeting block and
            actions block. flex-wrap pushes actions to a second row
            when the row is too narrow, so the greeting never
            truncates. Actions use ml-auto on whichever row they
            land in to stay right-anchored (right-handed thumb).
            The greeting block's `grow` makes it consume the row
            on mobile so the salary pill (inside the block, with
            its own ml-auto) gets pushed to the right edge,
            filling the empty space alongside "Good morning, …".
            sm+ collapses grow so everything sits inline. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
          <div className="flex grow items-center gap-3 sm:grow-0 sm:gap-4">
            <motion.div
              animate={
                reduced
                  ? undefined
                  : { width: targets.avatarSize, height: targets.avatarSize }
              }
              transition={SPRING}
              className="shrink-0"
              style={
                reduced
                  ? { width: targets.avatarSize, height: targets.avatarSize }
                  : undefined
              }
            >
              <Avatar className="size-full ring-1 ring-inset ring-primary/15">
                <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                  {pickInitials(name)}
                </AvatarFallback>
              </Avatar>
            </motion.div>

            <div className="min-w-0 leading-tight">
              <motion.h1
                animate={reduced ? undefined : { fontSize: targets.headlineSize }}
                transition={SPRING}
                className="truncate font-semibold tracking-[-0.01em] text-foreground"
                style={
                  reduced ? { fontSize: targets.headlineSize } : undefined
                }
              >
                {greeting}, {firstName}.
              </motion.h1>

              {/* Subline collapses smoothly in compact mode. AnimatePresence
                  + motion.p with height:auto on entry / 0 on exit gives a
                  proper height tween rather than a class-swap jump. */}
              <AnimatePresence initial={false}>
                {!compact && subline ? (
                  <motion.p
                    key="subline"
                    initial={
                      reduced ? undefined : { opacity: 0, height: 0, marginTop: 0 }
                    }
                    animate={
                      reduced
                        ? undefined
                        : { opacity: 1, height: "auto", marginTop: 2 }
                    }
                    exit={
                      reduced ? undefined : { opacity: 0, height: 0, marginTop: 0 }
                    }
                    transition={SPRING}
                    className="overflow-hidden truncate text-xs text-muted-foreground sm:text-sm"
                  >
                    {subline}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Salary pill — anchored to the right edge of the
                greeting block via ml-auto. Stays bound to the
                greeting (not the actions) so it always rides on
                the same row as the avatar + headline. */}
            {salaryEstimate != null ? (
              <div className="ml-auto shrink-0 sm:ml-2">
                <SalaryPill amount={salaryEstimate} compact={compact} />
              </div>
            ) : null}
          </div>

          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0 sm:gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SalaryPill                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compact green pill that sits inline with the greeting and shows
 * the running salary estimate. Mobile shrinks the pill (smaller
 * icon, tighter padding) so it doesn't crowd the headline. Compact
 * scroll mode trims it further.
 */
function SalaryPill({
  amount,
  compact,
}: {
  amount: number;
  compact: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-primary/10 ring-1 ring-inset ring-primary/15 transition-[padding] duration-300",
        compact ? "px-2.5 py-1" : "px-3 py-1.5",
      )}
    >
      <PhilippinePeso
        className={cn(
          "text-primary transition-[width,height] duration-300",
          compact ? "size-3" : "size-3.5",
        )}
      />
      <span
        className={cn(
          "font-semibold tabular-nums leading-none text-primary transition-[font-size] duration-300",
          compact ? "text-xs" : "text-xs sm:text-sm",
        )}
      >
        {formatCurrency(amount)}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
 * should fall back to window.
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
