export type CustomerSearchHit = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  trust_tier: string;
  no_show_count: number;
  /**
   * The most recent booking date, if any. Lets the picker show
   * "Last visit: Apr 12" so staff can disambiguate similarly-named records.
   */
  lastBookingAt: Date | null;
};

export type FlowDelayUnit = "DAYS" | "WEEKS" | "MONTHS";
export type FlowType = "REQUIRED" | "SUGGESTED";

export type CustomerFlowStatus = {
  triggerServiceId: number;
  triggerServiceName: string;
  suggestedServiceId: number;
  suggestedServiceName: string;
  flowType: FlowType;
  status: "PENDING" | "COMPLETED";
  dueDate: Date;
  completedAt?: Date | null;
  lastServiceDate: Date;
  delayDuration: number;
  delayUnit: FlowDelayUnit;
};

export type CustomerBookingHistoryItem = {
  id: number;
  status: string;
  payment_method: string;
  scheduled_at: Date | null;
  estimated_end: Date | null;
  created_at: Date;
  grand_total: number;
  total_discount: number;
  downpayment: number | null;
  availed_services: {
    id: number;
    status: string;
    scheduled_at: Date | null;
    estimated_end: Date | null;
    final_price: number;
    service: { name: string } | null;
  }[];
};

export type CustomerHistoryData = {
  bookings: CustomerBookingHistoryItem[];
  nextAppointment: {
    bookingId: number;
    scheduledAt: Date;
    estimatedEnd: Date | null;
    services: string[];
  } | null;
  flowStatus: CustomerFlowStatus[];
};
