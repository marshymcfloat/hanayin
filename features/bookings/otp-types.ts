export type CustomerTrust = "NEW" | "TRUSTED" | "RESTRICTED";

export interface CustomerTrustResult {
  tier: CustomerTrust;
  requiresOtp: boolean;
  customerName?: string;
  customerEmail?: string;
}

export interface RequestOtpResult {
  success: boolean;
  error?: string;
  cooldownSeconds?: number;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  verificationId?: number;
  verificationToken?: string;
  customerTier?: CustomerTrust;
  customerName?: string;
  customerEmail?: string;
}
