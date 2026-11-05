import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { paymentIntents } from "@/server/db/schema";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { getBillDb, getBillPaymentSummaryDb, recordBillPaymentDb } from "@/server/modules/billing/db-billing";
import { onBillPaymentConfirmed } from "@/server/modules/financial-pots/payment-hook";
import { notifyPaymentReceived } from "@/server/modules/notifications/events";
import { getGatewayConfig, listQrPayments, type GatewayPayment } from "./gateway";

export type PaymentIntentRow = typeof paymentIntents.$inferSelect;

export async function getOpenIntent(billId: string): Promise<PaymentIntentRow | null> {
  const [row] = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.billId, billId), eq(paymentIntents.status, "created")))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(1);
  return row ?? null;
}

export async function saveIntent(i: Omit<PaymentIntentRow, "id" | "status" | "createdAt" | "updatedAt">) {
  const [row] = await db
    .insert(paymentIntents)
    .values({ ...i, id: randomUUID(), status: "created" })
    .returning();
  return row;
}

/** Marks every still-open QR for a bill as superseded (amount changed, or paid). */
export async function closeIntents(billId: string, status: "superseded" | "paid") {
  await db
    .update(paymentIntents)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(paymentIntents.billId, billId), eq(paymentIntents.status, "created")));
}

/**
 * Records a payment the GATEWAY confirmed. Checks the amount matches the QR we
 * issued and the bill's remaining balance; idempotent on the gateway payment id
 * (a replayed webhook, or webhook + poll, can never pay twice).
 */
export async function settleFromGateway(
  intent: PaymentIntentRow,
  payment: GatewayPayment,
): Promise<{ ok: true; settled: boolean } | { ok: false; error: string }> {
  if (payment.status !== "captured" && payment.status !== "authorized") {
    return { ok: false, error: "Payment not captured." };
  }
  if (payment.amountPaise !== intent.amountPaise || intent.amountPaise % 100 !== 0) {
    console.error("[gateway] amount mismatch", intent.id, payment.amountPaise, intent.amountPaise);
    return { ok: false, error: "Amount mismatch." };
  }

  const bill = await getBillDb(DEMO_RESTAURANT_ID, intent.billId);
  if (!bill) return { ok: false, error: "Bill not found." };

  const result = await recordBillPaymentDb(intent.restaurantId, intent.billId, {
    method: "qr",
    amountRupees: intent.amountPaise / 100,
    transactionId: payment.id,
    idempotencyKey: `gateway:${payment.id}`,
  });

  if (!result.ok) {
    // Already recorded earlier (replay) is success from the customer's view.
    if (result.reason === "already-paid") {
      await closeIntents(intent.billId, "paid");
      return { ok: true, settled: true };
    }
    return { ok: false, error: `Could not record payment (${result.reason}).` };
  }

  await db
    .update(paymentIntents)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(paymentIntents.id, intent.id));

  if (result.settled) {
    if (result.bill.paymentMethod !== null && result.bill.totalRupees > 0) {
      try {
        await onBillPaymentConfirmed(result.bill.id, result.bill.paymentMethod);
      } catch (error) {
        console.error("Payment hook failed for gateway payment", result.bill.id, error);
      }
    }
    await notifyPaymentReceived({
      tableId: result.bill.tableId,
      orderId: result.bill.orderId,
      billId: result.bill.id,
      amountRupees: result.bill.totalRupees,
    });
  }
  return { ok: true, settled: result.settled };
}

const lastCheck = new Map<string, number>();

/**
 * Pull-based verification: asks the gateway whether the open QR was paid.
 * Rate-limited per QR so the customer device's polling can't hammer the API.
 * Works without a public webhook URL (e.g. local development).
 */
export async function verifyOpenIntent(billId: string): Promise<void> {
  const cfg = getGatewayConfig();
  if (!cfg.configured) return;
  const intent = await getOpenIntent(billId);
  if (!intent) return;

  const now = Date.now();
  if (now - (lastCheck.get(intent.id) ?? 0) < 4000) return;
  lastCheck.set(intent.id, now);

  const payments = await listQrPayments(cfg, intent.providerRef);
  const paid = payments?.find((p) => p.status === "captured");
  if (paid) await settleFromGateway(intent, paid);
}

export async function isBillSettled(billId: string): Promise<boolean> {
  const summary = await getBillPaymentSummaryDb(DEMO_RESTAURANT_ID, billId);
  return summary?.status === "paid";
}
