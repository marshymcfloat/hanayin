import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCustomerTrust } from "./booking-otp";

const prismaMock = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  customer: { findFirst: vi.fn(), updateMany: vi.fn() },
  booking: { findFirst: vi.fn() },
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/sms-otp", () => ({
  normalizePhilippinePhone: (phone: string) => phone.replace(/\D/g, ""),
  sendSemaphoreOtp: vi.fn(),
}));

describe("resolveCustomerTrust", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_1" });
  });

  it("requires OTP and withholds identity data for returning customers", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer_1",
      trust_tier: "TRUSTED",
    });

    const result = await resolveCustomerTrust("09171234567", "beautyfeel");

    expect(result).toEqual({ tier: "TRUSTED", requiresOtp: true });
    expect(result).not.toHaveProperty("customerName");
    expect(result).not.toHaveProperty("customerEmail");
  });

  it("keeps OTP required when completed history promotes a customer", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer_1",
      trust_tier: "NEW",
    });
    prismaMock.booking.findFirst.mockResolvedValue({ id: 123 });
    prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });

    const result = await resolveCustomerTrust("09171234567", "beautyfeel");

    expect(result).toEqual({ tier: "TRUSTED", requiresOtp: true });
  });
});
