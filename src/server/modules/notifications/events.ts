import "server-only";

import { and, eq } from "drizzle-orm";

import { db, withTenantDb } from "@/server/db/client";
import { restaurantTables, orders } from "@/server/db/schema";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { formatOrderNo, tableNumberFromLabel } from "@/lib/order-number";
import { notify } from "./store";
import type { NotificationType } from "./types";

async function tableNumber(
  tableId: string,
  restaurantId: string,
): Promise<string> {
  const [t] = await withTenantDb(restaurantId, async () =>
    db
      .select({ label: restaurantTables.label })
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.id, tableId),
          eq(restaurantTables.restaurantId, restaurantId),
        ),
      ),
  );
  return t ? tableNumberFromLabel(t.label) : "?";
}

async function orderLabel(
  orderId: string | undefined,
  restaurantId: string,
): Promise<string | null> {
  if (!orderId) return null;
  const [o] = await withTenantDb(restaurantId, async () =>
    db
      .select({ n: orders.orderNo })
      .from(orders)
      .where(eq(orders.id, orderId)),
  );
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
  try {
    const table = await tableNumber(tableId, restaurantId);
    const order = await orderLabel(orderId, restaurantId);
    const message = `Table ${table}${order ? ` · ${order}` : ""} — ${body}`;
    return await notify(
      { type, title, message, tableId, orderId, dedupeKey },
      restaurantId,
    );
  } catch (error) {
    console.error("[notifications] could not create", type, error);
    return null;
  }
}

export function notifyOrderPlaced(a: {
  tableId: string;
  orderId: string;
  round: number;
  appended: boolean;
  restaurantId?: string;
}) {
  const rid = a.restaurantId ?? DEMO_RESTAURANT_ID;
  return a.appended
    ? emit(
        "ORDER_ADDED",
        "Additional order",
        `More items added (round ${a.round}).`,
        a.tableId,
        a.orderId,
        `order-added:${a.orderId}:${a.round}`,
        rid,
      )
    : emit(
        "ORDER_NEW",
        "New order received",
        "New order placed.",
        a.tableId,
        a.orderId,
        `order-new:${a.orderId}`,
        rid,
      );
}

export function notifyWaiterCall(a: {
  tableId: string;
  callId: string;
  restaurantId?: string;
}) {
  return emit(
    "WAITER_CALL",
    "Waiter requested",
    "Customer is calling for the waiter.",
    a.tableId,
    undefined,
    `waiter:${a.callId}`,
    a.restaurantId ?? DEMO_RESTAURANT_ID,
  );
}

export function notifyPaymentReceived(a: {
  tableId: string;
  orderId: string;
  amountRupees: number;
  billId: string;
  restaurantId?: string;
}) {
  return emit(
    "PAYMENT_RECEIVED",
    "Payment received",
    `Payment of ₹${a.amountRupees.toLocaleString("en-IN")} completed.`,
    a.tableId,
    a.orderId,
    `payment:${a.billId}`,
    a.restaurantId ?? DEMO_RESTAURANT_ID,
  );
}

export function notifyOrderCancelled(a: {
  tableId: string;
  orderId: string;
  restaurantId?: string;
}) {
  return emit(
    "ORDER_CANCELLED",
    "Order cancelled",
    "Order was cancelled.",
    a.tableId,
    a.orderId,
    `order-cancelled:${a.orderId}`,
    a.restaurantId ?? DEMO_RESTAURANT_ID,
  );
}

export function notifyTableReserved(a: {
  tableId: string;
  reservationId: string;
  guest?: string;
  restaurantId?: string;
}) {
  return emit(
    "TABLE_RESERVED",
    "Table reserved",
    a.guest ? `Reserved for ${a.guest}.` : "Table reserved.",
    a.tableId,
    undefined,
    `table-reserved:${a.reservationId}`,
    a.restaurantId ?? DEMO_RESTAURANT_ID,
  );
}