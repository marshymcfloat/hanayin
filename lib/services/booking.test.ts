import { describe, expect, it, vi } from "vitest";
import {
  findExistingCustomerByContact,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "./customer-matching";

describe("customer contact normalization", () => {
  it("normalizes email to lowercase and trims whitespace", () => {
    expect(normalizeCustomerEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("returns undefined for blank email", () => {
    expect(normalizeCustomerEmail("   ")).toBeUndefined();
  });

  it("trims phone and keeps exact digits/symbols", () => {
    expect(normalizeCustomerPhone("  +63 917 123 4567  ")).toBe(
      "+63 917 123 4567",
    );
  });

  it("returns undefined for blank phone", () => {
    expect(normalizeCustomerPhone("   ")).toBeUndefined();
  });
});

describe("findExistingCustomerByContact", () => {
  it("looks up by email first using deterministic oldest ordering", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "cus_1", email: "a@x.com", phone: null });

    const result = await findExistingCustomerByContact({
      customerDelegate: { findFirst },
      businessId: "biz_1",
      email: "a@x.com",
      phone: "+639171234567",
    });

    expect(result?.id).toBe("cus_1");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        business_id: "biz_1",
        email: { equals: "a@x.com", mode: "insensitive" },
      },
      orderBy: { created_at: "asc" },
    });
  });

  it("falls back to phone when email has no match", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "cus_2",
        email: null,
        phone: "+639171234567",
      });

    const result = await findExistingCustomerByContact({
      customerDelegate: { findFirst },
      businessId: "biz_1",
      email: "missing@example.com",
      phone: "+639171234567",
    });

    expect(result?.id).toBe("cus_2");
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        business_id: "biz_1",
        phone: "+639171234567",
      },
      orderBy: { created_at: "asc" },
    });
  });

  it("returns null when no contacts are available", async () => {
    const findFirst = vi.fn();

    const result = await findExistingCustomerByContact({
      customerDelegate: { findFirst },
      businessId: "biz_1",
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
