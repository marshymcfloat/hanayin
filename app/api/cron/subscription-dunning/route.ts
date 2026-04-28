import { NextResponse, connection } from "next/server";

import {
  isManualCollectionOnly,
  suspendExpiredGraceSubscriptions,
} from "@/features/billing/subscription-service";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import {
  isCronAuthorized,
  unauthorizedCronResponse,
} from "@/lib/security/cron-auth";
export async function GET(request: Request) {
  await connection();
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    if (isManualCollectionOnly()) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "MANUAL_COLLECTION_MODE",
        processedAt: getCurrentDateTimePH().toISOString(),
      });
    }

    const now = getCurrentDateTimePH();
    const suspendedCount = await suspendExpiredGraceSubscriptions();

    return NextResponse.json({
      success: true,
      suspendedCount,
      processedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Subscription dunning cron failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
