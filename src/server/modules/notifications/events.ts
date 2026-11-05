import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { restaurantTables, orders } from "@/server/db/schema";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { formatOrderNo, tableNumberFromLabel } from "@/lib/order-number";
import { notify } from "./store";
import type { NotificationType } from "./types";

/**
 * One place that turns business events into owner notifications. Messages use
 * the real table number and the human-readable order number, never raw ids.
 * Every notification carries a dedupeKey, so a retried request can't pop twice.
 */

async function tableNumber(tableId: string, restaurantId: string): Promise<string> {
  const [t] = await db
    .select({ label: restaurantTables.label })
    .from(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, restaurantId)));
  return t ? tableNumberFromLabel(t.label) : "?";
}

async function orderLabel(orderId: string | undefined): Promise<string | null> {
  if (!orderId) return null;
  const [o] = await db.select({ n: orders.orderNo }).from(orders).where(eq(orders.id, orderId));
  return o ? formatOrderNo(o.n) : null;
}

async function emit(
  type: NotificationType,
  title: string,
  body: string,
  tableId: string,
  orderId: string | undefined,
  dedupeKey: string,
  restaurantId: string = DEMO_RESTAURANT_ID,
) {
  const table = await tableNumber(tableId, restaurantId);
  const order = await orderLabel(orderId);
  const message = `Table ${table}${order ? ` · ${order}` : ""} — ${body}`;
  try {
    return await notify({ type, title, message, tableId, orderId, dedupeKey }, restaurantId);
  } catch (error) {
    // A failed notification must never fail the order/payment that caused it.
    console.error("[notifications] could not create", type, error);
    return null;
  }
}

export function notifyOrderPlaced(a: { tableId: string; orderId: string; round: number; appended: boolean }) {
  return a.appended
    ? emit("ORDER_ADDED", "Additional order", `More items added (round ${a.round}).`, a.tableId, a.orderId, `order-added:${a.orderId}:${a.round}`)
    : emit("ORDER_NEW", "New order received", "New order placed.", a.tableId, a.orderId, `order-new:${a.orderId}`);
}

export function notifyWaiterCall(a: { tableId: string; callId: string }) {
  return emit("WAITER_CALL", "Waiter requested", "Customer is calling for the waiter.", a.tableId, undefined, `waiter:${a.callId}`);
}

export function notifyPaymentReceived(a: { tableId: string; orderId: string; amountRupees: number; billId: string }) {
  return emit("PAYMENT_RECEIVED", "Payment received", `Payment of ₹${a.amountRupees.toLocaleString("en-IN")} completed.`, a.tableId, a.orderId, `payment:${a.billId}`);
}

export function notifyOrderCancelled(a: { tableId: string; orderId: string }) {
  return emit("ORDER_CANCELLED", "Order cancelled", "Order was cancelled.", a.tableId, a.orderId, `order-cancelled:${a.orderId}`);
}

export function notifyTableReserved(a: { tableId: string; reservationId: string; guest?: string }) {
  return emit("TABLE_RESERVED", "Table reserved", a.guest ? `Reserved for ${a.guest}.` : "Table reserved.", a.tableId, undefined, `table-reserved:${a.reservationId}`);
}
