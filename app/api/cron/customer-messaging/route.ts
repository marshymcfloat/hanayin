import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { runMessagingWorker } from "@/features/social/customer-messaging/worker/runtime";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || !header.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** No scheduler is registered. Bearer authentication precedes cleanup and job processing. */
export async function GET(request: Request) {
  await connection();
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await runMessagingWorker(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Messaging worker unavailable; review setup and retention." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
