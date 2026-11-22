import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { bills, payments } from "@/server/db/schema";
import type { Bill } from "@/server/modules/demo-store/store";
import { listPaymentsDb } from "@/server/modules/billing/db-billing";
import { DEMO_BUSINESS_ID, ensurePotsRuntime, type PotsRuntime } from "@/server/modules/pots/runtime";
import { settleLoyaltyForBillDb, reverseLoyaltyForRefundDb } from "@/server/modules/loyalty-db/db-loyalty";
import { notify } from "@/server/modules/notifications/store";

/** Rupees -> integer paise. Never use floats inside the ledger. */
export function rupeesToPaise(rupees: number): number {
  const paise = Math.round(rupees * 100);
  if (!Number.isSafeInteger(paise) || paise <= 0) throw new Error(`invalid amount: ${rupees}`);
  return paise;
}

function readStorePayment(p: unknown): { id: string; billId: string; amountRupees: number } | null {
  const r = p as { id?: unknown; billId?: unknown; amountRupees?: unknown };
  if (typeof r.id === "string" && typeof r.billId === "string" && typeof r.amountRupees === "number") {
    return { id: r.id, billId: r.billId, amountRupees: r.amountRupees };
  }
  console.error("[pots] unexpected payment shape; skipping", p);
  return null;
}

export interface LoyaltyContext {
  customerId: string;
  bill: unknown;
}

async function resolveBillRestaurantId(billId: string): Promise<string | null> {
  const [row] = await db
    .select({ restaurantId: bills.restaurantId })
    .from(bills)
    .where(eq(bills.id, billId))
    .limit(1);
  return row?.restaurantId ?? null;
}

async function resolveRefundRestaurantId(paymentId: string, billId?: string): Promise<string | null> {
  if (billId) {
    const fromBill = await resolveBillRestaurantId(billId);
    if (fromBill) return fromBill;
  }
  const [row] = await db
    .select({ restaurantId: payments.restaurantId })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  return row?.restaurantId ?? null;
}

async function resolvePotsTarget(
  restaurantId: string,
  providerRef?: string,
): Promise<{ rt: PotsRuntime; businessId: string }> {
  const candidates = Array.from(
    new Set([restaurantId, DEMO_BUSINESS_ID].filter((id): id is string => Boolean(id))),
  );

  if (providerRef) {
    for (const id of candidates) {
      const candidateRt = await ensurePotsRuntime(id);
      if (candidateRt.payments.getPayment(providerRef, id)) {
        return { rt: candidateRt, businessId: id };
      }
    }
  }

  for (const id of candidates) {
    const candidateRt = await ensurePotsRuntime(id);
    if (candidateRt.registry.forBusiness(id).length > 0) {
      return { rt: candidateRt, businessId: id };
    }
  }

  const fallbackId = DEMO_BUSINESS_ID || restaurantId;
  return { rt: await ensurePotsRuntime(fallbackId), businessId: fallbackId };
}

export async function onBillPaymentConfirmed(
  billId: string,
  method: NonNullable<Bill["paymentMethod"]>,
  _loyalty?: LoyaltyContext,
): Promise<void> {
  void _loyalty;
  const restaurantId = await resolveBillRestaurantId(billId);
  if (!restaurantId) {
    console.error("[pots] could not resolve restaurantId for bill", billId);
    return;
  }

  try {
    const settled = await settleLoyaltyForBillDb(restaurantId, billId);
    if (settled && settled.earned > 0) {
      await notify(
        {
          type: "LOYALTY_POINTS_EARNED",
          title: "Loyalty points earned",
          message: `Member ${settled.phoneMasked} earned ${settled.earned} points (balance ${settled.balance}).`,
          dedupeKey: `loyalty-earn:${billId}`,
        },
        restaurantId,
      );
    }
  } catch (error) {
    console.error("[loyalty] settle failed for bill", billId, error);
  }

  const { rt, businessId } = await resolvePotsTarget(restaurantId);
  const at = new Date();
  for (const raw of await listPaymentsDb(restaurantId)) {
    const p = readStorePayment(raw);
    if (!p || p.billId !== billId) continue;
    const result = rt.payments.handleEvent({
      providerEventId: `pay:${businessId}:${p.id}:success`,
      providerRef: p.id,
      businessId,
      billId,
      amount: rupeesToPaise(p.amountRupees),
      status: "SUCCESS",
      at,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log(`[pots] business ${businessId} (restaurant ${restaurantId}) bill ${billId} payment ${p.id} (${method}): ${result.outcome}`);
    }
  }
}

export async function onPaymentRefunded(input: {
  refundId: string;
  paymentId: string;
  billId?: string;
  amountRupees: number;
  reason: string;
  stepUpVerified?: boolean;
  actorId?: string;
}): Promise<void> {
  const restaurantId = await resolveRefundRestaurantId(input.paymentId, input.billId);
  if (!restaurantId) {
    console.error("[pots] could not resolve restaurantId for refund", input.refundId);
    return;
  }

  if (input.billId) {
    void reverseLoyaltyForRefundDb(restaurantId, input.billId).catch((e) =>
      console.error("[loyalty] refund reversal failed", input.refundId, e),
    );
  }

  const { rt } = await resolvePotsTarget(restaurantId, input.paymentId);
  try {
    const res = rt.payments.refund({
      refundId: input.refundId,
      providerRef: input.paymentId,
      amount: rupeesToPaise(input.amountRupees),
      actorId: input.actorId ?? "owner",
      at: new Date(),
      reason: input.reason,
      stepUpVerified: input.stepUpVerified,
    });
    if (res.status === "STEP_UP_REQUIRED") console.error("[pots] large refund needs step-up", input.refundId);
    if (res.status === "BLOCKED") console.error("[pots] refund blocked in pots ledger", input.refundId, res.shortfalls);
  } catch (error) {
    console.error("[pots] refund not applied to pots ledger", input.refundId, error);
  }
}