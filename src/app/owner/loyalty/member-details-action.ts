"use server";

import { hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession } from "@/server/modules/auth/session";
import { getBalanceDb, getLedgerDb, listCustomersDb } from "@/server/modules/loyalty-db/db-loyalty";

export type MemberHistoryRow = {
  id: string;
  type: string;
  points: number;
  reason: string | null;
  ref: string | null;
  at: string;
};

export type MemberDetails =
  | {
      ok: true;
      earned: number;
      redeemed: number;
      reversed: number;
      expired: number;
      adjusted: number;
      /** Ledger balance (sum of every transaction). */
      balance: number;
      onHold: number;
      /** What the member can actually redeem right now. */
      available: number;
      history: MemberHistoryRow[];
    }
  | { ok: false; error: string };

/** Read-only: points history and totals for one member of this restaurant. */
export async function getMemberDetailsAction(customerId: string): Promise<MemberDetails> {
  const session = await getDemoSession();
  if (!session || !hasPermission(session.role, "loyalty")) {
    return { ok: false, error: "You don't have access to loyalty." };
  }
  if (typeof customerId !== "string" || !customerId || customerId.length > 100) {
    return { ok: false, error: "Member not found." };
  }

  try {
    const [ledger, bal] = await Promise.all([
      getLedgerDb(session.restaurantId, customerId, 1000),
      getBalanceDb(session.restaurantId, customerId),
    ]);
    const sum = (type: string) => ledger.filter((t) => t.type === type).reduce((s, t) => s + t.points, 0);

    return {
      ok: true,
      earned: sum("EARN"),
      redeemed: Math.abs(sum("REDEEM")),
      reversed: Math.abs(sum("REFUND_REVERSAL")),
      expired: Math.abs(sum("EXPIRE")),
      adjusted: sum("ADJUST"),
      balance: bal.balance,
      onHold: bal.onHold,
      available: bal.available,
      history: ledger.slice(0, 50).map((t) => ({
        id: t.id,
        type: t.type,
        points: t.points,
        reason: t.reason,
        ref: t.sourceId ? t.sourceId.slice(0, 8) : null,
        at: t.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("getMemberDetailsAction failed", err);
    return { ok: false, error: "Couldn't load this member. Please try again." };
  }
}

/**
 * Server-side member search by mobile number. Full numbers never reach the
 * browser (the list shows masked numbers), so a typed number is matched here
 * and only member ids come back.
 */
export async function searchMembersAction(query: string): Promise<{ ok: true; ids: string[] } | { ok: false }> {
  const session = await getDemoSession();
  if (!session || !hasPermission(session.role, "loyalty")) return { ok: false };
  const digits = String(query ?? "").replace(/\D/g, "").slice(0, 15);
  if (digits.length < 2) return { ok: true, ids: [] };
  try {
    const all = await listCustomersDb(session.restaurantId, 1000);
    const needle = digits.length > 10 ? digits.slice(-10) : digits;
    return { ok: true, ids: all.filter((c) => c.phone.includes(needle)).map((c) => c.id) };
  } catch (err) {
    console.error("searchMembersAction failed", err);
    return { ok: false };
  }
}
