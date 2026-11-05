
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getDemoRole,
  DEMO_RESTAURANT_ID,
} from "@/server/modules/auth/session";

import type { OrderStatus } from "@/server/modules/demo-store/store";
import { notifyOrderCancelled, notifyOrderPlaced, notifyWaiterCall } from "@/server/modules/notifications/events";
import { acknowledgeWaiterDb, requestWaiterDb } from "./waiter";

import { formatOrderNo } from "@/lib/order-number";
import { isOrderPaidDb } from "@/server/modules/billing/db-billing";

import {
  cancelOrderInDb,
  createOrderInDb,
  getOrderFromDb,
  transitionOrderInDb,
} from "./db-orders";

export type AdvanceFailureCode =
  | "forbidden"
  | "invalid"
  | "missing"
  | "stale"
  | "served"
  | "billed";

export type AdvanceOrderResult =
  | { ok: true }
  | { ok: false; error: string; code: AdvanceFailureCode };

const STAFF_ROLES: ReadonlyArray<string> = ["owner", "kitchen", "admin"];

const ORDER_STATUSES: ReadonlyArray<string> = [
  "new",
  "preparing",
  "ready",
  "served",
  "billed",
];

const ADVANCE_ERRORS: Record<AdvanceFailureCode, string> = {
  forbidden: "Not authorized to update order status.",
  invalid: "Invalid order update request.",
  missing: "Order not found.",
  stale:
    "This order was already updated by someone else. Showing its latest status.",
  served:
    "This order is already served. Billing is a separate step — use Billing.",
  billed: "This order has already been billed.",
};

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value);
}

function fail(code: AdvanceFailureCode): AdvanceOrderResult {
  return { ok: false, code, error: ADVANCE_ERRORS[code] };
}

function revalidateOrderSurfaces(): void {
  revalidatePath("/owner/orders");
  revalidatePath("/owner/tables");
  revalidatePath("/owner/billing");
  revalidatePath("/owner");
  revalidatePath("/kitchen");
}

/**
 * Moves an order one step through the kitchen flow
 * (new → preparing → ready → served). It can never reach "billed":
 * billing is a separate operation.
 *
 * Staff-only. The role check lives here on the server.
 * expectedStatus is the status the caller saw on screen. If the order
 * has changed since, nothing changes and a stale failure is returned.
 */
export async function advanceOrder(
  orderId: string,
  expectedStatus?: OrderStatus,
): Promise<AdvanceOrderResult> {
  const role = await getDemoRole();

  if (role === null || !STAFF_ROLES.includes(role)) {
    return fail("forbidden");
  }

  if (typeof orderId !== "string" || orderId.trim() === "") {
    return fail("invalid");
  }

  if (expectedStatus !== undefined && !isOrderStatus(expectedStatus)) {
    return fail("invalid");
  }

  let result;

  try {
    result = await transitionOrderInDb(
      DEMO_RESTAURANT_ID,
      orderId.trim(),
      expectedStatus,
    );
  } catch (err) {
    console.error("advanceOrder failed", err);

    return {
      ok: false,
      code: "invalid",
      error: "Could not update the order. Please try again.",
    };
  }

  // Revalidate on failures too, so stale screens show the latest state.
  revalidateOrderSurfaces();

  if (result.ok) {
    return { ok: true };
  }

  if (result.reason === "not-found") {
    return fail("missing");
  }

  if (result.reason === "already-served") {
    return fail("served");
  }

  if (result.reason === "already-billed") {
    return fail("billed");
  }

  return fail("stale");
}

/**
 * Form-action wrapper for the Owner Live Orders page.
 * Redirects back with a notice code when an update fails.
 */
export async function advanceOrderFromForm(
  formData: FormData,
): Promise<void> {
  const orderId = formData.get("orderId");
  const expected = formData.get("expectedStatus");

  if (expected !== null && !isOrderStatus(expected)) {
    redirect("/owner/orders?notice=invalid");
  }

  const id = typeof orderId === "string" ? orderId : "";
  let result = await advanceOrder(id, expected ?? undefined);

  // "Mark Ready" on a new order: new → preparing → ready (both steps are
  // recorded, so order history and the kitchen flow stay intact).
  if (result.ok && expected === "new") {
    result = await advanceOrder(id, "preparing");
  }

  if (!result.ok) {
    redirect(`/owner/orders?notice=${result.code}`);
  }
}

/** Staff cancels an unpaid order (Live Orders page). Notifies the dashboard. */
export async function cancelOrderFromForm(formData: FormData): Promise<void> {
  const role = await getDemoRole();
  if (role === null || !STAFF_ROLES.includes(role)) {
    redirect("/owner/orders?notice=forbidden");
  }
  const id = String(formData.get("orderId") ?? "").trim();
  if (!id) redirect("/owner/orders?notice=invalid");

  const result = await cancelOrderInDb(DEMO_RESTAURANT_ID, id, role);
  if (result.ok) {
    await notifyOrderCancelled({ tableId: result.tableId, orderId: id });
  }
  revalidateOrderSurfaces();
  redirect(
    result.ok
      ? "/owner/orders?notice=cancelled"
      : `/owner/orders?notice=${result.reason === "has-payment" ? "paid" : "missing"}`,
  );
}

export type PlaceOrderInput = {
  tableId: string;
  /**
   * itemId is preferred when available. code remains supported for keypad
   * and direct requests. Prices are never accepted from the client.
   */
  lines: { code: string; qty: number; itemId?: string }[];
};

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      /** Human-readable, e.g. ORD-00125. */
      orderNumber: string;
      round: number;
      appended: boolean;
      /** Every confirmed line on the open order, all rounds, from the database. */
      lines: { itemId?: string; code: string; name: string; qty: number; priceRupees: number; round: number }[];
    }
  | { ok: false; error: string };

export async function placeCustomerOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  // Table, menu, availability, quantity limits, and prices are validated
  // against the database inside one transaction.
  const result = await createOrderInDb({
    restaurantId: DEMO_RESTAURANT_ID,
    tableId: input.tableId,
    lines: input.lines,
  });

  if (!result.ok) {
    return result;
  }

  // Notify only after the database transaction has committed.
  await notifyOrderPlaced({
    tableId: input.tableId,
    orderId: result.orderId,
    round: result.round,
    appended: result.appended,
  });

  revalidatePath("/owner/orders");
  revalidatePath("/owner/tables");
  revalidatePath("/kitchen");
  revalidatePath("/owner/notifications");

  const order = await getOrderFromDb(DEMO_RESTAURANT_ID, result.orderId);

  return {
    ok: true,
    orderId: result.orderId,
    orderNumber: formatOrderNo(result.orderNo),
    round: result.round,
    appended: result.appended,
    lines: (order?.lines ?? []).map((l) => ({
      itemId: l.itemId,
      code: l.code,
      name: l.name,
      qty: l.qty,
      priceRupees: l.priceRupees,
      round: l.round ?? 1,
    })),
  };
}

export type CallWaiterResult =
  | { ok: true }
  | { ok: false; error: string };

export async function callWaiter(
  tableId: string,
): Promise<CallWaiterResult> {
  const call = await requestWaiterDb(DEMO_RESTAURANT_ID, tableId);

  if (!call.ok) {
    return { ok: false, error: "Table not found." };
  }

  // Only a brand-new call notifies the owner; a repeat press while the
  // request is still open just keeps ringing (no duplicate popups).
  if (call.created) {
    await notifyWaiterCall({ tableId, callId: call.callId });
  }

  return { ok: true };
}

export async function acknowledgeWaiter(
  tableId: string,
): Promise<void> {
  const role = await getDemoRole();

  // Clearing a waiter call is a staff action.
  if (role === null || !STAFF_ROLES.includes(role)) {
    return;
  }

  await acknowledgeWaiterDb(DEMO_RESTAURANT_ID, tableId, role);

  revalidatePath("/owner/orders");
  revalidatePath("/owner/tables");
}

export type OrderPaymentStatus = {
  paid: boolean;
};

/**
 * Reads payment status from the database-backed billing module.
 */
export async function checkOrderPaymentStatus(
  orderId: string,
): Promise<OrderPaymentStatus> {
  return {
    paid: await isOrderPaidDb(DEMO_RESTAURANT_ID, orderId),
  };
}
