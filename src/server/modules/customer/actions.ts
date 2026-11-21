"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { recordBillPaymentDb } from "@/server/modules/billing/db-billing";
import { onBillPaymentConfirmed } from "@/server/modules/financial-pots/payment-hook";

import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import {
  getBillByOrderIdDb,
  getBillPaymentSummaryDb,
  getBillReceiptDb,
  issueBillDb,
  type BillReceipt,
} from "@/server/modules/billing/db-billing";
import { getOrderFromDb } from "@/server/modules/orders/db-orders";
import { getTableByIdDb } from "@/server/modules/data/tables-db";
import {
  type Bill,
  type BillPaymentSummary,
} from "@/server/modules/demo-store/store";
import { getSettings } from "@/server/modules/demo-store/settings";
import { getGatewayConfig, createUpiQr } from "@/server/modules/payments/gateway";
import { closeIntents, getOpenIntent, saveIntent } from "@/server/modules/payments/intents";
import { formatBillNo, formatOrderNo, tableNumberFromLabel } from "@/lib/order-number";
import {
  getBillLoyaltyViewDb,
  holdRedemptionDb,
  identifyCustomerOnBillDb,
  releaseRedemptionDb,
  type BillLoyaltyView,
} from "@/server/modules/loyalty-db/db-loyalty";

export type CustomerBillState = {
  billId: string;
  totalRupees: number;
  paidRupees: number;
  remainingRupees: number;
  status: BillPaymentSummary["status"];
  restaurantName: string;
  receipt: BillReceipt | null;
  loyalty: BillLoyaltyView;

  // Payment QR details
  upiUri: string | null;
  upiConfigured: boolean;
  qrUrl: string | null;
};

export type PaymentQrResult =
  | {
      ok: true;
      mode: "live";
      imageUrl: string;
      amountRupees: number;
      restaurantName: string;
    }
  | {
      ok: true;
      mode: "demo";
      qrValue: string;
      amountRupees: number;
      restaurantName: string;
    }
  | {
      ok: false;
      code: "no-bill" | "paid" | "not-configured" | "gateway";
      error: string;
      missing?: string[];
    };

export type CustomerOrderState =
  | {
      ok: true;
      orderStatus: string;
      bill: CustomerBillState | null;
    }
  | { ok: false; error: string };

async function buildBillState(bill: Bill, restaurantName?: string): Promise<CustomerBillState> {
  const [rawSummary, receipt, loyalty, settings, openIntent] = await Promise.all([
    getBillPaymentSummaryDb(DEMO_RESTAURANT_ID, bill.id),
    getBillReceiptDb(DEMO_RESTAURANT_ID, bill.id),
    getBillLoyaltyViewDb(DEMO_RESTAURANT_ID, bill.tableId, bill.id),
    restaurantName ? Promise.resolve({ name: restaurantName }) : getSettings(DEMO_RESTAURANT_ID),
    getOpenIntent(bill.id),
  ]);

  const summary =
    rawSummary ??
    ({
      totalRupees: bill.totalRupees,
      paidRupees: 0,
      remainingRupees: bill.totalRupees,
      status: "unpaid",
    } as BillPaymentSummary);

  return {
    billId: bill.id,
    totalRupees: summary.totalRupees,
    paidRupees: summary.paidRupees,
    remainingRupees: summary.remainingRupees,
    status: summary.status,
    restaurantName: settings.name,
    receipt,
    loyalty,

    // Payment QR details
    upiUri: null,
    upiConfigured: getGatewayConfig().configured,
    qrUrl: openIntent?.qrImageUrl ?? null,
  };
}

async function validateCustomerOrder(tableId: string, orderId: string) {
  const [table, order] = await Promise.all([
    getTableByIdDb(DEMO_RESTAURANT_ID, tableId),
    getOrderFromDb(DEMO_RESTAURANT_ID, orderId),
  ]);
  if (!table) return { ok: false as const, error: "Table not found." };
  if (!order || order.tableId !== tableId) {
    return { ok: false as const, error: "Order not found for this table." };
  }

  return { ok: true as const, table, order };
}

/**
- Reads the current bill/payment state for the exact order on this table.
 */
export async function getCustomerOrderState(
  tableId: string,
  orderId: string
): Promise<CustomerOrderState> {
  const [validated, bill] = await Promise.all([
    validateCustomerOrder(tableId, orderId),
    getBillByOrderIdDb(DEMO_RESTAURANT_ID, orderId),
  ]);
  if (!validated.ok) return { ok: false, error: validated.error };

  return {
    ok: true,
    orderStatus: validated.order.status,
    bill: bill ? await buildBillState(bill) : null,
  };
}

/**
- Issues (or loads) the combined bill and returns BOTH the bill summary and
- loyalty view in a single round-trip so the device never needs extra fetches.
 */
export async function generateCustomerBill(
  tableId: string,
  orderId: string
): Promise<
  | {
      ok: true;
      billNumber: string;
      bill: CustomerBillState;
      billSnapshot: {
        kind: "issued";
        billId: string;
        billNumber: string;
        total: number;
        paid: number;
        remaining: number;
        status: BillPaymentSummary["status"];
      };
    }
  | { ok: false; error: string }
> {
  const [validated, existing, settings] = await Promise.all([
    validateCustomerOrder(tableId, orderId),
    getBillByOrderIdDb(DEMO_RESTAURANT_ID, orderId),
    getSettings(DEMO_RESTAURANT_ID),
  ]);
  if (!validated.ok) return { ok: false, error: validated.error };

  let activeBill = existing;

  if (!activeBill) {
    const result = await issueBillDb(
      DEMO_RESTAURANT_ID,
      orderId,
      {
        gstPercent: settings.gstRatePercent,
        additionalTaxPercent: settings.additionalTaxPercent,
        serviceChargePercent: settings.serviceChargePercent,
        discountRupees: 0,
      },
      undefined,
      { allowBeforeServed: true, applyOffers: true }
    );

    if (!result.ok) {
      switch (result.reason) {
        case "already-billed":
          activeBill = result.bill;
          break;
        case "invalid-gst":
        case "invalid-service-charge":
          return { ok: false, error: "Billing rates are not configured correctly. Please ask the staff." };
        default:
          return { ok: false, error: "We could not generate the bill. Please ask your waiter." };
      }
    } else {
      activeBill = result.bill;
      revalidatePath("/owner/billing");
    }
  }

  const state = await buildBillState(activeBill, settings.name);
  const billNumber = formatBillNo(activeBill.billNo);

  return {
    ok: true,
    billNumber,
    bill: state,
    billSnapshot: {
      kind: "issued",
      billId: activeBill.id,
      billNumber,
      total: state.totalRupees,
      paid: state.paidRupees,
      remaining: state.remainingRupees,
      status: state.status,
    },
  };
}

/**
- Issues the bill on the spot if needed AND generates the Razorpay / Demo QR
- in a single server round-trip.
 */
export async function createPaymentQr(
  tableId: string,
  orderId: string
): Promise<PaymentQrResult> {
  const [validated, existingBill, settings] = await Promise.all([
    validateCustomerOrder(tableId, orderId),
    getBillByOrderIdDb(DEMO_RESTAURANT_ID, orderId),
    getSettings(DEMO_RESTAURANT_ID),
  ]);

  if (!validated.ok) {
    return { ok: false, code: "no-bill", error: validated.error };
  }

  let bill = existingBill;

  if (!bill) {
    const issued = await issueBillDb(
      DEMO_RESTAURANT_ID,
      orderId,
      {
        gstPercent: settings.gstRatePercent,
        additionalTaxPercent: settings.additionalTaxPercent,
        serviceChargePercent: settings.serviceChargePercent,
        discountRupees: 0,
      },
      undefined,
      { allowBeforeServed: true, applyOffers: true }
    );
    if (!issued.ok) {
      if (issued.reason === "already-billed") {
        bill = issued.bill;
      } else {
        return {
          ok: false,
          code: "no-bill",
          error: "We could not generate the bill. Please ask your waiter.",
        };
      }
    } else {
      bill = issued.bill;
    }
  }

  const summary = await getBillPaymentSummaryDb(DEMO_RESTAURANT_ID, bill.id);

  if (!summary || summary.remainingRupees <= 0) {
    return {
      ok: false,
      code: "paid",
      error: "This bill is already paid.",
    };
  }

  const cfg = getGatewayConfig();

  // Demo mode when Razorpay credentials are unavailable.
  if (!cfg.configured) {
    return {
      ok: true,
      mode: "demo",
      qrValue: JSON.stringify({
        type: "TABLOR_DEMO_PAYMENT",
        billId: bill.id,
        orderId,
        tableId,
        amount: summary.remainingRupees,
      }),
      amountRupees: summary.remainingRupees,
      restaurantName: settings.name,
    };
  }

  // Real Razorpay QR.
  const amountPaise = Math.round(summary.remainingRupees * 100);
  const open = await getOpenIntent(bill.id);

  if (open && open.amountPaise === amountPaise && open.qrImageUrl) {
    return {
      ok: true,
      mode: "live",
      imageUrl: open.qrImageUrl,
      amountRupees: amountPaise / 100,
      restaurantName: settings.name,
    };
  }

  if (open) {
    await closeIntents(bill.id, "superseded");
  }

  const tableNo = tableNumberFromLabel(validated.table.label);

  const created = await createUpiQr(cfg, {
    amountPaise,
    name: `${settings.name} Table ${tableNo}`,
    description: `${formatOrderNo(validated.order.orderNo)} / ${formatBillNo(bill.billNo)} / Table ${tableNo}`,
    notes: {
      bill_id: bill.id,
      order_id: orderId,
      table_id: tableId,
      order_no: formatOrderNo(validated.order.orderNo),
    },
  });

  if (!created.ok) {
    return {
      ok: false,
      code: "gateway",
      error: created.error,
    };
  }

  await saveIntent({
    restaurantId: DEMO_RESTAURANT_ID,
    billId: bill.id,
    orderId,
    tableId,
    provider: "razorpay",
    providerRef: created.qr.id,
    amountPaise,
    qrImageUrl: created.qr.imageUrl,
  });

  return {
    ok: true,
    mode: "live",
    imageUrl: created.qr.imageUrl,
    amountRupees: amountPaise / 100,
    restaurantName: settings.name,
  };
}

/**
- Test-only payment simulation.
- This is rejected whenever Razorpay is configured.
 */
export async function simulateDemoPayment(
  tableId: string,
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [validated, bill] = await Promise.all([
    validateCustomerOrder(tableId, orderId),
    getBillByOrderIdDb(DEMO_RESTAURANT_ID, orderId),
  ]);

  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  if (getGatewayConfig().configured) {
    return {
      ok: false,
      error: "Demo payments are disabled while live payments are configured.",
    };
  }

  if (!bill) {
    return { ok: false, error: "Bill not found." };
  }

  const summary = await getBillPaymentSummaryDb(DEMO_RESTAURANT_ID, bill.id);

  if (!summary || summary.remainingRupees <= 0) {
    return { ok: false, error: "This bill is already settled." };
  }

  const transactionId = `DEMO-${randomUUID().replace(/-/g, "")}`;

  const payment = await recordBillPaymentDb(DEMO_RESTAURANT_ID, bill.id, {
    method: "qr",
    amountRupees: summary.remainingRupees,
    transactionId,
    idempotencyKey: `demo-payment-${bill.id}`,
  });

  if (!payment.ok) {
    return {
      ok: false,
      error: "Could not record demo payment. Please try again.",
    };
  }

  try {
    await onBillPaymentConfirmed(bill.id, "qr");
  } catch (error) {
    console.error("[payment] Financial Pots confirmation failed:", bill.id, error);
  }

  revalidatePath("/owner/billing");

  return { ok: true };
}

// ---- loyalty (customer device) -------------------------------------------------

type LoyaltyResult =
  | { ok: true; bill: CustomerBillState }
  | { ok: false; message: string; bill: CustomerBillState | null };

async function withLoyaltyBill(
  tableId: string,
  orderId: string,
  run: (bill: Bill) => Promise<{ ok: true } | { ok: false; message: string }>
): Promise<LoyaltyResult> {
  const [validated, bill] = await Promise.all([
    validateCustomerOrder(tableId, orderId),
    getBillByOrderIdDb(DEMO_RESTAURANT_ID, orderId),
  ]);
  if (!validated.ok) return { ok: false, message: validated.error, bill: null };
  if (!bill) return { ok: false, message: "Generate the bill first.", bill: null };

  const result = await run(bill);
  const fresh = await getBillByOrderIdDb(DEMO_RESTAURANT_ID, orderId);
  const state = fresh ? await buildBillState(fresh) : null;

  if (!result.ok) return { ok: false, message: result.message, bill: state };
  if (!state) return { ok: false, message: "Bill not found.", bill: null };
  return { ok: true, bill: state };
}

export async function identifyLoyaltyMember(tableId: string, orderId: string, phone: string) {
  return withLoyaltyBill(tableId, orderId, (bill) =>
    identifyCustomerOnBillDb(DEMO_RESTAURANT_ID, tableId, bill.id, phone)
  );
}

export async function redeemLoyaltyReward(tableId: string, orderId: string, rewardId: string) {
  return withLoyaltyBill(tableId, orderId, (bill) =>
    holdRedemptionDb(DEMO_RESTAURANT_ID, tableId, bill.id, rewardId)
  );
}

export async function removeLoyaltyReward(tableId: string, orderId: string) {
  return withLoyaltyBill(tableId, orderId, (bill) =>
    releaseRedemptionDb(DEMO_RESTAURANT_ID, tableId, bill.id)
  );
}