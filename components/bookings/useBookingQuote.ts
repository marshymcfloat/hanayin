"use client";
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { quoteBookingAction } from "@/features/bookings/actions/booking-quote";
import type { BookingServiceInput } from "@/features/bookings/services/booking-pricing";

export function useBookingQuote(input: { businessSlug: string; scheduledAt: Date; services: BookingServiceInput[]; paymentMethod: "CASH" | "ONLINE"; paymentType: "FULL" | "DOWNPAYMENT"; voucherCode?: string }) {
  const instance = useId();
  const key = ["booking-quote", instance, JSON.stringify(input)] as const;
  const query = useQuery({ queryKey: key, queryFn: async () => {
    const result = await quoteBookingAction(input);
    if (!result.success) throw new Error(result.error);
    return result.quote;
  }, enabled: Boolean(input.businessSlug && input.services.length), staleTime: 10_000, gcTime: 0, retry: false, refetchOnWindowFocus: false });
  return { ...query, key };
}
