import type { Bill } from "@/server/modules/demo-store/store";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { listPaymentsDb } from "@/server/modules/billing/db-billing";
import { DEMO_BUSINESS_ID, getPotsRuntime } from "@/server/modules/pots/runtime";
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

/** Kept so existing callers still compile; loyalty now comes from the DB bill link. */
export interface LoyaltyContext {
  customerId: string;
  bill: unknown;
}

export async function onBillPaymentConfirmed(
  billId: string,
  method: NonNullable<Bill["paymentMethod"]>,
  _loyalty?: LoyaltyContext,
): Promise<void> {
  void _loyalty;
  try {
    const settled = await settleLoyaltyForBillDb(DEMO_RESTAURANT_ID, billId);
    if (settled && settled.earned > 0) {
      await notify({
        type: "LOYALTY_POINTS_EARNED",
        title: "Loyalty points earned",
        message: `Member ${settled.phoneMasked} earned ${settled.earned} points (balance ${settled.balance}).`,
        dedupeKey: `loyalty-earn:${billId}`,
      });
    }
  } catch (error) {
    console.error("[loyalty] settle failed for bill", billId, error);
  }

  const rt = getPotsRuntime();
  const at = new Date();
  for (const raw of await listPaymentsDb(DEMO_RESTAURANT_ID)) {
    const p = readStorePayment(raw);
    if (!p || p.billId !== billId) continue;
    const result = rt.payments.handleEvent({
      providerEventId: `demo:${p.id}:success`,
      providerRef: p.id,
      businessId: DEMO_BUSINESS_ID,
      billId,
      amount: rupeesToPaise(p.amountRupees),
      status: "SUCCESS",
      at,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log(`[pots] bill ${billId} payment ${p.id} (${method}): ${result.outcome}`);
    }
  }
}

export function onPaymentRefunded(input: {
  refundId: string;
  paymentId: string;
  /** Needed to reverse loyalty points on the bill. */
  billId?: string;
  amountRupees: number;
  reason: string;
  stepUpVerified?: boolean;
}): void {
  if (input.billId) {
    void reverseLoyaltyForRefundDb(DEMO_RESTAURANT_ID, input.billId).catch((e) =>
      console.error("[loyalty] refund reversal failed", input.refundId, e),
    );
  }
  const rt = getPotsRuntime();
  try {
    const res = rt.payments.refund({
      refundId: input.refundId,
      providerRef: input.paymentId,
      amount: rupeesToPaise(input.amountRupees),
      actorId: "owner",
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