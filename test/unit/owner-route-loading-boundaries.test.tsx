import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";
import AttendanceLoading from "@/app/(private)/app/[businessSlug]/attendance/loading";
import BusinessHoursLoading from "@/app/(private)/app/[businessSlug]/business-hours/loading";
import CustomersLoading from "@/app/(private)/app/[businessSlug]/customers/loading";
import SaleEventsLoading from "@/app/(private)/app/[businessSlug]/sale-events/loading";

type LoadingElement = ReactElement<{ section: string; staffFallback: ReactNode }>;

describe("owner route loading boundaries", () => {
  it.each([
    ["attendance", AttendanceLoading],
    ["business hours", BusinessHoursLoading],
    ["customers", CustomersLoading],
    ["sale events", SaleEventsLoading],
  ])("uses the matching owner skeleton and retains the staff fallback for %s", (section, Loading) => {
    const element = Loading() as LoadingElement;
    expect(element.type).toBe(OwnerRouteLoading);
    expect(element.props.section).toBe(section);
    expect(element.props.staffFallback).toBeTruthy();
  });
});
