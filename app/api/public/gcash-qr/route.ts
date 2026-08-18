import { NextResponse } from "next/server";
import { prisma } from "@/prisma/prisma";

const MAX_QR_DOWNLOAD_BYTES = 2 * 1024 * 1024;

function isTrustedBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const businessSlug = new URL(request.url).searchParams.get("businessSlug")?.trim();
  if (!businessSlug || businessSlug.length > 100) {
    return NextResponse.json({ error: "Invalid business." }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { gcash_qr_image_url: true },
  });
  const qrUrl = business?.gcash_qr_image_url;
  if (!qrUrl || !isTrustedBlobUrl(qrUrl)) {
    return NextResponse.json({ error: "QR code unavailable." }, { status: 404 });
  }

  const response = await fetch(qrUrl, {
    signal: AbortSignal.timeout(5_000),
    redirect: "error",
  }).catch(() => null);
  if (!response?.ok || response.headers.get("content-type") !== "image/png") {
    return NextResponse.json({ error: "QR code unavailable." }, { status: 502 });
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_QR_DOWNLOAD_BYTES) {
    return NextResponse.json({ error: "QR code unavailable." }, { status: 502 });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_QR_DOWNLOAD_BYTES) {
    return NextResponse.json({ error: "QR code unavailable." }, { status: 502 });
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${businessSlug}-gcash-qr.png"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
