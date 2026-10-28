"use client";

import { createContext, useContext, type ReactNode } from "react";

export type OwnerWorkspaceBasePath = "/app" | "/owner-dashboard-preview";

const OwnerWorkspaceBaseContext = createContext<OwnerWorkspaceBasePath>(
  "/owner-dashboard-preview",
);

export function OwnerWorkspaceBaseProvider({
  basePath,
  children,
}: {
  basePath: OwnerWorkspaceBasePath;
  children: ReactNode;
}) {
  return (
    <OwnerWorkspaceBaseContext.Provider value={basePath}>
      {children}
    </OwnerWorkspaceBaseContext.Provider>
  );
}

export function useOwnerWorkspaceBasePath() {
  return useContext(OwnerWorkspaceBaseContext);
}

export function ownerWorkspaceHref(
  basePath: OwnerWorkspaceBasePath,
  businessSlug: string,
  suffix = "",
) {
  return `${basePath}/${encodeURIComponent(businessSlug)}${suffix}`;
}
