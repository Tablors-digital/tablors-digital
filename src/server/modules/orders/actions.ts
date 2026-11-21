"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, withTenantDb } from "@/server/db/client";
import { restaurantTables } from "@/server/db/schema";
import {
  getDemoSession,
  DEMO_RESTAURANT_ID,
} from "@/server/modules/auth/session";

import type { OrderStatus } from "@/server/modules/demo-store/store";
import {
  notifyOrderCancelled,
  notifyOrderPlaced,
  notifyWaiterCall,
} from "@/server/modules/notifications/events";
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
  revalidatePath("/owner/notifications");
}

async function resolveRestaurantId(tableId?: string): Promise<string> {
  const session = await getDemoSession();
  if (session?.restaurantId) {
    return session.restaurantId;
  }
  if (tableId && tableId.trim() !== "") {
    try {
      const [row] = await db
        .select({ restaurantId: restaurantTables.restaurantId })
        .from(restaurantTables)
        .where(eq(restaurantTables.id, tableId.trim()))
        .limit(1);
      if (row?.restaurantId) {
        return row.restaurantId;
      }
    } catch (err) {
      console.error("resolveRestaurantId table lookup failed", err);
    }
  }
  return DEMO_RESTAURANT_ID;
}

export async function advanceOrder(
  orderId: string,
  expectedStatus?: OrderStatus,
): Promise<AdvanceOrderResult> {
  const session = await getDemoSession();
  const role = session?.role ?? null;

  if (role === null || !STAFF_ROLES.includes(role)) {
    return fail("forbidden");
  }

  if (typeof orderId !== "string" || orderId.trim() === "") {
    return fail("invalid");
  }

  if (expectedStatus !== undefined && !isOrderStatus(expectedStatus)) {
    return fail("invalid");
  }

  const restaurantId = session?.restaurantId ?? DEMO_RESTAURANT_ID;
  let result;

  try {
    result = await withTenantDb(restaurantId, async () =>
      transitionOrderInDb(restaurantId, orderId.trim(), expectedStatus),
    );
  } catch (err) {
    console.error("advanceOrder failed", err);
    return {
      ok: false,
      code: "invalid",
      error: "Could not update the order. Please try again.",
    };
  }

  revalidateOrderSurfaces();

  if (result.ok) {
    return { ok: true };
  }

  if (result.reason === "not-found") return fail("missing");
  if (result.reason === "status-changed") return fail("stale");
  if (result.reason === "already-served") return fail("served");
  if (result.reason === "already-billed") return fail("billed");
  return fail("invalid");
}

export async function advanceOrderFromForm(formData: FormData): Promise<void> {
  const rawOrderId = formData.get("orderId");
  const rawExpected = formData.get("expectedStatus");

  const orderId = typeof rawOrderId === "string" ? rawOrderId : "";
  const expectedStatus =
    typeof rawExpected === "string" && isOrderStatus(rawExpected)
      ? rawExpected
      : undefined;

  await advanceOrder(orderId, expectedStatus);
}

export type PlaceOrderInput = {
  tableId: string;
  lines: { code: string; qty: number; itemId?: string }[];
};

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      round: number;
      appended: boolean;
      lines: {
        itemId?: string;
        code: string;
        name: string;
        qty: number;
        priceRupees: number;
        round: number;
      }[];
    }
  | { ok: false; error: string };

export async function placeCustomerOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  if (typeof input.tableId !== "string" || input.tableId.trim() === "") {
    return { ok: false, error: "Table not found." };
  }

  const cleanTableId = input.tableId.trim();
  const restaurantId = await resolveRestaurantId(cleanTableId);

  let result;
  try {
    result = await withTenantDb(restaurantId, async () =>
      createOrderInDb({
        restaurantId,
        tableId: cleanTableId,
        lines: input.lines,
      }),
    );
  } catch (err) {
    console.error("placeCustomerOrder createOrderInDb failed", err);
    return {
      ok: false,
      error: "Couldn't reach the restaurant. Please try again.",
    };
  }

  if (!result.ok) {
    return result;
  }

  try {
    await notifyOrderPlaced({
      tableId: cleanTableId,
      orderId: result.orderId,
      round: result.round,
      appended: result.appended,
      restaurantId,
    });
  } catch (err) {
    console.error("placeCustomerOrder notifyOrderPlaced failed", err);
  }

  try {
    revalidateOrderSurfaces();
  } catch (err) {
    console.error("placeCustomerOrder revalidate failed", err);
  }

  let order = null;
  try {
    order = await withTenantDb(restaurantId, async () =>
      getOrderFromDb(restaurantId, result.orderId),
    );
  } catch (err) {
    console.error("placeCustomerOrder getOrderFromDb failed", err);
  }

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
  const cleanTableId = (tableId ?? "").trim();
  const restaurantId = await resolveRestaurantId(cleanTableId);

  try {
    const call = await withTenantDb(restaurantId, async () =>
      requestWaiterDb(restaurantId, cleanTableId),
    );

    if (!call.ok) {
      return { ok: false, error: "Table not found." };
    }

    if (call.created) {
      await notifyWaiterCall({
        tableId: cleanTableId,
        callId: call.callId,
        restaurantId,
      });
    }

    return { ok: true };
  } catch (err) {
    console.error("callWaiter failed", err);
    return {
      ok: false,
      error: "Couldn't reach staff right now, please try again.",
    };
  }
}

export async function acknowledgeWaiter(
  tableId: string,
): Promise<void> {
  const session = await getDemoSession();
  const role = session?.role ?? null;

  if (role === null || !STAFF_ROLES.includes(role)) {
    return;
  }

  const cleanTableId = (tableId ?? "").trim();
  const restaurantId = await resolveRestaurantId(cleanTableId);

  await withTenantDb(restaurantId, async () =>
    acknowledgeWaiterDb(restaurantId, cleanTableId, role),
  );

  revalidateOrderSurfaces();
}

export type OrderPaymentStatus = {
  paid: boolean;
};

export async function checkOrderPaymentStatus(
  orderId: string,
): Promise<OrderPaymentStatus> {
  const session = await getDemoSession();
  const restaurantId = session?.restaurantId ?? DEMO_RESTAURANT_ID;
  return {
    paid: await withTenantDb(restaurantId, async () =>
      isOrderPaidDb(restaurantId, orderId),
    ),
  };
}

const CANCEL_ERRORS: Record<
  "not-found" | "already-cancelled" | "has-payment",
  string
> = {
  "not-found": "Order not found.",
  "already-cancelled": "Order is already cancelled.",
  "has-payment": "Cannot cancel an order that already has a payment.",
};

export async function cancelOrder(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getDemoSession();
  const role = session?.role ?? null;
  if (role === null || !STAFF_ROLES.includes(role)) {
    return { ok: false, error: "Not authorized to cancel orders." };
  }

  const restaurantId = session?.restaurantId ?? DEMO_RESTAURANT_ID;
  const res = await withTenantDb(restaurantId, async () =>
    cancelOrderInDb(restaurantId, orderId),
  );
  if (!res.ok) {
    return { ok: false, error: CANCEL_ERRORS[res.reason] };
  }

  if (res.tableId) {
    await notifyOrderCancelled({
      tableId: res.tableId,
      orderId,
      restaurantId,
    });
  }

  revalidateOrderSurfaces();
  return { ok: true };
}

export async function cancelOrderFromForm(formData: FormData): Promise<void> {
  const rawOrderId = formData.get("orderId");
  const orderId = typeof rawOrderId === "string" ? rawOrderId : "";
  if (!orderId.trim()) return;
  await cancelOrder(orderId);
}