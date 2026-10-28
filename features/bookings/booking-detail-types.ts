export type GetBookingDetailResult =
  | { success: true; booking: BookingDetailPayload }
  | { success: false; error: string };

// Serializable lazy-panel contract, independent of persistence records.
export type BookingDetailPayload = {
  id: number;
  status: "HOLD" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    trust_tier: string;
    no_show_count: number;
  } | null;
  is_anonymous_walk_in: boolean;
  customer_label: string | null;
  payment_method: "CASH" | "ONLINE" | "GCASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
  payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  amount_paid: number;
  grand_total: number;
  total_discount: number;
  downpayment: number | null;
  downpayment_status: "HOLD" | "ACCEPTED" | "COMPLETED" | "CANCELLED" | null;
  scheduled_at: string | null;
  estimated_end: string | null;
  created_at: string;
  hold_expires_at: string | null;
  cancelled_at: string | null;
  business_id: string;
  payments: Array<{
    id: number;
    type: "DOWNPAYMENT" | "BALANCE" | "FULL" | "MANUAL";
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "CANCELED";
    payment_method: "CASH" | "ONLINE" | "GCASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
    amount_principal: number;
    payer_name: string | null;
    provider_reference: string | null;
    submitted_at: string | null;
    verified_at: string | null;
    verified_by: { name: string } | null;
    paid_at: string | null;
    escalated_at: string | null;
    escalation_reason: string | null;
    rejection_reason: string | null;
    resolution_outcome: string | null;
    resolution_note: string | null;
    void_reason: string | null;
  }>;
  vouchers: Array<{ id: number; code: string }>;
  availed_services: Array<{
    id: number;
    served_by_id: number | null;
    service: { id: number; name: string; category: string };
    served_by: { id: number; user: { name: string } } | null;
    served_by_owner: { id: number; user: { name: string } } | null;
    final_price: number;
    discount: number;
    price: number;
    status:
      | "PENDING"
      | "CLAIMED"
      | "SERVING"
      | "COMPLETED"
      | "CANCELLED";
  }>;
};
