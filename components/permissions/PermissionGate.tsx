"use client";

/**
 * Declarative permission gate. Renders children only when the current
 * viewer satisfies the requirement. Owners always pass.
 *
 * This is a UI hint, not a security boundary — server actions remain
 * the authoritative check.
 *
 * @example
 *   <PermissionGate require="BOOKING_MODIFY">
 *     <Button onClick={openAddServiceDialog}>Add service</Button>
 *   </PermissionGate>
 *
 * @example Disable instead of hide
 *   <PermissionGate
 *     require="BOOKING_MODIFY"
 *     disabledFallback={<DisabledHint reason="You can't modify bookings." />}
 *   >
 *     <Button>Add service</Button>
 *   </PermissionGate>
 */

import { cloneElement, isValidElement, type ReactNode } from "react";
import type { StaffPermission } from "@/prisma/generated/prisma/enums";

import { useViewer, hasViewerPermission } from "@/lib/auth/viewer-context";

type PermissionGateBaseProps = {
  /** Hidden by default. */
  fallback?: ReactNode;
  /**
   * When provided, the gate renders the disabled element instead of
   * hiding. The element must be a single React element; pointer-events
   * are disabled and `aria-disabled` is set so the rest of the page
   * still benefits from focus management.
   */
  disabledFallback?: React.ReactElement;
  children: ReactNode;
};

type PermissionGateProps =
  | (PermissionGateBaseProps & {
      require: StaffPermission | ReadonlyArray<StaffPermission>;
      requireAny?: never;
    })
  | (PermissionGateBaseProps & {
      require?: never;
      requireAny: ReadonlyArray<StaffPermission>;
    });

export function PermissionGate(props: PermissionGateProps) {
  const viewer = useViewer();
  const allowed =
    "require" in props && props.require !== undefined
      ? hasViewerPermission(viewer, props.require, "all")
      : hasViewerPermission(viewer, props.requireAny, "any");

  if (allowed) {
    return <>{props.children}</>;
  }

  if (props.disabledFallback) {
    if (!isValidElement(props.disabledFallback)) {
      // Defensive: make misuse loud in development.
      throw new Error(
        "PermissionGate disabledFallback must be a single React element",
      );
    }
    const fallback = props.disabledFallback as React.ReactElement<
      Record<string, unknown>
    >;
    return cloneElement(fallback, {
      "aria-disabled": true,
      "data-permission-denied": true,
      // Block pointer events so the disabled clone can't be clicked.
      style: {
        ...((fallback.props.style as React.CSSProperties | undefined) ?? {}),
        pointerEvents: "none",
        opacity: 0.5,
      },
    });
  }

  return <>{props.fallback ?? null}</>;
}
