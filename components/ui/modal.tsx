"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { ReactNode, useRef } from "react";

import { cn } from "@/lib/utils";
import { useLockScroll } from "@/hooks/use-lock-scroll";

export function Modal({
  children,
  title,
  description,
  className,
  modal = true,
  showBackdrop = true,
  backdropClassName,
  closeOnBackdrop = true,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
  modal?: boolean;
  showBackdrop?: boolean;
  backdropClassName?: string;
  closeOnBackdrop?: boolean;
}) {
  const router = useRouter();
  const lastDismissAtRef = useRef(0);

  // Lock the page (body overflow + Lenis stop) while this modal is mounted.
  // Restored automatically on unmount. Pairs with `data-lenis-prevent` on
  // DialogContent below so native scroll inside the modal still works.
  useLockScroll(true);

  function onDismiss() {
    // Dismiss events can fire twice in quick succession (e.g. pointer + open state).
    // Guard only the current interaction, but allow future open/close cycles.
    const now = Date.now();
    if (now - lastDismissAtRef.current < 300) return;
    lastDismissAtRef.current = now;

    router.back();
  }

  return (
    <Dialog
      open={true}
      modal={modal}
      onOpenChange={(open) => !open && onDismiss()}
    >
      {!modal && showBackdrop && (
        <DialogPortal>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm",
              backdropClassName,
            )}
            onClick={closeOnBackdrop ? onDismiss : undefined}
          />
        </DialogPortal>
      )}
      <DialogContent
        // `data-lenis-prevent` lets the native scroll inside this dialog
        // work even though Lenis is stopped on the page beneath.
        data-lenis-prevent=""
        className={cn(
          "sm:max-w-[600px] overflow-y-auto max-h-[90vh]",
          className,
        )}
      >
        <DialogHeader>
          {title ? <DialogTitle>{title}</DialogTitle> : <DialogTitle className="sr-only">Dialog</DialogTitle>}
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
