
import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  orders,
  orderItems,
  orderEvents,
  restaurantTables,
  menuItems,
  bills,
  payments,
} from "@/server/db/schema";
import { recomputeUnpaidBillTx } from "@/server/modules/billing/db-billing";
import { getEffectivePrice } from "@/lib/menu-shared";

import type {
  Order,
  OrderLine,
  OrderStatus,
  RestaurantTable,
} from "@/server/modules/demo-store/store";

const MAX_LINE_QTY = 99;
const FLOW: OrderStatus[] = ["new", "preparing", "ready", "served"];

class OrderError extends Error {}

export type CreateOrderInput = {
  restaurantId: string;
  tableId: string;
  lines: { code: string; qty: number; itemId?: string }[];
};

export type CreateOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNo: number | null;
      /** 1 for the first confirm, 2+ for rounds added to the same open order. */
      round: number;
      appended: boolean;
    }
  | { ok: false; error: string };

type OrderRow = typeof orders.$inferSelect;

/**
 * Converts database order rows and their order items into the existing
 * Order/OrderLine UI shape.
 */
async function hydrateOrders(rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .orderBy(asc(orderItems.createdAt));

  const byOrder = new Map<string, OrderLine[]>();

  for (const it of items) {
    const line: OrderLine = {
      code: it.code,
      name: it.nameSnapshot,
      qty: it.qty,
      priceRupees: it.pricePaise / 100,
      itemId: it.menuItemId ?? undefined,
      category: it.categorySnapshot ?? undefined,
      prepMinutes: it.prepMinutes ?? undefined,
      basePriceRupees:
        it.basePricePaise != null
          ? it.basePricePaise / 100
          : undefined,
      discountPercent: it.discountPercent ?? undefined,
      round: it.round,
    };

    const list = byOrder.get(it.orderId) ?? [];
    list.push(line);
    byOrder.set(it.orderId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    orderNo: r.orderNo ?? undefined,
    tableId: r.tableId,
    lines: byOrder.get(r.id) ?? [],
    status: r.status as OrderStatus,
    createdAt: r.createdAt.getTime(),
    statusUpdatedAt: r.statusUpdatedAt.getTime(),
  }));
}

/**
 * Creates an order and its items in one transaction, validates menu items,
 * records the initial order event, and marks the table occupied.
 */
export async function createOrderInDb(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  try {
    const result = await db.transaction(async (tx) => {
      // Locking the table row serialises concurrent confirms for this table,
      // so two quick presses can never create two open orders.
      const [table] = await tx
        .select()
        .from(restaurantTables)
        .where(
          and(
            eq(restaurantTables.id, input.tableId),
            eq(restaurantTables.restaurantId, input.restaurantId),
            isNull(restaurantTables.archivedAt),
          ),
        )
        .for("update");

      if (!table) {
        throw new OrderError("Table not found.");
      }

      if (table.status === "reserved") {
        throw new OrderError("This table is reserved. Please ask the staff for help.");
      }

      const menu = await tx
        .select()
        .from(menuItems)
        .where(eq(menuItems.restaurantId, input.restaurantId));

      const active = menu.filter((m) => m.archivedAt === null);

      const problems: string[] = [];
      const merged = new Map<
        string,
        { item: (typeof active)[number]; qty: number }
      >();

      for (const line of input.lines) {
        if (
          !Number.isInteger(line?.qty) ||
          line.qty < 1 ||
          line.qty > MAX_LINE_QTY
        ) {
          problems.push(
            `Quantity must be a whole number from 1 to ${MAX_LINE_QTY}.`,
          );
          continue;
        }

        const item =
          typeof line.itemId === "string" && line.itemId
            ? active.find((m) => m.id === line.itemId)
            : active.find((m) => m.code === String(line.code));

        if (!item) {
          problems.push(
            `Item ${line.code} is no longer on the menu — please remove it.`,
          );
          continue;
        }

        if (!item.available) {
          problems.push(
            `${item.name} just became unavailable — please remove it.`,
          );
          continue;
        }

        const existing = merged.get(item.id);

        if (existing) {
          existing.qty += line.qty;
        } else {
          merged.set(item.id, { item, qty: line.qty });
        }
      }

      if (problems.length > 0) {
        throw new OrderError(Array.from(new Set(problems)).join(" "));
      }

      if (merged.size === 0) {
        throw new OrderError("Your cart is empty.");
      }

      // ---- find this table's open order (an earlier, not-yet-paid round) ----
      const candidates = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tableId, input.tableId),
            eq(orders.restaurantId, input.restaurantId),
            ne(orders.status, "cancelled"),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(5);

      let open: (typeof candidates)[number] | null = null;
      for (const c of candidates) {
        const [bill] = await tx.select().from(bills).where(eq(bills.orderId, c.id));
        if (!bill) {
          open = c;
          break;
        }
        if (bill.paidAt !== null) continue; // settled: a new customer starts a new order
        const part = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.billId, bill.id));
        if (part.length > 0) {
          throw new OrderError(
            "A part-payment is in progress on this table. Please ask the staff to add more items.",
          );
        }
        open = c;
        break;
      }

      const now = new Date();
      let orderId: string;
      let orderNo: number | null;
      let round = 1;

      if (open) {
        orderId = open.id;
        orderNo = open.orderNo;
        const [{ maxRound }] = await tx
          .select({ maxRound: sql<number>`coalesce(max(${orderItems.round}), 0)` })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));
        round = Number(maxRound) + 1;
      } else {
        orderId = randomUUID();
        const [created] = await tx
          .insert(orders)
          .values({
            id: orderId,
            restaurantId: input.restaurantId,
            tableId: input.tableId,
            status: "new",
            createdAt: now,
            statusUpdatedAt: now,
            updatedAt: now,
          })
          .returning({ orderNo: orders.orderNo });
        orderNo = created.orderNo;
        await tx.insert(orderEvents).values({
          id: randomUUID(),
          restaurantId: input.restaurantId,
          orderId,
          fromStatus: null,
          toStatus: "new",
        });
      }

      const itemRows: (typeof orderItems.$inferInsert)[] = [];

      for (const { item, qty } of merged.values()) {
        // Use the existing pricing rule, which expects prices in rupees.
        const effectiveRupees = getEffectivePrice({
          priceRupees: item.pricePaise / 100,
          discountPercent: item.discountPercent,
        } as Parameters<typeof getEffectivePrice>[0]);

        itemRows.push({
          id: randomUUID(),
          orderId,
          menuItemId: item.id,
          code: item.code,
          nameSnapshot: item.name,
          categorySnapshot: item.category,
          qty,
          round,
          pricePaise: Math.round(effectiveRupees * 100),
          basePricePaise: item.pricePaise,
          discountPercent: item.discountPercent,
          prepMinutes: item.prepMinutes,
          createdAt: now,
        });
      }

      await tx.insert(orderItems).values(itemRows);

      if (open) {
        // An extra round must reach the kitchen again, so a finished order
        // goes back to "new". Earlier rounds and their prices stay untouched.
        if (["ready", "served", "billed"].includes(open.status)) {
          await tx
            .update(orders)
            .set({ status: "new", statusUpdatedAt: now, updatedAt: now })
            .where(eq(orders.id, orderId));
          await tx.insert(orderEvents).values({
            id: randomUUID(),
            restaurantId: input.restaurantId,
            orderId,
            fromStatus: open.status,
            toStatus: "new",
          });
        } else {
          await tx.update(orders).set({ updatedAt: now }).where(eq(orders.id, orderId));
        }
        // If a bill was already issued (unpaid), it now covers every round.
        await recomputeUnpaidBillTx(tx, orderId);
      }

      await tx
        .update(restaurantTables)
        .set({ status: "occupied", currentOrderId: orderId, updatedAt: now })
        .where(
          and(
            eq(restaurantTables.id, input.tableId),
            eq(restaurantTables.restaurantId, input.restaurantId),
          ),
        );

      return { orderId, orderNo, round, appended: Boolean(open) };
    });

    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof OrderError) {
      return { ok: false, error: err.message };
    }

    console.error("createOrderInDb failed", err);

    return {
      ok: false,
      error: "Could not place the order. Please try again.",
    };
  }
}

/** Active (not billed/cancelled) orders in the existing UI shape. */
export async function listActiveOrders(
  restaurantId: string,
): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        notInArray(orders.status, ["billed", "cancelled"]),
      ),
    )
    .orderBy(asc(orders.createdAt));

  return hydrateOrders(rows);
}

/** Every order, including billed and cancelled orders, for history/reports. */
export async function listAllOrders(
  restaurantId: string,
): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.restaurantId, restaurantId))
    .orderBy(asc(orders.createdAt));

  return hydrateOrders(rows);
}

/** Fetches one order belonging to the specified restaurant. */
export async function getOrderFromDb(
  restaurantId: string,
  orderId: string,
): Promise<Order | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, restaurantId),
      ),
    );

  return (await hydrateOrders(rows))[0] ?? null;
}

/** Lists the restaurant's tables in the existing UI shape. */
export async function listTables(
  restaurantId: string,
): Promise<RestaurantTable[]> {
  const rows = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.restaurantId, restaurantId),
        isNull(restaurantTables.archivedAt),
      ),
    )
    .orderBy(
      asc(restaurantTables.number),
      asc(restaurantTables.label),
    );

  return rows.map((t) => ({
    id: t.id,
    label: t.label,
    status: t.status,
    currentOrderId: t.currentOrderId,
    waiterCalled: t.waiterCalled,
    waiterCalledAt: t.waiterCalledAt
      ? t.waiterCalledAt.getTime()
      : null,
  }));
}

export type TransitionDbResult =
  | { ok: true; from: OrderStatus; to: OrderStatus }
  | {
      ok: false;
      reason:
        | "not-found"
        | "already-served"
        | "already-billed"
        | "status-changed";
    };

/**
 * Moves an order one step: new → preparing → ready → served.
 * The status-guarded update prevents concurrent actions from skipping steps.
 */
export async function transitionOrderInDb(
  restaurantId: string,
  orderId: string,
  expectedFrom?: OrderStatus,
  actorUserId?: string,
): Promise<TransitionDbResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId),
        ),
      );

    if (!order) {
      return { ok: false, reason: "not-found" } as const;
    }

    if (order.status === "billed") {
      return { ok: false, reason: "already-billed" } as const;
    }

    if (expectedFrom !== undefined && order.status !== expectedFrom) {
      return { ok: false, reason: "status-changed" } as const;
    }

    const idx = FLOW.indexOf(order.status as OrderStatus);

    if (idx === -1 || idx === FLOW.length - 1) {
      return { ok: false, reason: "already-served" } as const;
    }

    const from = order.status as OrderStatus;
    const to = FLOW[idx + 1];
    const now = new Date();

    const updated = await tx
      .update(orders)
      .set({
        status: to,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId),
          eq(orders.status, from),
        ),
      )
      .returning({ id: orders.id });

    if (updated.length === 0) {
      return { ok: false, reason: "status-changed" } as const;
    }

    await tx.insert(orderEvents).values({
      id: randomUUID(),
      restaurantId,
      orderId,
      fromStatus: from,
      toStatus: to,
      actorUserId: actorUserId ?? null,
    });

    return { ok: true, from, to } as const;
  });
}

/** Updates whether a restaurant table has an outstanding waiter call. */
export async function setWaiterCalledInDb(
  restaurantId: string,
  tableId: string,
  called: boolean,
): Promise<boolean> {
  const now = new Date();

  const rows = await db
    .update(restaurantTables)
    .set({
      waiterCalled: called,
      waiterCalledAt: called ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(restaurantTables.id, tableId),
        eq(restaurantTables.restaurantId, restaurantId),
      ),
    )
    .returning({ id: restaurantTables.id });

  return rows.length > 0;
}


export type CancelOrderDbResult =
  | { ok: true; tableId: string }
  | { ok: false; reason: "not-found" | "already-cancelled" | "has-payment" };

/**
 * Cancels an order that has not been paid. History is kept (status becomes
 * "cancelled", an event is recorded); an unpaid bill is left in place but
 * zero-impact because the order is no longer active. The table is released
 * only when nothing else is open on it.
 */
export async function cancelOrderInDb(
  restaurantId: string,
  orderId: string,
  actorUserId?: string,
): Promise<CancelOrderDbResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
      .for("update");
    if (!order) return { ok: false, reason: "not-found" } as const;
    if (order.status === "cancelled") return { ok: false, reason: "already-cancelled" } as const;

    const [bill] = await tx.select().from(bills).where(eq(bills.orderId, order.id));
    if (bill) {
      const paid = await tx.select({ id: payments.id }).from(payments).where(eq(payments.billId, bill.id));
      if (bill.paidAt !== null || paid.length > 0) return { ok: false, reason: "has-payment" } as const;
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({ status: "cancelled", statusUpdatedAt: now, updatedAt: now })
      .where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({
      id: randomUUID(),
      restaurantId,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "cancelled",
      actorUserId: actorUserId ?? null,
    });

    const stillOpen = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tableId, order.tableId),
          eq(orders.restaurantId, restaurantId),
          notInArray(orders.status, ["billed", "cancelled"]),
        ),
      );
    if (stillOpen.length === 0) {
      await tx
        .update(restaurantTables)
        .set({ status: "available", currentOrderId: null, updatedAt: now })
        .where(and(eq(restaurantTables.id, order.tableId), eq(restaurantTables.status, "occupied")));
    }
    return { ok: true, tableId: order.tableId } as const;
  });
}
