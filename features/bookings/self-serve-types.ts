import type { SelfServeWindow } from "@/lib/services/booking-self-serve-policy";

export type BookingForManage = {
  bookingId: number;
  businessSlug: string;
  businessName: string;
  scheduledAt: string;
  estimatedEnd: string | null;
  totalPrice: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  amountPaid: number;
  serviceNames: string[];
  serviceIds: number[];
  customerName: string | null;
  status: "HOLD" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  cancelled: boolean;
  rescheduleCount: number;
  window: SelfServeWindow;
};
