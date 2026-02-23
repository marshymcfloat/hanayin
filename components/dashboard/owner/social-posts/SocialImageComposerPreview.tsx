"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SocialImageOverlayDraft } from "@/lib/services/social/image-overlay";
import {
  getOverlayCardLayout,
  OVERLAY_SNAP_GRID,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
} from "./image-composer";

type SocialImageComposerPreviewProps = {
  previewUrl: string | null;
  backgroundUrl: string | null;
  isRendering: boolean;
  errorMessage?: string | null;
  overlayDraft?: SocialImageOverlayDraft | null;
  onCardPositionChange?: (position: { cardXPercent: number; cardYPercent: number }) => void;
};

export function SocialImageComposerPreview(props: SocialImageComposerPreviewProps) {
  const imageUrl = props.previewUrl || props.backgroundUrl;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{
    cardXPercent: number;
    cardYPercent: number;
  } | null>(null);
  const dragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startCardXPercent: number;
    startCardYPercent: number;
  } | null>(null);

  useEffect(() => {
    if (!frameRef.current) return;

    const element = frameRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setFrameWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setFrameWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setDragPosition(null);
  }, [props.overlayDraft?.cardXPercent, props.overlayDraft?.cardYPercent]);

  const activeOverlay = useMemo(() => {
    if (!props.overlayDraft) return null;
    if (!dragPosition) return props.overlayDraft;
    return {
      ...props.overlayDraft,
      cardXPercent: dragPosition.cardXPercent,
      cardYPercent: dragPosition.cardYPercent,
    };
  }, [props.overlayDraft, dragPosition]);

  const cardLayout = useMemo(() => {
    if (!activeOverlay) return null;
    return getOverlayCardLayout(activeOverlay);
  }, [activeOverlay]);

  const frameHeight = frameWidth > 0 ? (frameWidth * 3) / 2 : 0;
  const gridStepXPercent = (OVERLAY_SNAP_GRID / SOCIAL_IMAGE_WIDTH) * 100;
  const gridStepYPercent = (OVERLAY_SNAP_GRID / SOCIAL_IMAGE_HEIGHT) * 100;

  const snapCoordinate = (value: number, min: number, max: number) => {
    const snapped = min + Math.round((value - min) / OVERLAY_SNAP_GRID) * OVERLAY_SNAP_GRID;
    return Math.min(max, Math.max(min, snapped));
  };

  const commitPosition = () => {
    if (!dragPosition || !props.onCardPositionChange) return;
    props.onCardPositionChange(dragPosition);
    setDragPosition(null);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!props.overlayDraft) return;
    const startCardXPercent = props.overlayDraft.cardXPercent ?? 6;
    const startCardYPercent = props.overlayDraft.cardYPercent ?? 4;
    dragStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCardXPercent,
      startCardYPercent,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || !cardLayout || frameWidth <= 0 || frameHeight <= 0) return;
    const deltaClientX = event.clientX - dragStateRef.current.startClientX;
    const deltaClientY = event.clientY - dragStateRef.current.startClientY;
    const deltaCanvasX = deltaClientX * (SOCIAL_IMAGE_WIDTH / frameWidth);
    const deltaCanvasY = deltaClientY * (SOCIAL_IMAGE_HEIGHT / frameHeight);
    const currentCanvasX =
      cardLayout.minX +
      ((cardLayout.maxX - cardLayout.minX) * dragStateRef.current.startCardXPercent) / 100;
    const currentCanvasY =
      cardLayout.minY +
      ((cardLayout.maxY - cardLayout.minY) * dragStateRef.current.startCardYPercent) / 100;
    const nextCanvasX = Math.min(
      cardLayout.maxX,
      Math.max(cardLayout.minX, currentCanvasX + deltaCanvasX),
    );
    const nextCanvasY = Math.min(
      cardLayout.maxY,
      Math.max(cardLayout.minY, currentCanvasY + deltaCanvasY),
    );
    const snappedCanvasX = snapCoordinate(
      nextCanvasX,
      cardLayout.minX,
      cardLayout.maxX,
    );
    const snappedCanvasY = snapCoordinate(
      nextCanvasY,
      cardLayout.minY,
      cardLayout.maxY,
    );
    const xRange = Math.max(1, cardLayout.maxX - cardLayout.minX);
    const yRange = Math.max(1, cardLayout.maxY - cardLayout.minY);
    setDragPosition({
      cardXPercent: Number(
        (((snappedCanvasX - cardLayout.minX) / xRange) * 100).toFixed(2),
      ),
      cardYPercent: Number(
        (((snappedCanvasY - cardLayout.minY) / yRange) * 100).toFixed(2),
      ),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      commitPosition();
      dragStateRef.current = null;
    }
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Live Preview
      </p>
      <div
        ref={frameRef}
        className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Composed social post preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-sm text-zinc-500">
            Generate a background to start composing the final image.
          </div>
        )}
        {imageUrl && props.onCardPositionChange && isDragging ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
              backgroundSize: `${gridStepXPercent}% ${gridStepYPercent}%`,
            }}
          />
        ) : null}
        {imageUrl && cardLayout && props.onCardPositionChange && frameWidth > 0 ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drag overlay card position"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute cursor-move rounded-2xl border-2 border-white/70 shadow-[0_0_0_1px_rgba(24,24,24,0.32)]"
            style={{
              left: `${(cardLayout.x / SOCIAL_IMAGE_WIDTH) * 100}%`,
              top: `${(cardLayout.y / SOCIAL_IMAGE_HEIGHT) * 100}%`,
              width: `${(cardLayout.width / SOCIAL_IMAGE_WIDTH) * 100}%`,
              height: `${(cardLayout.height / SOCIAL_IMAGE_HEIGHT) * 100}%`,
            }}
          />
        ) : null}
      </div>
      {props.isRendering ? (
        <p className="text-xs text-zinc-500">Rendering preview...</p>
      ) : null}
      {props.onCardPositionChange ? (
        <p className="text-[11px] text-zinc-500">
          Drag the white frame to move your text card. Snap grid appears while dragging.
        </p>
      ) : null}
      {props.errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {props.errorMessage}
        </p>
      ) : null}
    </div>
  );
}
