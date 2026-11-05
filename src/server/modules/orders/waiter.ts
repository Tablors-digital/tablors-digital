import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { restaurantTables, waiterCalls, notifications } from "@/server/db/schema";

export type WaiterState =
  | { status: "none" }
  | { status: "ringing"; callId: string; calledAt: number }
  | { status: "acknowledged"; callId: string; calledAt: number; acknowledgedAt: number };

/** Creates (or re-uses the still-open) waiter call for a table. */
export async function requestWaiterDb(
  restaurantId: string,
  tableId: string,
): Promise<{ ok: true; callId: string; calledAt: number; created: boolean } | { ok: false }> {
  return db.transaction(async (tx) => {
    const [table] = await tx
      .select({ id: restaurantTables.id })
      .from(restaurantTables)
      .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, restaurantId)))
      .for("update");
    if (!table) return { ok: false as const };

    const [open] = await tx
      .select()
      .from(waiterCalls)
      .where(and(eq(waiterCalls.tableId, tableId), eq(waiterCalls.restaurantId, restaurantId), isNull(waiterCalls.acknowledgedAt)))
      .orderBy(desc(waiterCalls.calledAt))
      .limit(1);
    if (open) return { ok: true as const, callId: open.id, calledAt: open.calledAt.getTime(), created: false };

    const now = new Date();
    const id = randomUUID();
    await tx.insert(waiterCalls).values({ id, restaurantId, tableId, calledAt: now });
    await tx
      .update(restaurantTables)
      .set({ waiterCalled: true, waiterCalledAt: now, updatedAt: now })
      .where(eq(restaurantTables.id, tableId));
    return { ok: true as const, callId: id, calledAt: now.getTime(), created: true };
  });
}

/** Staff acknowledges every open call on the table; notifications follow suit. */
export async function acknowledgeWaiterDb(
  restaurantId: string,
  tableId: string,
  by: string | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const open = await tx
      .update(waiterCalls)
      .set({ acknowledgedAt: now, acknowledgedBy: by })
      .where(and(eq(waiterCalls.tableId, tableId), eq(waiterCalls.restaurantId, restaurantId), isNull(waiterCalls.acknowledgedAt)))
      .returning({ id: waiterCalls.id });

    await tx
      .update(restaurantTables)
      .set({ waiterCalled: false, waiterCalledAt: null, updatedAt: now })
      .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, restaurantId)));

    for (const c of open) {
      await tx
        .update(notifications)
        .set({ status: "acknowledged", readAt: now })
        .where(and(eq(notifications.restaurantId, restaurantId), eq(notifications.dedupeKey, `waiter:${c.id}`)));
    }
    return open.length > 0;
  });
}

export async function getWaiterStateDb(restaurantId: string, tableId: string): Promise<WaiterState> {
  const [last] = await db
    .select()
    .from(waiterCalls)
    .where(and(eq(waiterCalls.tableId, tableId), eq(waiterCalls.restaurantId, restaurantId)))
    .orderBy(desc(waiterCalls.calledAt))
    .limit(1);
  if (!last) return { status: "none" };
  if (!last.acknowledgedAt) return { status: "ringing", callId: last.id, calledAt: last.calledAt.getTime() };
  // The "acknowledged" state is shown on the device for a short while only.
  if (Date.now() - last.acknowledgedAt.getTime() > 20_000) return { status: "none" };
  return { status: "acknowledged", callId: last.id, calledAt: last.calledAt.getTime(), acknowledgedAt: last.acknowledgedAt.getTime() };
}
