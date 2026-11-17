/**
 * Business insights for the owner dashboard. Every line is derived from the
 * numbers passed in; if a number isn't there, the insight isn't produced.
 */
export interface InsightInput {
  salesTodayRupees: number;
  salesYesterdayRupees: number;
  pendingOrders: number;
  lowStockItems: number;
  outOfStockItems: number;
  /** Active staff who are expected to use attendance. */
  activeStaff: number;
  checkedInToday: number;
  /** Best-selling item today (by quantity), if any orders exist. */
  topItemToday: { name: string; qty: number } | null;
}

export type Insight = { tone: "good" | "warn" | "info"; text: string };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];

  if (i.salesYesterdayRupees > 0 && i.salesTodayRupees > 0) {
    const pct = Math.round(((i.salesTodayRupees - i.salesYesterdayRupees) / i.salesYesterdayRupees) * 100);
    if (pct > 0) out.push({ tone: "good", text: `Paid sales are up ${pct}% on yesterday (${inr(i.salesTodayRupees)} vs ${inr(i.salesYesterdayRupees)}).` });
    else if (pct < 0) out.push({ tone: "warn", text: `Paid sales are ${Math.abs(pct)}% below yesterday so far (${inr(i.salesTodayRupees)} vs ${inr(i.salesYesterdayRupees)}).` });
  }

  if (i.topItemToday && i.topItemToday.qty > 0) {
    out.push({ tone: "info", text: `${i.topItemToday.name} is today's best seller (${i.topItemToday.qty} ordered).` });
  }

  if (i.pendingOrders > 0) {
    out.push({ tone: "warn", text: `${i.pendingOrders} ${i.pendingOrders === 1 ? "order is" : "orders are"} still waiting to be served.` });
  }

  if (i.outOfStockItems > 0) {
    out.push({ tone: "warn", text: `${i.outOfStockItems} inventory ${i.outOfStockItems === 1 ? "item is" : "items are"} out of stock.` });
  }
  if (i.lowStockItems > 0) {
    out.push({ tone: "warn", text: `${i.lowStockItems} inventory ${i.lowStockItems === 1 ? "item is" : "items are"} running low.` });
  }

  // Only meaningful once attendance is actually being recorded today.
  if (i.checkedInToday > 0 && i.activeStaff > i.checkedInToday) {
    const missing = i.activeStaff - i.checkedInToday;
    out.push({ tone: "info", text: `${missing} of ${i.activeStaff} active staff haven't checked in today.` });
  }

  return out;
}
