"use client";

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";

function SessionRecovery() {
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const isPrivateRoute = pathname === "/app" || pathname.startsWith("/app/") ||
      pathname === "/platform" || pathname.startsWith("/platform/");
    if (status === "unauthenticated" && isPrivateRoute) {
      window.location.replace("/login");
    }
  }, [status, pathname]);

  return null;
}

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider refetchInterval={60} refetchOnWindowFocus>
      <Suspense fallback={null}>
        <SessionRecovery />
      </Suspense>
      {children}
    </NextAuthSessionProvider>
  );
}
