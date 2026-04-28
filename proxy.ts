import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function getApiRateLimitConfig(pathname: string) {
  if (pathname.startsWith("/api/auth")) {
    return {
      windowMs: 60 * 1000,
      maxRequests: 30,
      namespace: "service-flow:rate-limit:auth",
      onStoreError: "deny" as const,
    };
  }

  if (pathname.startsWith("/api/cron")) {
    return {
      windowMs: 60 * 1000,
      maxRequests: 240,
      namespace: "service-flow:rate-limit:cron",
      onStoreError: "allow" as const,
    };
  }

  return {
    windowMs: 60 * 1000,
    maxRequests: 120,
    namespace: "service-flow:rate-limit:api",
    onStoreError: "memory" as const,
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/.well-known/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const forwardedFor = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const ip = forwardedFor.split(",")[0]?.trim() || "127.0.0.1";
    const result = await rateLimit(
      `${pathname}:${ip}`,
      getApiRateLimitConfig(pathname),
    );

    if (!result.success) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000),
      );
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.reset),
          },
        },
      );
    }

    return NextResponse.next();
  }

  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  const isPlatformRoute =
    pathname === "/platform" || pathname.startsWith("/platform/");
  const requiresToken = pathname === "/" || isAppRoute || isPlatformRoute;

  const token = requiresToken
    ? await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      })
    : null;
  const isAuthenticated = !!token;
  const role = token?.role as string | undefined;
  const isPlatformAdmin = role === "PLATFORM_ADMIN";

  if (isAppRoute) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (isPlatformAdmin) {
      return NextResponse.redirect(new URL("/platform", request.url));
    }
  }

  if (isPlatformRoute) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (!isPlatformAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (
    isAppRoute &&
    token?.mustChangePassword &&
    !isPlatformAdmin
  ) {
    const segments = pathname.split("/").filter(Boolean);
    const businessSlug = segments[1];
    if (businessSlug) {
      const changePath = `/app/${businessSlug}/change-password`;
      if (!pathname.startsWith(changePath)) {
        return NextResponse.redirect(new URL(changePath, request.url));
      }
    }
  }

  if (isAppRoute && !isPlatformAdmin) {
    const segments = pathname.split("/").filter(Boolean);
    const routeBusinessSlug = segments[1];
    const tokenBusinessSlug = token?.businessSlug as string | undefined;
    if (
      routeBusinessSlug &&
      tokenBusinessSlug &&
      routeBusinessSlug !== tokenBusinessSlug
    ) {
      return NextResponse.redirect(new URL(`/app/${tokenBusinessSlug}`, request.url));
    }
  }

  if (pathname === "/" && isAuthenticated) {
    if (isPlatformAdmin) {
      return NextResponse.redirect(new URL("/platform", request.url));
    }
    const businessSlug = token?.businessSlug as string | undefined;
    if (businessSlug) {
      return NextResponse.redirect(
        new URL(`/app/${businessSlug}`, request.url),
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*", "/platform/:path*", "/api/:path*"],
};
