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
  applicable_services: SaleEventRef[];
  applicable_packages: SaleEventRef[];
  social_posts?: { id: string; status: SocialPostStatus }[];
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
      <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Active
      </Badge>
    );
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-16 text-center">
        <div className="mb-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition-transform duration-300 hover:scale-105">
          <Percent className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-zinc-900">
          No sale events yet
        </h3>
        <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
          Create a new sale event to attract more customers and boost your
          revenue.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:hidden">
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
              className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition-all active:scale-[0.99] active:bg-zinc-50/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-1">
                      <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="text-sm font-medium tracking-wide text-zinc-900">
                        {event.title}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1 text-lg font-bold text-zinc-900">
                      {event.discount_type === "PERCENTAGE"
                        ? `${event.discount_value}% OFF`
                        : `PHP ${event.discount_value.toFixed(2)} OFF`}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {event.applicable_services.length} Services,{" "}
                      {event.applicable_packages.length} Packages
                    </span>
                    {socialSummary ? (
                      <span className="text-xs text-zinc-600">
                        Social status: {socialSummary}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="-mr-2 flex items-center gap-1">
                  <EditSaleEventDialog
                    businessSlug={businessSlug}
                    event={event}
                    services={services}
                    packages={packages}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => onDelete(event.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between border-t border-zinc-50 pt-3">
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">
                    {format(new Date(event.start_date), "MMM d")} -{" "}
                    {format(new Date(event.end_date), "MMM d, yyyy")}
                  </span>
                </div>
                {getStatusBadge(event)}
              </div>

              {reviewHref ? (
                <Link
                  href={reviewHref}
                  className="inline-flex w-fit rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700"
                >
                  Review post (Step 3)
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
            <TableRow className="border-zinc-100 hover:bg-transparent">
              <TableHead className="h-12 w-[200px] pl-6 font-semibold text-zinc-500">
                Event Name
              </TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">
                Discount
              </TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">Scope</TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">
                Duration
              </TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">
                Status
              </TableHead>
              <TableHead className="h-12 font-semibold text-zinc-500">
                Social
              </TableHead>
              <TableHead className="h-12 w-[160px] pr-6 text-right font-semibold text-zinc-500">
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
                  className="group border-zinc-100 transition-colors hover:bg-zinc-50/50"
                >
                  <TableCell className="py-4 pl-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-zinc-100 bg-zinc-50/50 px-2.5 py-1 transition-colors group-hover:bg-white">
                        <Sparkles className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-emerald-500" />
                        <span className="text-sm font-medium text-zinc-700">
                          {event.title}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-zinc-900">
                        {event.discount_type === "PERCENTAGE"
                          ? `${event.discount_value}%`
                          : `PHP ${event.discount_value.toFixed(2)}`}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {event.discount_type === "PERCENTAGE"
                          ? "Percentage"
                          : "Flat Amount"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 font-medium text-zinc-600">
                    {event.applicable_services.length + event.applicable_packages.length} Items
                  </TableCell>
                  <TableCell className="py-4 text-zinc-600">
                    <div className="flex flex-col text-xs">
                      <span>{format(new Date(event.start_date), "MMM d, yyyy")}</span>
                      <span className="text-zinc-400">to</span>
                      <span>{format(new Date(event.end_date), "MMM d, yyyy")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">{getStatusBadge(event)}</TableCell>
                  <TableCell className="py-4 text-sm text-zinc-600">
                    {socialSummary || "No post draft"}
                  </TableCell>
                  <TableCell className="py-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {reviewHref ? (
                        <Button asChild variant="outline" size="sm">
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
                        className="h-8 w-8 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
