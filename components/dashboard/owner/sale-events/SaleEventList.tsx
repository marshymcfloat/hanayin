"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { Trash2, Percent, Calendar, Sparkles } from "lucide-react";
import { DiscountType } from "@/prisma/generated/prisma/enums";
import type { SocialPostStatus } from "@/prisma/generated/prisma/enums";
import type { SaleEventRef } from "@/lib/utils/pricing";
import { EditSaleEventDialog } from "./EditSaleEventDialog";
import {
  buildGrowthFlowQuery,
  type GrowthFlowContext,
} from "../growth/types";

export interface SaleEvent {
  id: number;
  title: string;
  description: string | null;
  start_date: Date;
  end_date: Date;
  discount_type: DiscountType;
  discount_value: number;
  slot_limit: number | null;
  applicable_services: SaleEventRef[];
  applicable_packages: SaleEventRef[];
  social_posts?: { id: string; status: SocialPostStatus }[];
  _count?: { bookings: number };
}

interface SaleEventListProps {
  businessSlug: string;
  events: SaleEvent[];
  services: { id: number; name: string; category: string }[];
  packages: { id: number; name: string }[];
  onDelete: (id: number) => void;
  flowContext?: GrowthFlowContext;
}

const STATUS_PRIORITY: SocialPostStatus[] = [
  "FAILED",
  "READY",
  "DRAFT",
  "PUBLISHING",
  "PUBLISHED",
  "CANCELLED",
];

export function getSocialSummaryLabel(
  socialPosts?: { status: SocialPostStatus }[],
): string | null {
  if (!socialPosts || socialPosts.length === 0) {
    return null;
  }

  if (socialPosts.some((post) => post.status === "FAILED")) {
    return "Needs attention";
  }
  if (socialPosts.some((post) => post.status === "READY")) {
    return "Ready to publish";
  }
  if (socialPosts.some((post) => post.status === "DRAFT")) {
    return "Draft";
  }
  if (socialPosts.some((post) => post.status === "PUBLISHING")) {
    return "Publishing";
  }
  if (socialPosts.some((post) => post.status === "PUBLISHED")) {
    return "Published";
  }

  return null;
}

export function getPrioritySocialPostId(
  socialPosts?: { id: string; status: SocialPostStatus }[],
): string | null {
  if (!socialPosts || socialPosts.length === 0) {
    return null;
  }

  for (const status of STATUS_PRIORITY) {
    const found = socialPosts.find((post) => post.status === status);
    if (found) {
      return found.id;
    }
  }

  return socialPosts[0]?.id || null;
}

export function SaleEventList({
  businessSlug,
  events,
  services,
  packages,
  onDelete,
  flowContext,
}: SaleEventListProps) {
  const getStatusBadge = (event: SaleEvent) => {
    const now = new Date();
    const start = new Date(event.start_date);
    const end = new Date(event.end_date);

    if (now > end) {
      return (
        <Badge
          variant="destructive"
          className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
        >
          Expired
        </Badge>
      );
    }
    if (now < start) {
      return (
        <Badge
          variant="secondary"
          className="border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-100"
        >
          Upcoming
        </Badge>
      );
    }
    return (
      <Badge className="border border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
        Active
      </Badge>
    );
  };

  if (events.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 bg-muted rounded-xl flex items-center justify-center mb-4">
          <Percent className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No sale events yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create a new sale event to attract more customers and boost your revenue.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {events.map((event) => {
          const socialSummary = getSocialSummaryLabel(event.social_posts);
          const socialPostId = getPrioritySocialPostId(event.social_posts);
          const reviewHref = socialPostId
            ? `/app/${businessSlug}/social-posts?${buildGrowthFlowQuery({
                step: 3,
                source: "sale-events",
                opportunityId: flowContext?.opportunityId,
                saleEventId: event.id,
                socialPostId,
              })}`
            : null;

          return (
            <div
              key={event.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-accent/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary/60" />
                      <span className="text-sm font-semibold tracking-wide text-foreground truncate">
                        {event.title}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-lg font-bold text-foreground">
                      {event.discount_type === "PERCENTAGE"
                        ? `${event.discount_value}% OFF`
                        : `${formatCurrency(event.discount_value)} OFF`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {event.applicable_services.length} Services,{" "}
                      {event.applicable_packages.length} Packages
                    </span>
                    {event.slot_limit !== null && (
                      <span className="text-xs font-medium text-amber-700">
                        {event._count?.bookings ?? 0}/{event.slot_limit} slots claimed
                      </span>
                    )}
                    {socialSummary ? (
                      <span className="text-xs text-muted-foreground">
                        Social: {socialSummary}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="-mr-2 flex items-center gap-0.5 shrink-0">
                  <EditSaleEventDialog
                    businessSlug={businessSlug}
                    event={event}
                    services={services}
                    packages={packages}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    onClick={() => onDelete(event.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-xs font-medium">
                    {format(new Date(event.start_date), "MMM d")} –{" "}
                    {format(new Date(event.end_date), "MMM d, yyyy")}
                  </span>
                </div>
                {getStatusBadge(event)}
              </div>

              {reviewHref ? (
                <Link
                  href={reviewHref}
                  className="inline-flex w-fit rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  Review post (Step 3)
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/50">
              <TableHead className="h-12 w-[220px] pl-6 font-semibold text-muted-foreground">
                Event Name
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">
                Discount
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">Scope</TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">
                Duration
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-12 font-semibold text-muted-foreground">
                Social
              </TableHead>
              <TableHead className="h-12 w-[160px] pr-6 text-right font-semibold text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const socialSummary = getSocialSummaryLabel(event.social_posts);
              const socialPostId = getPrioritySocialPostId(event.social_posts);
              const reviewHref = socialPostId
                ? `/app/${businessSlug}/social-posts?${buildGrowthFlowQuery({
                    step: 3,
                    source: "sale-events",
                    opportunityId: flowContext?.opportunityId,
                    saleEventId: event.id,
                    socialPostId,
                  })}`
                : null;

              return (
                <TableRow
                  key={event.id}
                  className="group border-border transition-colors hover:bg-accent/30"
                >
                  <TableCell className="py-4 pl-6">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1 w-fit max-w-[180px]">
                      <Sparkles className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">
                        {event.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">
                        {event.discount_type === "PERCENTAGE"
                          ? `${event.discount_value}%`
                          : formatCurrency(event.discount_value)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.discount_type === "PERCENTAGE"
                          ? "Percentage"
                          : "Flat Amount"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{event.applicable_services.length + event.applicable_packages.length} Items</span>
                      {event.slot_limit !== null && (
                        <span className="text-xs font-medium text-amber-700">
                          {event._count?.bookings ?? 0}/{event.slot_limit} slots
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-muted-foreground">
                    <div className="flex flex-col text-xs">
                      <span>{format(new Date(event.start_date), "MMM d, yyyy")}</span>
                      <span className="text-muted-foreground/50">to</span>
                      <span>{format(new Date(event.end_date), "MMM d, yyyy")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">{getStatusBadge(event)}</TableCell>
                  <TableCell className="py-4 text-sm text-muted-foreground">
                    {socialSummary || "—"}
                  </TableCell>
                  <TableCell className="py-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {reviewHref ? (
                        <Button asChild variant="outline" size="sm" className="rounded-lg text-xs h-7 cursor-pointer">
                          <Link href={reviewHref}>Review post</Link>
                        </Button>
                      ) : null}
                      <EditSaleEventDialog
                        businessSlug={businessSlug}
                        event={event}
                        services={services}
                        packages={packages}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                        onClick={() => onDelete(event.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
