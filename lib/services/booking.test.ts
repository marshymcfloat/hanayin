import { describe, expect, it, vi } from "vitest";
import {
  buildCustomerProfileUpdateForBooking,
  findDuplicateCustomerCandidate,
  findExistingCustomerByContact,
  findExistingCustomerByVerifiedPhone,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "./customer-matching";
import {
  getBookingCustomerName,
  isLinkedToCustomerProfile,
} from "@/lib/utils/booking-customer";

describe("customer contact normalization", () => {
  it("normalizes email to lowercase and trims whitespace", () => {
    expect(normalizeCustomerEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("returns undefined for blank email", () => {
    expect(normalizeCustomerEmail("   ")).toBeUndefined();
  });

  it("canonicalizes PH phone numbers across all common formats", () => {
    // All three of these are the same number — a duplicate detection regression
    // would silently double-create customer records.
    expect(normalizeCustomerPhone("  +63 917 123 4567  ")).toBe("639171234567");
    expect(normalizeCustomerPhone("0917 123 4567")).toBe("639171234567");
    expect(normalizeCustomerPhone("9171234567")).toBe("639171234567");
    expect(normalizeCustomerPhone("(0917) 123-4567")).toBe("639171234567");
  });

  it("leaves non-PH numbers untouched (whitespace stripped)", () => {
    expect(normalizeCustomerPhone("+1 415 555 1234")).toBe("+14155551234");
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

describe("findExistingCustomerByVerifiedPhone", () => {
  it("identifies a returning public customer only by verified phone", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "cus_2",
      email: "old@example.com",
      phone: "639171234567",
    });

    const result = await findExistingCustomerByVerifiedPhone({
      customerDelegate: { findFirst },
      businessId: "biz_1",
      phone: "639171234567",
    });

    expect(result?.id).toBe("cus_2");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        business_id: "biz_1",
        phone: "639171234567",
      },
      orderBy: { created_at: "asc" },
    });
  });

  it("does not query without a verified phone", async () => {
    const findFirst = vi.fn();

    const result = await findExistingCustomerByVerifiedPhone({
      customerDelegate: { findFirst },
      businessId: "biz_1",
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("buildCustomerProfileUpdateForBooking", () => {
  it("replaces editable returning-customer details after public verification", () => {
    expect(
      buildCustomerProfileUpdateForBooking({
        isPublicBooking: true,
        customerName: "Daniel Canoy",
        email: "new@example.com",
        phone: "639951804645",
        existingEmail: "old@example.com",
        existingPhone: "639951804645",
      }),
    ).toEqual({
      name: "Daniel Canoy",
      email: "new@example.com",
      phone: "639951804645",
    });
  });

  it("preserves existing staff-linked customer details", () => {
    expect(
      buildCustomerProfileUpdateForBooking({
        isPublicBooking: false,
        customerName: "Different Name",
        email: "different@example.com",
        phone: "639999999999",
        existingEmail: "saved@example.com",
        existingPhone: "639171234567",
      }),
    ).toEqual({});
  });
});

describe("findDuplicateCustomerCandidate", () => {
  it("surfaces a phone match with name + matchedOn for the confirmation dialog", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null) // email pass — no match
      .mockResolvedValueOnce({
        id: "cus_42",
        name: "Maria Santos",
        email: null,
        phone: "639171234567",
      });

    const result = await findDuplicateCustomerCandidate({
      customerDelegate: { findFirst },
      businessId: "biz_1",
      email: "different@example.com",
      phone: "639171234567",
    });

    expect(result).toEqual({
      id: "cus_42",
      name: "Maria Santos",
      email: null,
      phone: "639171234567",
      matchedOn: "phone",
    });
  });

  it("returns null when there's nothing to confirm", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    const result = await findDuplicateCustomerCandidate({
      customerDelegate: { findFirst },
      businessId: "biz_1",
      email: undefined,
      phone: undefined,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("getBookingCustomerName", () => {
  it("returns the customer's name for a normal booking", () => {
    expect(
      getBookingCustomerName({
        is_anonymous_walk_in: false,
        customer_label: null,
        customer: { name: "Maria Santos" },
      }),
    ).toBe("Maria Santos");
  });

  it("formats anonymous walk-ins with their label", () => {
    expect(
      getBookingCustomerName({
        is_anonymous_walk_in: true,
        customer_label: "Walk-in #3",
        customer: null,
      }),
    ).toBe("Walk-in: Walk-in #3");
  });

  it("falls back to a default for anonymous walk-ins with no label", () => {
    expect(
      getBookingCustomerName({
        is_anonymous_walk_in: true,
        customer_label: null,
        customer: null,
      }),
    ).toBe("Anonymous walk-in");
  });

  it("handles a missing customer gracefully", () => {
    expect(
      getBookingCustomerName({
        is_anonymous_walk_in: false,
        customer_label: null,
        customer: null,
      }),
    ).toBe("Unknown customer");
  });
});

describe("isLinkedToCustomerProfile", () => {
  it("is true for normal bookings with a customer", () => {
    expect(
      isLinkedToCustomerProfile({
        is_anonymous_walk_in: false,
        customer: { name: "Maria" },
      }),
    ).toBe(true);
  });

  it("is false for anonymous walk-ins", () => {
    expect(
      isLinkedToCustomerProfile({
        is_anonymous_walk_in: true,
        customer: null,
      }),
    ).toBe(false);
  });

  it("is false when the customer relation is missing", () => {
    expect(
      isLinkedToCustomerProfile({
        is_anonymous_walk_in: false,
        customer: null,
      }),
    ).toBe(false);
  });
});
