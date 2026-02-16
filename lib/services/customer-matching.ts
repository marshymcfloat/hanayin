export function normalizeCustomerEmail(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

export function normalizeCustomerPhone(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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
