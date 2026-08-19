import { normalizePhilippinePhone } from "./sms-otp";

export function normalizeCustomerEmail(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

/**
 * Normalize a phone number for storage and exact-match lookups.
 *
 * For Philippine numbers we canonicalize to the international `639XXXXXXXXXX`
 * form so that "0917 123 4567", "+63 917 123 4567" and "917-123-4567" all hit
 * the same Customer row. Non-PH numbers fall through with whitespace trimmed.
 */
export function normalizeCustomerPhone(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Strip whitespace, dashes, parens before checking PH formats.
  const cleaned = trimmed.replace(/[\s\-\(\)]/g, "");

  // PH numbers normalize to canonical 12-digit 639XXXXXXXXXX. Anything that
  // doesn't match a known PH pattern falls through unchanged.
  if (
    /^\+?63\d{10}$/.test(cleaned) ||
    /^09\d{9}$/.test(cleaned) ||
    /^9\d{9}$/.test(cleaned)
  ) {
    return normalizePhilippinePhone(cleaned);
  }

  return cleaned;
}

export type CustomerLookupDelegate = {
  findFirst: (args: {
    where: {
      business_id: string;
      email?: { equals: string; mode: "insensitive" };
      phone?: string;
    };
    orderBy: { created_at: "asc" };
  }) => Promise<{ id: string; email: string | null; phone: string | null } | null>;
};

export async function findExistingCustomerByContact({
  customerDelegate,
  businessId,
  email,
  phone,
}: {
  customerDelegate: CustomerLookupDelegate;
  businessId: string;
  email?: string;
  phone?: string;
}) {
  if (email) {
    const byEmail = await customerDelegate.findFirst({
      where: {
        business_id: businessId,
        email: { equals: email, mode: "insensitive" },
      },
      orderBy: { created_at: "asc" },
    });
    if (byEmail) return byEmail;
  }

  if (phone) {
    return customerDelegate.findFirst({
      where: {
        business_id: businessId,
        phone,
      },
      orderBy: { created_at: "asc" },
    });
  }

  return null;
}

/**
 * Public bookings establish customer identity through a freshly verified
 * phone number. Editable fields such as email must not participate in the
 * lookup because they may have changed since the customer's last booking.
 */
export async function findExistingCustomerByVerifiedPhone({
  customerDelegate,
  businessId,
  phone,
}: {
  customerDelegate: CustomerLookupDelegate;
  businessId: string;
  phone?: string;
}) {
  if (!phone) return null;

  return customerDelegate.findFirst({
    where: {
      business_id: businessId,
      phone,
    },
    orderBy: { created_at: "asc" },
  });
}

export function buildCustomerProfileUpdateForBooking({
  isPublicBooking,
  customerName,
  email,
  phone,
  existingEmail,
  existingPhone,
}: {
  isPublicBooking: boolean;
  customerName: string;
  email?: string;
  phone?: string;
  existingEmail: string | null;
  existingPhone: string | null;
}) {
  if (isPublicBooking) {
    return {
      name: customerName,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    };
  }

  return {
    ...(email && !existingEmail ? { email } : {}),
    ...(phone && !existingPhone ? { phone } : {}),
  };
}

/**
 * Richer lookup used by the staff CustomerPicker and the duplicate-detection
 * confirmation dialog. Returns name + contact so the UI can show "Maria Santos
 * (0917 123 4567)" rather than just an opaque match.
 */
export type CustomerCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type RichCustomerLookupDelegate = {
  findFirst: (args: {
    where: {
      business_id: string;
      email?: { equals: string; mode: "insensitive" };
      phone?: string;
    };
    orderBy: { created_at: "asc" };
    select: {
      id: true;
      name: true;
      email: true;
      phone: true;
    };
  }) => Promise<CustomerCandidate | null>;
};

/**
 * Look up an existing customer by email (preferred) or phone for the staff
 * duplicate-confirmation flow. Caller is expected to pre-normalize both
 * inputs via normalizeCustomerEmail / normalizeCustomerPhone.
 *
 * Returns null when there's nothing to confirm — caller proceeds to create.
 */
export async function findDuplicateCustomerCandidate({
  customerDelegate,
  businessId,
  email,
  phone,
}: {
  customerDelegate: RichCustomerLookupDelegate;
  businessId: string;
  email?: string;
  phone?: string;
}): Promise<
  | (CustomerCandidate & { matchedOn: "email" | "phone" })
  | null
> {
  if (email) {
    const byEmail = await customerDelegate.findFirst({
      where: {
        business_id: businessId,
        email: { equals: email, mode: "insensitive" },
      },
      orderBy: { created_at: "asc" },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (byEmail) return { ...byEmail, matchedOn: "email" };
  }

  if (phone) {
    const byPhone = await customerDelegate.findFirst({
      where: {
        business_id: businessId,
        phone,
      },
      orderBy: { created_at: "asc" },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (byPhone) return { ...byPhone, matchedOn: "phone" };
  }

  return null;
}
