import { Role } from "@/prisma/generated/prisma/enums";
import { DefaultSession } from "next-auth";
import { Employee, Business, Owner } from "@/prisma/generated/prisma/models";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      contactNumber?: string | null;
      businessSlug?: string | null;
      isPlatformAdmin?: boolean;
      mustChangePassword?: boolean;
      tempPasswordExpiresAt?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    contact_number?: string;
    employee?: (Employee & { business: Business }) | null;
    owner?: (Owner & { business: Business }) | null;
    must_change_password?: boolean;
    temp_password_expires_at?: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: Role;
    contactNumber?: string | null;
    businessSlug?: string | null;
    isPlatformAdmin?: boolean;
    mustChangePassword?: boolean;
    tempPasswordExpiresAt?: string | null;
  }
}
