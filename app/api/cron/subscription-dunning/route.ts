import { NextResponse, connection } from "next/server";

import { suspendExpiredGraceSubscriptions } from "@/features/billing/subscription-service";
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
    // suspendExpiredGraceSubscriptions is mode-agnostic: it suspends
    // subscriptions whose 7-day grace window has elapsed regardless of
    // how invoices are being collected. Previously gated behind a
    // manual-collection skip, which left past-due businesses sitting
    // in GRACE forever in production.
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
