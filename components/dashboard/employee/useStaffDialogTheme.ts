"use client";

import { useOptionalViewer } from "@/lib/auth/viewer-context";
import staffTheme from "./StaffWorkspaceTheme.module.css";

export function useStaffDialogTheme() {
  return useOptionalViewer()?.actorType === "EMPLOYEE" ? staffTheme.workspace : "";
}
