const DEFAULT_NOW = new Date("2030-01-15T09:00:00.000Z");

type FactoryOptions = {
  namespace?: string;
  now?: Date;
};

type BusinessRecord = {
  id: string;
  name: string;
  slug: string;
  initials: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = {
  id: string;
  name: string;
  contactNumber: string;
  hashedPassword: string;
  role: "OWNER" | "EMPLOYEE" | "PLATFORM_ADMIN";
  createdAt: Date;
  updatedAt: Date;
};

type ServiceRecord = {
  id: number;
  businessId: string;
  name: string;
  category: string;
  price: number;
  estimatedCost: number;
  duration: number;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerRecord = {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
};

type BookingRecord = {
  id: number;
  businessId: string;
  customerId: string;
  status: "ACCEPTED" | "HOLD" | "COMPLETED" | "CANCELLED";
  scheduledAt: Date;
  estimatedEnd: Date;
  grandTotal: number;
  totalDiscount: number;
  amountPaid: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  paymentMethod: "CASH" | "GCASH" | "ONLINE";
  createdAt: Date;
  updatedAt: Date;
};

type SharedWorkflowSeed = {
  business: BusinessRecord;
  owner: UserRecord;
  employee: UserRecord;
  customer: CustomerRecord;
  service: ServiceRecord;
  booking: BookingRecord;
};

function copyDate(value: Date) {
  return new Date(value.getTime());
}

/**
 * Pure factories for tests at every layer. Defaults are fixed, relations line
 * up, and each call returns fresh objects and Date instances.
 */
export function createSharedWorkflowFactory(options: FactoryOptions = {}) {
  const namespace = options.namespace ?? "shared-workflow";
  const now = copyDate(options.now ?? DEFAULT_NOW);
  const scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const business = (overrides: Partial<BusinessRecord> = {}): BusinessRecord => ({
    id: `${namespace}-business`,
    name: "Harness Test Salon",
    slug: `${namespace}-salon`,
    initials: "HT",
    description: "Deterministic shared-workflow fixture",
    createdAt: copyDate(now),
    updatedAt: copyDate(now),
    ...overrides,
  });

  const user = (overrides: Partial<UserRecord> = {}): UserRecord => ({
    id: `${namespace}-owner-user`,
    name: "Harness Owner",
    contactNumber: "+639170000001",
    hashedPassword: "test-password-hash",
    role: "OWNER",
    createdAt: copyDate(now),
    updatedAt: copyDate(now),
    ...overrides,
  });

  const service = (overrides: Partial<ServiceRecord> = {}): ServiceRecord => ({
    id: 910_001,
    businessId: business().id,
    name: "Harness Signature Service",
    category: "GENERAL",
    price: 799,
    estimatedCost: 250,
    duration: 45,
    createdAt: copyDate(now),
    updatedAt: copyDate(now),
    ...overrides,
  });

  const customer = (overrides: Partial<CustomerRecord> = {}): CustomerRecord => ({
    id: `${namespace}-customer`,
    businessId: business().id,
    name: "Harness Customer",
    email: "customer@example.test",
    phone: "+639170000003",
    createdAt: copyDate(now),
    updatedAt: copyDate(now),
    ...overrides,
  });

  const booking = (overrides: Partial<BookingRecord> = {}): BookingRecord => ({
    id: 920_001,
    businessId: business().id,
    customerId: customer().id,
    status: "ACCEPTED",
    scheduledAt: copyDate(scheduledAt),
    estimatedEnd: new Date(scheduledAt.getTime() + 45 * 60 * 1000),
    grandTotal: service().price,
    totalDiscount: 0,
    amountPaid: 0,
    paymentStatus: "UNPAID",
    paymentMethod: "CASH",
    createdAt: copyDate(now),
    updatedAt: copyDate(now),
    ...overrides,
  });

  const sharedWorkflowSeed = (): SharedWorkflowSeed => {
    const seededBusiness = business();
    const seededCustomer = customer({ businessId: seededBusiness.id });
    const seededService = service({ businessId: seededBusiness.id });

    return {
      business: seededBusiness,
      owner: user(),
      employee: user({
        id: `${namespace}-employee-user`,
        name: "Harness Employee",
        contactNumber: "+639170000002",
        role: "EMPLOYEE",
      }),
      customer: seededCustomer,
      service: seededService,
      booking: booking({
        businessId: seededBusiness.id,
        customerId: seededCustomer.id,
        grandTotal: seededService.price,
      }),
    };
  };

  return { business, user, service, customer, booking, sharedWorkflowSeed };
}
