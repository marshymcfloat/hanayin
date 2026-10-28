import type { BookingPaymentStage } from "@/lib/utils/booking-payment-stage";

export type OwnerBookingPreviewItem = {
  id: number;
  status: "HOLD" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  paymentStage: BookingPaymentStage;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  paymentMethod: string;
  customerName: string;
  scheduledAt: string | null;
  estimatedEnd: string | null;
  services: string[];
  providers: string[];
  total: number;
  paid: number;
};

export type OwnerBookingList = {
  bookings: OwnerBookingPreviewItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type OwnerBookingSummary = {
  date: string;
  totalBookings: number;
  acceptedCount: number;
  holdCount: number;
  amountReceived: number;
  openBalance: number;
  pendingGcashCount: number;
  pendingGcash: {
    bookingId: number;
    customerName: string;
    scheduledAt: string | null;
    services: string[];
    amount: number;
    escalated: boolean;
  } | null;
};
