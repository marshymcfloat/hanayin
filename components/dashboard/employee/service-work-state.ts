export type EmployeeServiceWorkItem = {
  id: number;
  updated_at: Date;
  service: {
    id: number;
    name: string;
    duration: number | null;
    category: string;
  };
  booking: {
    customer: { name: string } | null;
    is_anonymous_walk_in?: boolean | null;
    customer_label?: string | null;
    scheduled_at?: Date | null;
    created_at?: Date | null;
    downpayment: number | null;
    downpayment_status: string | null;
    grand_total: number;
    amount_paid: number;
    payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  };
  scheduled_at: Date | null;
  price: number;
  final_price?: number | null;
  discount?: number | null;
  discount_reason?: string | null;
  status: string;
  package_id: number | null;
  package: { name: string } | null;
};

export type EmployeeServiceWorkData = {
  pending: EmployeeServiceWorkItem[];
  active: EmployeeServiceWorkItem[];
  completed: EmployeeServiceWorkItem[];
};

export type ServiceWorkTransition = "claim" | "unclaim" | "complete" | "unserve";

const destinationByTransition: Record<ServiceWorkTransition, keyof EmployeeServiceWorkData> = {
  claim: "active",
  unclaim: "pending",
  complete: "completed",
  unserve: "active",
};

const statusByTransition: Record<ServiceWorkTransition, string> = {
  claim: "CLAIMED",
  unclaim: "PENDING",
  complete: "COMPLETED",
  unserve: "CLAIMED",
};

export function transitionServiceWork(
  data: EmployeeServiceWorkData,
  serviceId: number,
  transition: ServiceWorkTransition,
  patch: Partial<EmployeeServiceWorkItem> = {},
): EmployeeServiceWorkData {
  const item = [...data.pending, ...data.active, ...data.completed].find(
    (service) => service.id === serviceId,
  );
  if (!item) return data;

  const next = {
    pending: data.pending.filter((service) => service.id !== serviceId),
    active: data.active.filter((service) => service.id !== serviceId),
    completed: data.completed.filter((service) => service.id !== serviceId),
  };
  const destination = destinationByTransition[transition];
  next[destination] = [
    { ...item, ...patch, status: statusByTransition[transition] },
    ...next[destination],
  ];
  return next;
}

export function restoreServiceWorkItem(
  current: EmployeeServiceWorkData,
  snapshot: EmployeeServiceWorkData,
  serviceId: number,
): EmployeeServiceWorkData {
  const originalList = (Object.keys(snapshot) as (keyof EmployeeServiceWorkData)[]).find(
    (key) => snapshot[key].some((service) => service.id === serviceId),
  );
  if (!originalList) return current;
  const original = snapshot[originalList].find((service) => service.id === serviceId);
  if (!original) return current;

  const restored = {
    pending: current.pending.filter((service) => service.id !== serviceId),
    active: current.active.filter((service) => service.id !== serviceId),
    completed: current.completed.filter((service) => service.id !== serviceId),
  };
  restored[originalList] = [original, ...restored[originalList]];
  return restored;
}
