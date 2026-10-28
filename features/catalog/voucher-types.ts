export type CreateVoucherInput = {
  code: string;
  type: "PERCENTAGE" | "FLAT";
  value: number;
  minimum_amount: number;
  expires_at: Date;
};
export type VerifyVoucherResult = {
  success: boolean;
  error?: string;
  data?: { id: number; code: string; type: "PERCENTAGE" | "FLAT"; value: number; discountAmount: number; finalPrice: number; minAmount: number };
};
