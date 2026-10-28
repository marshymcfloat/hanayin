"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useOwnerWorkspaceBasePath } from "@/components/dashboard/owner-preview/owner-preview-routing";

export function OwnerWorkspaceLink({ href, ...props }: ComponentProps<typeof Link>) {
  const basePath = useOwnerWorkspaceBasePath();
  const resolvedHref = typeof href === "string" && href.startsWith("/owner-dashboard-preview/")
    ? `${basePath}${href.slice("/owner-dashboard-preview".length)}`
    : href;
  return <Link {...props} href={resolvedHref} />;
}
