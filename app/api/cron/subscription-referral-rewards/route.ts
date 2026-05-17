import { NextResponse, connection } from "next/server";

import { qualifyAndRewardReferralForBusiness } from "@/features/billing/subscription-service";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import {
  isCronAuthorized,
  unauthorizedCronResponse,
} from "@/lib/security/cron-auth";
import { prisma } from "@/prisma/prisma";

export async function GET(request: Request) {
  await connection();
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    const pending = await prisma.referralAttribution.findMany({
      where: {
        status: { in: ["PENDING", "QUALIFIED"] },
      },
      select: { referred_business_id: true },
      take: 500,
    });

    for (const item of pending) {
      await qualifyAndRewardReferralForBusiness(item.referred_business_id);
    }

    return NextResponse.json({
      success: true,
      processed: pending.length,
      processedAt: getCurrentDateTimePH().toISOString(),
    });
  } catch (error) {
    console.error("Subscription referral rewards cron failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
