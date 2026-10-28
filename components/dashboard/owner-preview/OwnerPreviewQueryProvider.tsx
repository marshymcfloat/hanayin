"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createOwnerPreviewQueryClient,
  type OwnerPreviewIdentity,
} from "@/components/dashboard/owner-preview/owner-preview-query";

type OwnerPreviewContextValue = {
  identity: OwnerPreviewIdentity;
  revoke: () => void;
};

const OwnerPreviewContext = createContext<OwnerPreviewContextValue | null>(null);

function useOwnerPreviewValue() {
  const context = useContext(OwnerPreviewContext);
  if (!context) throw new Error("Owner preview context is unavailable");
  return context;
}

export function useOwnerPreviewContext() {
  return useOwnerPreviewValue().identity;
}

export function useOwnerPreviewRevoke() {
  return useOwnerPreviewValue().revoke;
}

export function useOwnerPreviewFetch() {
  const { revoke } = useOwnerPreviewValue();

  return useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 401 || response.status === 403) {
      revoke();
      throw new Error("Owner preview access has expired");
    }
    if (!response.ok) throw new Error("Could not refresh owner preview data");
    return response.json() as Promise<T>;
  }, [revoke]);
}

export function OwnerPreviewQueryProvider({
  identity,
  children,
}: {
  identity: OwnerPreviewIdentity;
  children: ReactNode;
}) {
  const [queryClient] = useState(createOwnerPreviewQueryClient);
  const [revoked, setRevoked] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionMismatch = status === "unauthenticated" || (
    status === "authenticated" && (
      session?.user?.id !== identity.userId ||
      session?.user?.role !== "OWNER" ||
      session?.user?.businessSlug !== identity.businessSlug
    )
  );

  const revoke = useCallback(() => {
    queryClient.clear();
    setRevoked(true);
    router.replace("/");
  }, [queryClient, router]);

  useEffect(() => {
    if (sessionMismatch) {
      queryClient.clear();
      router.replace("/");
    }
  }, [queryClient, router, sessionMismatch]);

  if (sessionMismatch || revoked) return null;

  return (
    <OwnerPreviewContext.Provider value={{ identity, revoke }}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </OwnerPreviewContext.Provider>
  );
}
