import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/server/db/client";
import { orders, bills } from "@/server/db/schema";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { getMenuDb } from "@/server/modules/data/menu-db";
import { getTableByIdDb } from "@/server/modules/data/tables-db";
import { getSettings } from "@/server/modules/demo-store/settings";
import { getOrderFromDb } from "@/server/modules/orders/db-orders";
import { getWaiterStateDb, type WaiterState } from "@/server/modules/orders/waiter";
import { getBillByOrderIdDb, getBillPaymentSummaryDb } from "@/server/modules/billing/db-billing";
import { getFeedbackByOrderId } from "@/server/modules/feedback/store";
import { computeBillBreakdown } from "@/lib/bill-breakdown";
import {
  computeOfferDiscounts,
  getOfferStatus,
  offerValueLabel,
  type AppliedOffer,
  type Offer,
} from "@/lib/offers-shared";
import { getOffers, readBillOffers } from "@/server/modules/offers/store";
import { formatBillNo, formatOrderNo, tableNumberFromLabel } from "@/lib/order-number";
import { getGatewayConfig } from "@/server/modules/payments/gateway";
import { getOpenIntent, verifyOpenIntent } from "@/server/modules/payments/intents";

/** One itemised row of the bill popup (same item across rounds is merged). */
export type BillViewLine = { code: string; name: string; qty: number; unitRupees: number; lineRupees: number };

/**
 * Everything the bill popup shows, for both a provisional bill (computed live
 * from the confirmed rounds with today's settings) and an issued bill (read
 * back from the stored row, so its original taxes never change).
 */
export type BillView = {
  kind: "provisional" | "issued";
  restaurantName: string;
  orderNumber: string;
  billNumber: string | null;
  tableNumber: string;
  /** ms epoch: bill issue time, or "now" for a provisional bill. */
  at: number;
  lines: BillViewLine[];
  subtotal: number;
  gst: { percent: number; amount: number };
  additionalTax: { label: string; percent: number; amount: number };
  serviceCharge: { percent: number; amount: number };
  discount: number;
  /** Offers that make up part of `discount` (loyalty / manual discounts are the rest). */
  offers: AppliedOffer[];
  total: number;
  paid: number;
  remaining: number;
  status: "unpaid" | "partial" | "paid";
};

/** A live offer, already worded for the table device. */
export type CustomerOffer = {
  id: string;
  name: string;
  description: string;
  /** "20% OFF", "₹50 OFF", "₹199", "Buy 2 Get 1" */
  valueLabel: string;
  /** "Chicken Biryani", "Desserts" or "Whole order" */
  targetLabel: string;
  targetType: Offer["targetType"];
  targetItemId: string | null;
  targetCategory: string | null;
  minimumOrderRupees: number | null;
  endsAt: number;
};

export type CustomerSnapshot = {
  restaurantName: string;
  table: { id: string; number: string; status: "available" | "occupied" | "reserved" };
  /** Changes whenever a menu item's availability/price/name changes. */
  menuVersion: string;
  order: null | {
    id: string;
    orderNumber: string;
    status: string;
    rounds: number;
    lines: { itemId?: string; code: string; name: string; qty: number; priceRupees: number; round: number }[];
  };
  bill: BillView | null;
  billId: string | null;
  /** Offers running right now (switched on and between their start and end). */
  offers: CustomerOffer[];
  waiter: WaiterState;
  feedbackSubmitted: boolean;
  /** True once the current order's bill is fully paid (session closed). */
  paid: boolean;
  gateway: { configured: boolean; missing: string[] };
  /** A live, unpaid QR for the current balance, if one was already generated. */
  qr: null | { imageUrl: string; amountRupees: number };
};

function mergeLines(lines: { code: string; name: string; qty: number; priceRupees: number }[]): BillViewLine[] {
  const map = new Map<string, BillViewLine>();
  for (const l of lines) {
    const key = `${l.code}@${l.priceRupees}`;
    const cur = map.get(key);
    if (cur) {
      cur.qty += l.qty;
      cur.lineRupees += l.qty * l.priceRupees;
    } else {
      map.set(key, { code: l.code, name: l.name, qty: l.qty, unitRupees: l.priceRupees, lineRupees: l.qty * l.priceRupees });
    }
  }
  return [...map.values()];
}

/**
 * The table's current order: the latest non-cancelled order whose bill (if
 * any) is not yet settled — or, failing that, the latest paid one (so the
 * device can show the thank-you screen until a new customer starts ordering).
 */
async function findCurrentOrderId(tableId: string): Promise<{ id: string; paid: boolean } | null> {
  const rows = await db
    .select({ id: orders.id, paidAt: bills.paidAt, hasBill: bills.id })
    .from(orders)
    .leftJoin(bills, eq(bills.orderId, orders.id))
    .where(and(eq(orders.tableId, tableId), eq(orders.restaurantId, DEMO_RESTAURANT_ID), ne(orders.status, "cancelled")))
    .orderBy(desc(orders.createdAt))
    .limit(3);
  if (rows.length === 0) return null;
  const open = rows.find((r) => !r.hasBill || r.paidAt === null);
  if (open) return { id: open.id, paid: false };
  return { id: rows[0].id, paid: true };
}

export async function getCustomerSnapshot(tableId: string): Promise<CustomerSnapshot | null> {
  const [table, menu, settings, current, waiter, allOffers] = await Promise.all([
    getTableByIdDb(DEMO_RESTAURANT_ID, tableId),
    getMenuDb(DEMO_RESTAURANT_ID),
    getSettings(DEMO_RESTAURANT_ID),
    findCurrentOrderId(tableId),
    getWaiterStateDb(DEMO_RESTAURANT_ID, tableId),
    getOffers(),
  ]);
  if (!table) return null;

  const now = Date.now();
  const liveOffers = allOffers.filter((o) => getOfferStatus(o, now) === "active");

  const tableNumber = tableNumberFromLabel(table.label);
  const menuVersion = createHash("sha1")
    .update(menu.map((m) => `${m.code}:${m.available ? 1 : 0}:${m.priceRupees}:${m.discountPercent ?? 0}:${m.name}`).join("|"))
    .digest("hex")
    .slice(0, 12);

  const base: CustomerSnapshot = {
    restaurantName: settings.name,
    table: { id: table.id, number: tableNumber, status: table.status },
    menuVersion,
    order: null,
    bill: null,
    billId: null,
    offers: liveOffers.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      valueLabel: offerValueLabel(o),
      targetLabel:
        o.targetType === "order"
          ? "Whole order"
          : o.targetType === "category"
            ? (o.targetCategory ?? "Category")
            : (menu.find((m) => m.id === o.targetItemId)?.name ?? "Menu item"),
      targetType: o.targetType,
      targetItemId: o.targetItemId,
      targetCategory: o.targetCategory,
      minimumOrderRupees: o.minimumOrderRupees,
      endsAt: o.endsAt,
    })),
    waiter,
    feedbackSubmitted: false,
    paid: false,
    gateway: (() => {
      const g = getGatewayConfig();
      return g.configured ? { configured: true, missing: [] } : { configured: false, missing: g.missing };
    })(),
    qr: null,
  };

  if (!current) return base;

  const order = await getOrderFromDb(DEMO_RESTAURANT_ID, current.id);
  if (!order || order.tableId !== tableId) return base;

  const rounds = Math.max(1, ...order.lines.map((l) => l.round ?? 1));
  base.order = {
    id: order.id,
    orderNumber: formatOrderNo(order.orderNo),
    status: order.status,
    rounds,
    lines: order.lines.map((l) => ({
      itemId: l.itemId, code: l.code, name: l.name, qty: l.qty, priceRupees: l.priceRupees, round: l.round ?? 1,
    })),
  };

  let issued = await getBillByOrderIdDb(DEMO_RESTAURANT_ID, order.id);
  if (issued && issued.paidAt === null) {
    // Pull-based gateway verification (no-op unless a QR is open and credentials exist).
    await verifyOpenIntent(issued.id);
    issued = await getBillByOrderIdDb(DEMO_RESTAURANT_ID, order.id);
  }
  base.feedbackSubmitted = Boolean(await getFeedbackByOrderId(order.id));

  if (issued) {
    const summary = await getBillPaymentSummaryDb(DEMO_RESTAURANT_ID, issued.id);
    const paid = summary?.paidRupees ?? 0;
    const status = summary?.status === "paid" || summary?.status === "refunded" ? "paid" : summary?.status === "partial" ? "partial" : "unpaid";
    const billOffers = await readBillOffers(db, issued.id);
    base.billId = issued.id;
    base.paid = status === "paid";
    base.bill = {
      kind: "issued",
      restaurantName: settings.name,
      orderNumber: formatOrderNo(order.orderNo),
      billNumber: formatBillNo(issued.billNo),
      tableNumber,
      at: issued.createdAt ?? Date.now(),
      lines: mergeLines(order.lines),
      subtotal: issued.subtotalRupees,
      gst: { percent: issued.gstPercent ?? 0, amount: issued.gstRupees },
      additionalTax: { label: settings.additionalTaxLabel, percent: issued.additionalTaxPercent ?? 0, amount: issued.additionalTaxRupees ?? 0 },
      serviceCharge: { percent: issued.serviceChargePercent ?? 0, amount: issued.serviceChargeRupees },
      discount: issued.discountRupees,
      offers: billOffers?.applied ?? [],
      total: issued.totalRupees,
      paid,
      remaining: summary?.remainingRupees ?? issued.totalRupees,
      status,
    };
    if (status !== "paid") {
      const intent = await getOpenIntent(issued.id);
      if (intent?.qrImageUrl && intent.amountPaise === Math.round((summary?.remainingRupees ?? issued.totalRupees) * 100)) {
        base.qr = { imageUrl: intent.qrImageUrl, amountRupees: intent.amountPaise / 100 };
      }
    }
    return base;
  }

  // Provisional bill: the same calculation the issued bill will use, today's rates.
  const offerResult = computeOfferDiscounts(
    order.lines.map((l) => ({ itemId: l.itemId, category: l.category, qty: l.qty, priceRupees: l.priceRupees })),
    liveOffers,
    now,
  );
  const calc = computeBillBreakdown(
    order.lines,
    {
      gstPercent: settings.gstRatePercent,
      additionalTaxPercent: settings.additionalTaxPercent,
      serviceChargePercent: settings.serviceChargePercent,
    },
    offerResult.totalRupees,
  );
  base.bill = {
    kind: "provisional",
    restaurantName: settings.name,
    orderNumber: formatOrderNo(order.orderNo),
    billNumber: null,
    tableNumber,
    at: Date.now(),
    lines: mergeLines(order.lines),
    subtotal: calc.subtotal,
    gst: { percent: settings.gstRatePercent, amount: calc.gst },
    additionalTax: { label: settings.additionalTaxLabel, percent: settings.additionalTaxPercent, amount: calc.additionalTax },
    serviceCharge: { percent: settings.serviceChargePercent, amount: calc.serviceCharge },
    discount: calc.discount,
    offers: offerResult.applied,
    total: calc.total,
    paid: 0,
    remaining: calc.total,
    status: "unpaid",
  };
  return base;
}
