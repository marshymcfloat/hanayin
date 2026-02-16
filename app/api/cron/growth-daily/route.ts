import { NextResponse, connection } from "next/server";

import { runGrowthDailyForAllBusinesses } from "@/lib/services/growth/daily-runner";
import {
  isCronAuthorized,
  unauthorizedCronResponse,
} from "@/lib/security/cron-auth";

export async function GET(request: Request) {
  await connection();
  try {
    if (!isCronAuthorized(request)) {
      return unauthorizedCronResponse();
    }

    const result = await runGrowthDailyForAllBusinesses();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Growth cron failed.",
      },
      { status: 500 },
    );
  }
}

