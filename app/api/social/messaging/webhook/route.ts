import { connection } from "next/server";
import { MessagingWebhookError, receiveMessengerWebhook, verifyMessengerChallenge } from "@/features/social/customer-messaging/ingestion";

export async function GET(request: Request) {
  await connection();
  try { return new Response(verifyMessengerChallenge(request), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof MessagingWebhookError ? error.message : "Messaging verification unavailable." }, { status: error instanceof MessagingWebhookError ? error.status : 503 }); }
}

export async function POST(request: Request) {
  try {
    await receiveMessengerWebhook(request);
    return Response.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof MessagingWebhookError ? error.message : "Messaging intake unavailable." }, { status: error instanceof MessagingWebhookError ? error.status : 503 });
  }
}
