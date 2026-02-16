"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

function ToastManagerImpl() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success) {
      toast.success(success);
      // Clean up params
      const params = new URLSearchParams(searchParams.toString());
      params.delete("success");
      router.replace(`${pathname}?${params.toString()}`);
    }

    if (error) {
      toast.error(error);
      // Clean up params
      const params = new URLSearchParams(searchParams.toString());
      params.delete("error");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [searchParams, pathname, router]);

  return null;
}

export function PlatformToastManager() {
  return (
    <Suspense fallback={null}>
      <ToastManagerImpl />
    </Suspense>
  );
}

// Keep helper functions for building paths with params
export function buildPlatformErrorPath(pathname: string, message: string) {
  const params = new URLSearchParams();
  params.set("error", message);
  return `${pathname}?${params.toString()}`;
}

export function buildPlatformSuccessPath(pathname: string, message: string) {
  const params = new URLSearchParams();
  params.set("success", message);
  return `${pathname}?${params.toString()}`;
}
