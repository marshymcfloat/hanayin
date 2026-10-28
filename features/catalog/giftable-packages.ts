import "server-only";
import { Prisma } from "@/prisma/generated/prisma/client";
export const giftablePackageWhere = { OR: [{ choices: { equals: Prisma.DbNull } }, { choices: { equals: [] } }] } satisfies Prisma.ServicePackageWhereInput;
