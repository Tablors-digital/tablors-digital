import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db } from "@/server/db/client";
import { paymentIntents } from "@/server/db/schema";
import { getGatewayConfig, verifyWebhookSignature } from "@/server/modules/payments/gateway";
import { settleFromGateway } from "@/server/modules/payments/intents";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook. Only a correctly SIGNED event can record a payment; an
 * unsigned or forged request is rejected and changes nothing.
 * Subscribe to: qr_code.credited (and payment.captured).
 */
export async function POST(req: Request) {
  const cfg = getGatewayConfig();
  if (!cfg.configured || !cfg.webhookSecret) {
    return new NextResponse("Webhook not configured (RAZORPAY_WEBHOOK_SECRET).", { status: 503 });
  }

  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"), cfg.webhookSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; amount?: number; status?: string } };
      qr_code?: { entity?: { id?: string } };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  const qrId = event.payload?.qr_code?.entity?.id;
  if (!payment?.id || typeof payment.amount !== "number" || !qrId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.provider, "razorpay"), eq(paymentIntents.providerRef, qrId)));
  if (!intent) return NextResponse.json({ ok: true, ignored: true });

  const result = await settleFromGateway(intent, {
    id: payment.id,
    amountPaise: payment.amount,
    status: payment.status ?? "captured",
  });
  // 200 for handled/ignored events so the gateway stops retrying; 500 lets it retry real failures.
  return result.ok ? NextResponse.json({ ok: true }) : new NextResponse(result.error, { status: 500 });
}
