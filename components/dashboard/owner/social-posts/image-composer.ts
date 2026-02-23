import {
  SOCIAL_IMAGE_CARD_SIZE_DEFAULT,
  SOCIAL_IMAGE_CARD_SIZE_MAX,
  SOCIAL_IMAGE_CARD_SIZE_MIN,
  type SocialImageOverlayDraft,
} from "@/lib/services/social/image-overlay";

export const SOCIAL_IMAGE_WIDTH = 1024;
export const SOCIAL_IMAGE_HEIGHT = 1536;
export const OVERLAY_SNAP_GRID = 32;

type TextContext = {
  measureText: (text: string) => { width: number };
};

export type WrappedTextResult = {
  lines: string[];
  truncated: boolean;
};

export async function loadImage(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Unable to load background image. This can happen due to CORS restrictions."));
  });
  image.src = url;
  return loaded;
}

export function wrapText(
  context: TextContext,
  text: string,
  maxWidth: number,
  maxLines: number,
): WrappedTextResult {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || maxLines <= 0) {
    return { lines: [], truncated: false };
  }

  const lines: string[] = [];
  let currentLine = "";
  let truncated = false;

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = context.measureText(candidate).width;
    if (width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word);
      currentLine = "";
    }

    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
  }

  if (!truncated && currentLine) {
    lines.push(currentLine);
  }

  if (lines.length > maxLines) {
    truncated = true;
    lines.length = maxLines;
  }

  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1] || "";
    lines[lines.length - 1] = `${last.replace(/\.\.\.$/, "").trimEnd()}...`;
  }

  return { lines, truncated };
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawBackgroundCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const targetRatio = SOCIAL_IMAGE_WIDTH / SOCIAL_IMAGE_HEIGHT;
  const sourceRatio = sourceWidth / sourceHeight;
  let drawWidth = SOCIAL_IMAGE_WIDTH;
  let drawHeight = SOCIAL_IMAGE_HEIGHT;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > targetRatio) {
    drawWidth = SOCIAL_IMAGE_HEIGHT * sourceRatio;
    offsetX = (SOCIAL_IMAGE_WIDTH - drawWidth) / 2;
  } else {
    drawHeight = SOCIAL_IMAGE_WIDTH / sourceRatio;
    offsetY = (SOCIAL_IMAGE_HEIGHT - drawHeight) / 2;
  }

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

type OverlayCardLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function getOverlayCardLayout(
  overlay: Pick<
    SocialImageOverlayDraft,
    "cardXPercent" | "cardYPercent" | "cardSizePercent"
  >,
): OverlayCardLayout {
  const sizePercent = Number.isFinite(overlay.cardSizePercent ?? NaN)
    ? Math.min(
        SOCIAL_IMAGE_CARD_SIZE_MAX,
        Math.max(SOCIAL_IMAGE_CARD_SIZE_MIN, overlay.cardSizePercent ?? 0),
      )
    : SOCIAL_IMAGE_CARD_SIZE_DEFAULT;
  const scale = sizePercent / 100;
  const width = Math.round(688 * scale);
  const height = Math.round(1028 * scale);
  const radius = Math.max(24, Math.round(32 * scale));
  const minX = 40;
  const maxX = Math.max(minX, SOCIAL_IMAGE_WIDTH - width - 40);
  const minY = 56;
  const maxY = Math.max(minY, SOCIAL_IMAGE_HEIGHT - height - 56);
  const xPercent = Number.isFinite(overlay.cardXPercent ?? NaN)
    ? Math.min(100, Math.max(0, overlay.cardXPercent ?? 0))
    : 6;
  const yPercent = Number.isFinite(overlay.cardYPercent ?? NaN)
    ? Math.min(100, Math.max(0, overlay.cardYPercent ?? 0))
    : 4;
  const x = Math.round(minX + ((maxX - minX) * xPercent) / 100);
  const y = Math.round(minY + ((maxY - minY) * yPercent) / 100);

  return {
    x,
    y,
    width,
    height,
    radius,
    minX,
    maxX,
    minY,
    maxY,
  };
}

function drawOverlayCard(context: CanvasRenderingContext2D, overlay: SocialImageOverlayDraft) {
  const layout = getOverlayCardLayout(overlay);
  const cardX = layout.x;
  const cardY = layout.y;
  const cardWidth = layout.width;
  const cardHeight = layout.height;
  const cardRadius = layout.radius;

  const light = overlay.theme === "light-card";
  const layoutStyle = overlay.layoutStyle || "soft-editorial";
  const isClean = layoutStyle === "clean-minimal";
  const isPromo = layoutStyle === "classic-promo";
  const cardBg = light
    ? isClean
      ? "rgba(252, 249, 245, 0.90)"
      : "rgba(250, 247, 242, 0.94)"
    : isClean
      ? "rgba(20, 24, 29, 0.80)"
      : "rgba(24, 28, 32, 0.86)";
  const cardStroke = light
    ? isClean
      ? "rgba(89, 70, 54, 0.10)"
      : "rgba(89, 70, 54, 0.14)"
    : isClean
      ? "rgba(241, 231, 219, 0.14)"
      : "rgba(241, 231, 219, 0.20)";
  const textPrimary = light ? "#33251d" : "#f4efe8";
  const textSecondary = light ? "#4b3a2d" : "#e1d8cd";
  const textMuted = light ? "#746152" : "#c7bbad";
  const scale = cardWidth / 688;
  const s = (value: number) => Math.max(1, Math.round(value * scale));

  context.save();
  context.shadowColor = light ? "rgba(67, 45, 29, 0.10)" : "rgba(6, 8, 11, 0.35)";
  context.shadowBlur = s(isClean ? 20 : 28);
  context.shadowOffsetY = s(isClean ? 8 : 12);
  context.fillStyle = cardBg;
  drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, cardRadius);
  context.fill();
  context.restore();

  context.strokeStyle = cardStroke;
  context.lineWidth = Math.max(1, scale);
  drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, cardRadius);
  context.stroke();

  const textX = cardX + s(56);
  const maxTextWidth = cardWidth - s(112);
  let cursorY = cardY + s(88);

  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  context.fillStyle = textSecondary;
  context.font = isClean
    ? `500 ${s(38)}px "Cormorant Garamond", Georgia, serif`
    : `600 ${s(44)}px "Cormorant Garamond", Georgia, serif`;
  const businessLines = wrapText(context, overlay.businessName, maxTextWidth, 1).lines;
  for (const line of businessLines) {
    context.fillText(line, textX, cursorY);
    cursorY += s(54);
  }

  context.strokeStyle = light ? "rgba(96, 76, 60, 0.24)" : "rgba(233, 224, 214, 0.30)";
  context.lineWidth = Math.max(1, s(1.5));
  context.beginPath();
  context.moveTo(textX, cursorY - s(16));
  context.lineTo(textX + s(140), cursorY - s(16));
  context.stroke();

  context.fillStyle = textPrimary;
  context.font = isPromo
    ? `700 ${s(102)}px "Cormorant Garamond", Georgia, serif`
    : isClean
      ? `700 ${s(84)}px "Cormorant Garamond", Georgia, serif`
      : `700 ${s(92)}px "Cormorant Garamond", Georgia, serif`;
  const discountLines = wrapText(context, overlay.discountLine, maxTextWidth, 1).lines;
  for (const line of discountLines) {
    context.fillText(line, textX, cursorY + s(48));
    cursorY += s(102);
  }

  context.fillStyle = textPrimary;
  context.font = isClean
    ? `600 ${s(56)}px "Cormorant Garamond", Georgia, serif`
    : `600 ${s(68)}px "Cormorant Garamond", Georgia, serif`;
  const titleLines = wrapText(context, overlay.titleLine, maxTextWidth, isClean ? 2 : 3).lines;
  for (const line of titleLines) {
    context.fillText(line, textX, cursorY + s(20));
    cursorY += s(78);
  }

  context.fillStyle = textMuted;
  context.font = isClean
    ? `500 ${s(26)}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`
    : `500 ${s(30)}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;
  const dateLines = wrapText(context, overlay.dateLine, maxTextWidth, 1).lines;
  for (const line of dateLines) {
    context.fillText(line, textX, cursorY + s(14));
    cursorY += s(48);
  }

  context.fillStyle = textSecondary;
  context.font = isClean
    ? `400 ${s(27)}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`
    : `400 ${s(30)}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;
  const supportLines = wrapText(context, overlay.supportLine, maxTextWidth, isClean ? 2 : 3).lines;
  for (const line of supportLines) {
    context.fillText(line, textX, cursorY + s(12));
    cursorY += s(42);
  }

  context.font = isClean
    ? `600 ${s(29)}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`
    : `600 ${s(32)}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;
  const ctaText =
    wrapText(context, overlay.ctaLine, maxTextWidth, 1).lines[0] || "Book now";
  const ctaWidth = Math.min(
    maxTextWidth,
    Math.max(s(280), context.measureText(ctaText).width + s(74)),
  );
  const ctaHeight = s(66);
  const ctaX = textX;
  const ctaTop = cardY + cardHeight - ctaHeight - s(52);

  context.fillStyle = light ? "rgba(244, 236, 229, 0.90)" : "rgba(49, 58, 66, 0.92)";
  drawRoundedRect(context, ctaX, ctaTop, ctaWidth, ctaHeight, s(33));
  context.fill();
  context.strokeStyle = light ? "rgba(96, 76, 60, 0.20)" : "rgba(233, 224, 214, 0.18)";
  context.lineWidth = Math.max(1, scale);
  drawRoundedRect(context, ctaX, ctaTop, ctaWidth, ctaHeight, s(33));
  context.stroke();


  context.fillStyle = textPrimary;
  context.textBaseline = "middle";
  context.fillText(ctaText, ctaX + s(34), ctaTop + ctaHeight / 2 + 1);
}

export function renderComposedCanvas(
  background: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  overlay: SocialImageOverlayDraft,
) {
  const canvas = document.createElement("canvas");
  canvas.width = SOCIAL_IMAGE_WIDTH;
  canvas.height = SOCIAL_IMAGE_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable in this browser.");
  }

  drawBackgroundCover(context, background, sourceWidth, sourceHeight);
  drawOverlayCard(context, overlay);
  return canvas;
}

export async function canvasToFile(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Unable to export composed image."));
        return;
      }
      resolve(value);
    }, "image/png");
  });

  return new File([blob], fileName, { type: "image/png" });
}
