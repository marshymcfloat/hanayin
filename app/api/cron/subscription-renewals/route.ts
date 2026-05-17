import { NextResponse, connection } from "next/server";

import {
  createInvoiceForSubscription,
  ensureBusinessSubscription,
  ensureDefaultPlans,
  moveDueSubscriptionsToGracePeriod,
} from "@/features/billing/subscription-service";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import {
  isCronAuthorized,
  unauthorizedCronResponse,
} from "@/lib/security/cron-auth";
import { prisma } from "@/prisma/prisma";

const BUSINESS_SYNC_CONCURRENCY = 20;
const INVOICE_CONCURRENCY = 20;
const DUE_SUBSCRIPTION_BATCH_SIZE = 300;

async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  task: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map((item) => task(item)));
  }
}

export async function GET(request: Request) {
  await connection();
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    // Renewal invoicing + grace transitions are mode-agnostic. In
    // manual-collection mode the invoices are paid via owner-submitted
    // payment references reviewed by platform admins. The
    // isManualCollectionOnly() short-circuit that previously lived
    // here meant past-due subscriptions never moved to GRACE_PERIOD,
    // which left admin with no way to find them.
    await ensureDefaultPlans();
    const businesses = await prisma.business.findMany({
      select: { id: true },
    });

    await runInChunks(
      businesses,
      BUSINESS_SYNC_CONCURRENCY,
      async (business) => {
        await ensureBusinessSubscription(business.id);
      },
    );

    const now = getCurrentDateTimePH();
    const dueSubscriptions = await prisma.businessSubscription.findMany({
      where: {
        current_period_end: { lte: now },
        status: { in: ["ACTIVE", "TRIALING", "GRACE_PERIOD"] },
      },
      select: { id: true },
      orderBy: {
        current_period_end: "asc",
      },
      take: DUE_SUBSCRIPTION_BATCH_SIZE,
    });

    let invoicesCreated = 0;
    await runInChunks(dueSubscriptions, INVOICE_CONCURRENCY, async (sub) => {
      const invoice = await createInvoiceForSubscription(
        sub.id,
        "SCHEDULED_RENEWAL",
      );
      if (invoice.status === "OPEN" || invoice.status === "PAID") {
        invoicesCreated += 1;
      }
    });

    const graceTransitions = await moveDueSubscriptionsToGracePeriod();
    return NextResponse.json({
      success: true,
      checkedBusinesses: businesses.length,
      dueSubscriptions: dueSubscriptions.length,
      invoicesCreated,
      graceTransitions,
      processedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Subscription renewal cron failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
