import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { ledgerBalances, ledgerEntries, ledgerJournals } from "@/server/db/schema";
import { assertPaise, type Paise } from "./money";
import { InsufficientFundsError, type Account, type Leg } from "./ledger";

/** Atomic double-entry post. Returns false (writes nothing) if the idempotency key was already used. */
export async function postJournalDb(p: {
  businessId: string; key: string; sourceId: string; legs: Leg[]; actorId: string; at: Date; reason?: string;
}): Promise<boolean> {
  const live = p.legs.filter((l) => l.amount !== 0);
  live.forEach((l) => assertPaise(l.amount, "leg"));
  if (live.reduce((a, l) => a + l.amount, 0) !== 0) throw new Error("journal does not balance");

  return db.transaction(async (tx) => {
    const journalId = randomUUID();
    const ins = await tx.insert(ledgerJournals).values({
      id: journalId, businessId: p.businessId, idempotencyKey: p.key,
      sourceId: p.sourceId, actorId: p.actorId, reason: p.reason ?? null, createdAt: p.at,
    }).onConflictDoNothing().returning({ id: ledgerJournals.id });
    if (ins.length === 0) return false;

    const delta = new Map<Account, number>();
    for (const l of live) delta.set(l.account, (delta.get(l.account) ?? 0) + l.amount);
    const accounts = [...delta.keys()].sort(); // fixed lock order: no deadlocks

    for (const account of accounts) {
      await tx.insert(ledgerBalances).values({ businessId: p.businessId, account, balancePaise: 0 }).onConflictDoNothing();
    }
    const locked = await tx.select().from(ledgerBalances)
      .where(and(eq(ledgerBalances.businessId, p.businessId), inArray(ledgerBalances.account, accounts)))
      .orderBy(ledgerBalances.account).for("update");

    for (const row of locked) {
      const after = row.balancePaise + (delta.get(row.account as Account) ?? 0);
      // SETTLEMENT is a contra account (must stay <= 0); every other account must stay >= 0.
      if (row.account === "SETTLEMENT" ? after > 0 : after < 0) {
        throw new InsufficientFundsError(row.account, Math.abs(after) as Paise); // rolls back the journal too
      }
    }

    if (live.length) {
      await tx.insert(ledgerEntries).values(live.map((l) => ({
        id: randomUUID(), businessId: p.businessId, journalId, account: l.account, amountPaise: l.amount,
        sourceType: l.sourceType, sourceId: p.sourceId, ruleId: l.ruleId ?? null, ruleVersion: l.ruleVersion ?? null,
        actorId: p.actorId, reason: p.reason ?? null, createdAt: p.at,
      })));
    }
    for (const [account, d] of delta) {
      await tx.update(ledgerBalances)
        .set({ balancePaise: sql`${ledgerBalances.balancePaise} + ${d}`, updatedAt: new Date() })
        .where(and(eq(ledgerBalances.businessId, p.businessId), eq(ledgerBalances.account, account)));
    }
    return true;
  });
}

export async function balanceDb(businessId: string, account: Account): Promise<number> {
  const [r] = await db.select({ b: ledgerBalances.balancePaise }).from(ledgerBalances)
    .where(and(eq(ledgerBalances.businessId, businessId), eq(ledgerBalances.account, account)));
  return r?.b ?? 0;
}

export async function merchantFundsDb(businessId: string): Promise<number> {
  return -(await balanceDb(businessId, "SETTLEMENT")) || 0;
}

export async function entriesDb(businessId: string, account: Account, limit = 500) {
  return db.select().from(ledgerEntries)
    .where(and(eq(ledgerEntries.businessId, businessId), eq(ledgerEntries.account, account)))
    .orderBy(ledgerEntries.createdAt).limit(limit);
}

/** Recomputes from entries and compares with the cached balances. */
export async function reconcileDb(businessId: string) {
  const sums = await db.select({
    account: ledgerEntries.account,
    total: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}),0)::bigint`.mapWith(Number),
  }).from(ledgerEntries).where(eq(ledgerEntries.businessId, businessId)).groupBy(ledgerEntries.account);
  const cached = await db.select().from(ledgerBalances).where(eq(ledgerBalances.businessId, businessId));
  const byAcc = new Map(sums.map((s) => [s.account, s.total]));
  const issues: string[] = [];
  for (const c of cached) {
    const real = byAcc.get(c.account) ?? 0;
    if (real !== c.balancePaise) issues.push(`${c.account}: cache ${c.balancePaise} != entries ${real}`);
  }
  const net = sums.reduce((a, s) => a + s.total, 0);
  if (net !== 0) issues.push(`ledger does not net to zero (${net})`);
  return { ok: issues.length === 0, issues };
}