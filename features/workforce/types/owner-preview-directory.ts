import type { OwnerPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

export type OwnerPreviewEmployee = {
  id: number;
  name: string;
  contactNumber: string;
  profile: StaffProfile;
  specialties: string[];
  recurringDaysOff: number[];
};

export type OwnerPreviewEmployeesData = {
  businessName: string;
  canManagePay?: boolean;
  employees: OwnerPreviewEmployee[];
};

export type OwnerPreviewOwner = {
  id: number;
  name: string;
  contactNumber: string;
  isPrimary: boolean;
  specialties: string[];
  permissions: OwnerPermission[];
};

export type OwnerPreviewOwnersData = {
  businessName: string;
  owners: OwnerPreviewOwner[];
  administration?: {
    currentOwnerId: number;
    canManage: boolean;
    categories: string[];
  };
};

export type OwnerDirectoryChange =
  | { type: "specialties"; ownerId: number; specialties: string[] }
  | { type: "permissions"; ownerId: number; permissions: OwnerPermission[] }
  | { type: "primary"; ownerId: number };
