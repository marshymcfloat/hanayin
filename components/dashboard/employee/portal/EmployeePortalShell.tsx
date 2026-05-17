/**
 * EmployeePortalShell — historic alias for the generic PortalShell
 * primitive. Kept as a re-export so existing employee-dashboard
 * imports (`EmployeePortalShell` named import) continue to work
 * without churn while the public booking page consumes the same
 * chrome from `@/components/portal/PortalShell`.
 *
 * New code should import directly from `@/components/portal/PortalShell`.
 */
export {
  PortalShell as EmployeePortalShell,
  type PortalShellProps as EmployeePortalShellProps,
} from "@/components/portal/PortalShell";
