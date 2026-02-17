import { BusinessStructure } from "@/prisma/generated/prisma/enums";

export type BusinessStructureTemplate = {
  value: BusinessStructure;
  label: string;
  description: string;
  allowEmployeeSelfBooking: boolean;
  managerCanServe: boolean;
};

export const BUSINESS_STRUCTURE_TEMPLATES: BusinessStructureTemplate[] = [
  {
    value: BusinessStructure.OWNER_EMPLOYEE_SELF_SERVICE,
    label: "Owner + Employees (Self-service)",
    description:
      "Employees can create bookings, claim queue items, and serve on their own.",
    allowEmployeeSelfBooking: true,
    managerCanServe: true,
  },
  {
    value: BusinessStructure.MANAGER_LED,
    label: "Manager-led",
    description:
      "A manager handles operations and queue oversight; regular staff do not self-book by default.",
    allowEmployeeSelfBooking: false,
    managerCanServe: true,
  },
  {
    value: BusinessStructure.CASHIER_LED,
    label: "Cashier-led",
    description:
      "Front desk/cashier handles booking and payment; service staff focus on service execution.",
    allowEmployeeSelfBooking: false,
    managerCanServe: false,
  },
  {
    value: BusinessStructure.MANAGER_CASHIER,
    label: "Manager + Cashier",
    description:
      "Cashier handles front desk while manager coordinates queue and can serve when needed.",
    allowEmployeeSelfBooking: false,
    managerCanServe: true,
  },
];

const STRUCTURE_VALUES = new Set<BusinessStructure>(
  BUSINESS_STRUCTURE_TEMPLATES.map((template) => template.value),
);

export function normalizeBusinessStructure(
  value: unknown,
  fallback: BusinessStructure = BusinessStructure.OWNER_EMPLOYEE_SELF_SERVICE,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  return STRUCTURE_VALUES.has(value as BusinessStructure)
    ? (value as BusinessStructure)
    : fallback;
}

export function getBusinessStructureTemplate(structure: BusinessStructure) {
  return (
    BUSINESS_STRUCTURE_TEMPLATES.find((template) => template.value === structure) ??
    BUSINESS_STRUCTURE_TEMPLATES[0]
  );
}

export function parseCheckboxBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

export function formatBusinessStructureLabel(value: BusinessStructure) {
  return getBusinessStructureTemplate(value).label;
}
