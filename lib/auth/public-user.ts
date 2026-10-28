import type { Prisma, User } from "@/prisma/generated/prisma/client";

export const publicUserSelect = {
  id: true,
  name: true,
  contact_number: true,
  role: true,
  created_at: true,
  updated_at: true,
} as const satisfies Prisma.UserSelect;

export type PublicUser = Pick<User, keyof typeof publicUserSelect>;

export function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    contact_number: user.contact_number,
    role: user.role,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}
