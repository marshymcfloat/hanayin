export type AttendanceImpactBooking = {
  bookingId: number;
  scheduledAt: string | null;
  estimatedEnd: string | null;
  customerName: string | null;
  customerPhone: string | null;
  serviceNames: string[];
  totalPrice: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
};
