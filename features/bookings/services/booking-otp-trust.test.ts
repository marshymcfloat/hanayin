// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCustomerTrust } from "./booking-otp";
vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  customer: { findFirst: vi.fn(), updateMany: vi.fn() },
  booking: { findFirst: vi.fn() },
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/sms-otp", () => ({
  normalizePhilippinePhone: (phone: string) => "63" + phone.slice(1),
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

  it("requires OTP for a missing business or customer", async () => {
    prismaMock.business.findUnique.mockResolvedValueOnce(null);
    await expect(resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "NEW", requiresOtp: true });
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    prismaMock.customer.findFirst.mockResolvedValue(null);
    await expect(resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "NEW", requiresOtp: true });
  });

  it("does not promote new customers without completed history", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "customer_1", trust_tier: "NEW" });
    prismaMock.booking.findFirst.mockResolvedValue(null);
    await expect(resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "NEW", requiresOtp: true });
    expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
  });

  it("preserves restrictions", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "customer_1", trust_tier: "RESTRICTED" });
    await expect(resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "RESTRICTED", requiresOtp: true });
    expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
  });

  it("does not override a concurrent restriction during trust promotion", async () => {
    prismaMock.customer.findFirst.mockResolvedValueOnce({ id: "customer_1", trust_tier: "NEW" });
    prismaMock.customer.findFirst.mockResolvedValueOnce({ trust_tier: "RESTRICTED" });
    prismaMock.booking.findFirst.mockResolvedValue({ id: 123 });
    prismaMock.customer.updateMany.mockResolvedValue({ count: 0 });
    await expect(resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "RESTRICTED", requiresOtp: true });
    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1", business_id: "biz_1", trust_tier: "NEW" }, data: { trust_tier: "TRUSTED" },
    });
    expect(prismaMock.customer.findFirst).toHaveBeenLastCalledWith({
      where: { id: "customer_1", business_id: "biz_1" }, select: { trust_tier: true },
    });
  });
});
