import { getServerSession } from "next-auth";

import { authOptions } from "@/features/auth/auth-options";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

export async function logPlatformAction(input: {
  action: string;
  targetType: string;
  targetId: string;
  businessId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const session = await getServerSession(authOptions);
  await prisma.platformActionLog.create({
    data: {
      actor_user: session?.user?.id
        ? { connect: { id: session.user.id } }
        : undefined,
      actor_identifier: session?.user?.contactNumber ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      business: input.businessId
        ? { connect: { id: input.businessId } }
        : undefined,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
