import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { ledgerBalances, pots } from "@/server/db/schema";

export type PotResult = { ok: true; id?: string } | { ok: false; message: string };

export async function listPotsDb(businessId: string) {
  return db.select().from(pots)
    .where(and(eq(pots.businessId, businessId), isNull(pots.archivedAt)))
    .orderBy(asc(pots.createdAt));
}

export async function createPotDb(businessId: string, name: string, type = "CUSTOM"): Promise<PotResult> {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40) return { ok: false, message: "Name must be 2–40 characters." };
  try {
    const id = `pot_${randomUUID().slice(0, 8)}`;
    await db.insert(pots).values({ id, businessId, type, name: clean });
    return { ok: true, id };
  } catch {
    return { ok: false, message: "A pot with that name already exists." };
  }
}

export async function renamePotDb(businessId: string, id: string, name: string): Promise<PotResult> {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40) return { ok: false, message: "Name must be 2–40 characters." };
  try {
    const r = await db.update(pots).set({ name: clean, updatedAt: new Date() })
      .where(and(eq(pots.id, id), eq(pots.businessId, businessId), isNull(pots.archivedAt)))
      .returning({ id: pots.id });
    return r.length ? { ok: true } : { ok: false, message: "Pot not found." };
  } catch {
    return { ok: false, message: "A pot with that name already exists." };
  }
}

/** Soft delete (archive). Refused for built-in pots and for any non-zero balance. */
export async function deletePotDb(businessId: string, id: string): Promise<PotResult> {
  return db.transaction(async (tx) => {
    const [pot] = await tx.select().from(pots)
      .where(and(eq(pots.id, id), eq(pots.businessId, businessId), isNull(pots.archivedAt))).for("update");
    if (!pot) return { ok: false, message: "Pot not found." };
    if (pot.type !== "CUSTOM") return { ok: false, message: "Built-in pots can't be deleted." };
    const [bal] = await tx.select().from(ledgerBalances)
      .where(and(eq(ledgerBalances.businessId, businessId), eq(ledgerBalances.account, `POT:${id}`))).for("update");
    if ((bal?.balancePaise ?? 0) !== 0) return { ok: false, message: "Move the remaining balance out first." };
    // Once rules/payouts are stored in the DB, also refuse here when an enabled rule
    // targets this pot or a payout is pending/approved.
    await tx.update(pots).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(pots.id, id));
    return { ok: true };
  });
}