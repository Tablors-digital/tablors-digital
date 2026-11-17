import { describe, expect, it } from "vitest";
import { Ledger } from "@/server/modules/pots/ledger";
import { balanceTrend, collectionTrend, allocationSlices, buildOverviewAnalytics, indicativeNextGstDue, windowFor } from "@/server/modules/pots/analytics";
import { createDefaultPots } from "@/server/modules/pots/support";
import { DEMO_BUSINESS_ID as B, getPotsRuntime, resetPotsRuntimeForTests } from "@/server/modules/pots/runtime";

const DAY = 86_400_000;
// 12 Nov 2026 12:00 IST
const NOW = new Date("2026-11-12T06:30:00Z");
const at = (daysAgo: number, hours = 0) => new Date(NOW.getTime() - daysAgo * DAY + hours * 3_600_000);

/** Posts a customer payment of `gross` then allocates `alloc` of it to `potId`. */
function pay(l: Ledger, key: string, gross: number, potId: string | null, alloc: number, when: Date) {
  const legs = [{ account: "SETTLEMENT" as const, amount: -gross, sourceType: "PAYMENT_RECEIVED" as const }, { account: "UNALLOCATED" as const, amount: gross, sourceType: "PAYMENT_RECEIVED" as const }];
  l.post(B, `pay:${key}`, key, legs, "system", when);
  if (potId && alloc > 0) l.post(B, `alloc:${key}`, key, [{ account: "UNALLOCATED", amount: -alloc, sourceType: "ALLOCATION" }, { account: `POT:${potId}`, amount: alloc, sourceType: "ALLOCATION" }], "system", when);
}
const spend = (l: Ledger, key: string, potId: string, amt: number, when: Date) =>
  l.post(B, `spend:${key}`, key, [{ account: `POT:${potId}`, amount: -amt, sourceType: "PAYOUT" }, { account: "SETTLEMENT", amount: amt, sourceType: "PAYOUT" }], "owner", when);

describe("balanceTrend", () => {
  const pots = createDefaultPots(B); const gst = pots[0]!.id;

  it("is 'none' for a pot with no history and never invents a percentage", () => {
    const t = balanceTrend([], at(30).getTime(), NOW.getTime());
    expect(t.direction).toBe("none"); expect(t.pct).toBeNull(); expect(t.pctNote).toBe("No history yet");
  });

  it("goes up (green) when the closing balance exceeds the opening balance, with a real percentage", () => {
    const l = new Ledger();
    pay(l, "a", 100000, gst, 10000, at(20)); // before the 7-day window
    pay(l, "b", 100000, gst, 5000, at(2));
    const w = windowFor("7d", NOW, null);
    const t = balanceTrend(l.potEntries(B, gst), w.from, w.to);
    expect(t.previous).toBe(10000); expect(t.current).toBe(15000); expect(t.change).toBe(5000);
    expect(t.direction).toBe("up"); expect(t.pct).toBe(50);
  });

  it("goes down (red) when the balance fell, from the actual debit", () => {
    const l = new Ledger();
    pay(l, "a", 100000, gst, 40000, at(20));
    spend(l, "s", gst, 10000, at(1));
    const w = windowFor("7d", NOW, null);
    const t = balanceTrend(l.potEntries(B, gst), w.from, w.to);
    expect(t.direction).toBe("down"); expect(t.change).toBe(-10000); expect(t.pct).toBe(-25);
  });

  it("is 'flat' when there was history but no net change", () => {
    const l = new Ledger();
    pay(l, "a", 100000, gst, 40000, at(20));
    const w = windowFor("7d", NOW, null);
    const t = balanceTrend(l.potEntries(B, gst), w.from, w.to);
    expect(t.direction).toBe("flat"); expect(t.pct).toBe(0);
  });

  it("refuses a fake percentage when the previous period had no balance", () => {
    const l = new Ledger();
    pay(l, "a", 100000, gst, 8000, at(1));
    const w = windowFor("7d", NOW, null);
    const t = balanceTrend(l.potEntries(B, gst), w.from, w.to);
    expect(t.direction).toBe("up"); expect(t.pct).toBeNull(); expect(t.pctNote).toContain("previous period");
  });

  it("does not compare in 'all' mode", () => {
    const l = new Ledger(); pay(l, "a", 100000, gst, 8000, at(3));
    const w = windowFor("all", NOW, at(3).getTime());
    const t = balanceTrend(l.potEntries(B, gst), w.from, w.to, false);
    expect(t.previous).toBeNull(); expect(t.pct).toBeNull(); expect(t.direction).toBe("up");
  });

  it("the sparkline points follow the real running balance", () => {
    const l = new Ledger();
    pay(l, "a", 100000, gst, 10000, at(3)); pay(l, "b", 100000, gst, 5000, at(2)); spend(l, "s", gst, 3000, at(1));
    const w = windowFor("7d", NOW, null);
    const t = balanceTrend(l.potEntries(B, gst), w.from, w.to);
    expect(t.points.map((p) => p.v)).toEqual([0, 10000, 15000, 12000, 12000]);
  });
});

describe("collectionTrend / donut / overview", () => {
  it("is empty (no fake data) with no payments", () => {
    resetPotsRuntimeForTests();
    const c = collectionTrend(getPotsRuntime(), "30d", NOW);
    expect(c.hasData).toBe(false); expect(c.buckets).toHaveLength(0); expect(c.pct).toBeNull();
  });

  it("buckets by IST day, subtracts refunds, and compares to the previous equal period", () => {
    resetPotsRuntimeForTests(); const rt = getPotsRuntime();
    pay(rt.ledger, "p0", 20000, null, 0, at(10)); // previous 7d period
    pay(rt.ledger, "p1", 30000, null, 0, at(3));
    pay(rt.ledger, "p2", 30000, null, 0, at(0));
    const c = collectionTrend(rt, "7d", NOW);
    expect(c.total).toBe(60000); expect(c.previousTotal).toBe(20000); expect(c.pct).toBe(200);
    expect(c.granularity).toBe("day");
    expect(c.buckets.reduce((a, b) => a + b.v, 0)).toBe(60000);
  });

  it("uses hourly buckets when history is under two days", () => {
    resetPotsRuntimeForTests(); const rt = getPotsRuntime();
    pay(rt.ledger, "p1", 10000, null, 0, at(0, -3));
    expect(collectionTrend(rt, "30d", NOW).granularity).toBe("hour");
  });

  it("donut slices sum to the money held and percentages add to ~100", () => {
    resetPotsRuntimeForTests(); const rt = getPotsRuntime();
    const gst = rt.pots.find((p) => p.type === "GST")!.id;
    pay(rt.ledger, "p1", 100000, gst, 25000, at(0, -1));
    const d = allocationSlices(rt);
    expect(d.total).toBe(100000); expect(d.slices.find((s) => s.key === "GST")!.percent).toBe(25);
    expect(d.slices.find((s) => s.key === "UNALLOCATED")!.percent).toBe(75);
  });

  it("per-pot card colours come from each pot's own history", () => {
    resetPotsRuntimeForTests(); const rt = getPotsRuntime();
    const gst = rt.pots.find((p) => p.type === "GST")!.id, sal = rt.pots.find((p) => p.type === "SALARY")!.id;
    pay(rt.ledger, "a", 100000, gst, 20000, at(20)); pay(rt.ledger, "b", 100000, sal, 30000, at(20));
    pay(rt.ledger, "c", 100000, gst, 10000, at(1)); spend(rt.ledger, "s", sal, 10000, at(1));
    const o = buildOverviewAnalytics(rt, "7d", NOW);
    const dir = (type: string) => o.cards.find((c) => c.pot.type === type)!.trend.direction;
    expect(dir("GST")).toBe("up"); expect(dir("SALARY")).toBe("down"); expect(dir("INVENTORY")).toBe("none");
    expect(o.cards.find((c) => c.pot.type === "SALARY")!.trend.pct).toBeCloseTo(-33.3, 1);
  });
});

describe("indicativeNextGstDue", () => {
  it("is the 20th of this month before the 20th, next month after", () => {
    expect(indicativeNextGstDue(new Date("2026-11-12T06:00:00Z")).label).toBe("20 Nov 2026");
    expect(indicativeNextGstDue(new Date("2026-11-25T06:00:00Z")).label).toBe("20 Dec 2026");
    expect(indicativeNextGstDue(new Date("2026-12-25T06:00:00Z")).label).toBe("20 Jan 2027");
  });
});
