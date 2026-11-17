import type { Paise } from "./money";
import type { LedgerEntry } from "./ledger";
import { DEMO_BUSINESS_ID as B, type PotsRuntime } from "./runtime";
import type { Pot } from "./support";
import { buildDashboard, istDayBounds, potSlug } from "./views";

/**
 * Read-only analytics for the Financial Pots screens.
 *
 * EVERY number and every graph point here is derived from ledger entries (and payouts / payroll
 * audit rows). Nothing is stored, estimated, interpolated or randomly assigned:
 *  - a pot's trend direction is the sign of (closing balance - opening balance) of the window;
 *  - a percentage is only produced when the previous-period balance is > 0, otherwise it is null
 *    and a plain-language reason is returned instead of a fake figure;
 *  - a pot that has no ledger entries at all reports direction "none" (empty state).
 *
 * LIMITATION: the ledger is in-memory (see ledger.ts), so history only goes back to the last
 * server start. `historyNote()` exposes that to the UI. A Postgres-backed ledger that keeps the
 * same append-only rows would make these functions return permanent history unchanged.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type RangeKey = "7d" | "30d" | "90d" | "all";
export const RANGES: readonly { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" }, { key: "30d", label: "30D" }, { key: "90d", label: "90D" }, { key: "all", label: "All" },
];
export const parseRange = (v?: string): RangeKey => (RANGES.some((r) => r.key === v) ? (v as RangeKey) : "30d");
const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export interface SeriesPoint { t: number; v: Paise }
export type Direction = "up" | "down" | "flat" | "none";

export interface Trend {
  direction: Direction;
  /** Balance at the end of the window. */
  current: Paise;
  /** Balance at the start of the window = end of the previous period. null for "all" (no earlier period). */
  previous: Paise | null;
  change: Paise;
  /** Percent change vs previous period, 1 decimal. null when it cannot be computed honestly. */
  pct: number | null;
  /** Why `pct` is null (shown in the UI instead of a made-up figure). */
  pctNote: string | null;
  from: number;
  to: number;
  points: SeriesPoint[];
  /** Ledger entries that exist for this account up to `to`. */
  entryCount: number;
}

const istDayStart = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;

/** Window start for a range. "all" starts at the first ledger entry (or now when the ledger is empty). */
export function windowFor(range: RangeKey, now: Date, firstEntryAt: number | null): { from: number; to: number } {
  const to = now.getTime();
  if (range === "all") return { from: Math.min(firstEntryAt ?? to, to), to };
  return { from: istDayStart(to) - (RANGE_DAYS[range] - 1) * DAY_MS, to };
}

const byTime = (a: LedgerEntry, b: LedgerEntry) => a.createdAt.getTime() - b.createdAt.getTime();

/** Trend of one account's balance over [from, to]. Pure: works on any list of that account's entries. */
export function balanceTrend(entries: readonly LedgerEntry[], from: number, to: number, hasEarlierPeriod = true): Trend {
  const sorted = [...entries].sort(byTime); // stable: ties keep insertion order
  let opening = 0, before = 0, running = 0, inWindow = 0;
  const points: SeriesPoint[] = [];
  for (const e of sorted) {
    const t = e.createdAt.getTime();
    if (t < from) { opening += e.amount; before++; continue; }
    if (t > to) break;
    if (inWindow === 0) { running = opening; points.push({ t: from, v: opening }); }
    running += e.amount; inWindow++;
    const last = points[points.length - 1];
    if (last && last.t === t) last.v = running; else points.push({ t, v: running });
  }
  const closing = inWindow === 0 ? opening : running;
  if (inWindow === 0) points.push({ t: from, v: opening });
  if (points[points.length - 1]!.t !== to) points.push({ t: to, v: closing });

  const entryCount = before + inWindow;
  const change = closing - opening;
  const direction: Direction = entryCount === 0 ? "none" : change > 0 ? "up" : change < 0 ? "down" : "flat";

  let pct: number | null = null, pctNote: string | null = null;
  if (entryCount === 0) pctNote = "No history yet";
  else if (!hasEarlierPeriod) pctNote = "Showing all history — no earlier period to compare";
  else if (opening > 0) pct = Math.round((change * 1000) / opening) / 10;
  else pctNote = change === 0 ? "No balance in the previous period" : "No balance in the previous period to compare with";

  return { direction, current: closing, previous: hasEarlierPeriod ? opening : null, change, pct, pctNote, from, to, points, entryCount };
}

function firstEntryAt(rt: PotsRuntime): number | null {
  let min: number | null = null;
  for (const e of rt.ledger.entries(B)) { const t = e.createdAt.getTime(); if (min === null || t < min) min = t; }
  return min;
}

export function historyNote(rt: PotsRuntime, now = new Date()) {
  const first = firstEntryAt(rt);
  return {
    firstEntryAt: first,
    daysOfHistory: first === null ? 0 : Math.max(1, Math.ceil((now.getTime() - first) / DAY_MS)),
    inMemory: true as const,
    message: "Ledger history is held in server memory, so graphs only reach back to the last server restart. Persist the ledger rows in Postgres (append-only journal_entries table) to keep permanent history; these charts will then show it with no code change.",
  };
}

// ---------- collection (sales) trend ----------
export interface Bucket { t0: number; t1: number; v: Paise }
export interface CollectionTrend {
  granularity: "hour" | "day";
  buckets: Bucket[];
  total: Paise;
  previousTotal: Paise | null;
  pct: number | null;
  pctNote: string | null;
  from: number; to: number;
  hasData: boolean;
}

/** Net sales (payments received minus refunds paid out) from the SETTLEMENT account. */
function saleEvents(rt: PotsRuntime): { t: number; v: Paise }[] {
  const out: { t: number; v: Paise }[] = [];
  for (const e of rt.ledger.entries(B, "SETTLEMENT")) {
    if (e.sourceType === "PAYMENT_RECEIVED" || e.sourceType === "REFUND_PAYOUT") out.push({ t: e.createdAt.getTime(), v: -e.amount });
  }
  return out;
}
const sumIn = (ev: { t: number; v: Paise }[], from: number, to: number) => ev.reduce((a, e) => (e.t >= from && e.t < to ? a + e.v : a), 0);

export function collectionTrend(rt: PotsRuntime, range: RangeKey, now = new Date()): CollectionTrend {
  const ev = saleEvents(rt).sort((a, b) => a.t - b.t);
  const firstSale = ev[0]?.t ?? null;
  const win = windowFor(range, now, firstSale);
  const nowMs = win.to;
  const effStart = Math.max(win.from, firstSale ?? nowMs);
  const hourly = nowMs - effStart <= 2 * DAY_MS;
  const buckets: Bucket[] = [];
  if (firstSale !== null) {
    const step = hourly ? HOUR_MS : DAY_MS;
    let t0 = hourly ? Math.floor(effStart / HOUR_MS) * HOUR_MS : istDayStart(effStart);
    while (t0 <= nowMs) { buckets.push({ t0, t1: t0 + step, v: sumIn(ev, t0, t0 + step) }); t0 += step; }
  }
  const total = sumIn(ev, win.from, nowMs + 1);
  let previousTotal: Paise | null = null, pct: number | null = null, pctNote: string | null = null;
  if (firstSale === null) pctNote = "No payments recorded yet";
  else if (range === "all") pctNote = "Showing all history — no earlier period to compare";
  else {
    previousTotal = sumIn(ev, win.from - (nowMs - win.from), win.from);
    if (previousTotal > 0) pct = Math.round(((total - previousTotal) * 1000) / previousTotal) / 10;
    else { previousTotal = null; pctNote = "No sales in the previous period to compare with"; }
  }
  return { granularity: hourly ? "hour" : "day", buckets, total, previousTotal, pct, pctNote, from: win.from, to: nowMs, hasData: firstSale !== null };
}

// ---------- allocation donut ----------
export interface Slice { key: string; label: string; value: Paise; percent: number; kind: "pot" | "unallocated"; slug?: string }
export function allocationSlices(rt: PotsRuntime): { slices: Slice[]; total: Paise } {
  const raw: Omit<Slice, "percent">[] = rt.pots
    .map((p): Omit<Slice, "percent"> => ({ key: p.type === "CUSTOM" ? p.id : p.type, label: p.name, value: rt.ledger.potBalance(B, p.id), kind: "pot", slug: potSlug(p) }))
    .filter((s) => s.value > 0);
  const un = rt.ledger.unallocated(B);
  if (un > 0) raw.push({ key: "UNALLOCATED", label: "Unallocated", value: un, kind: "unallocated" });
  const total = raw.reduce((a, s) => a + s.value, 0);
  return { total, slices: raw.map((s) => ({ ...s, percent: total > 0 ? Math.round((s.value * 1000) / total) / 10 : 0 })) };
}

// ---------- overview ----------
export interface PotTrendCard {
  slug: string; pot: Pot; balance: Paise; trend: Trend;
  status: ReturnType<typeof buildDashboard>["cards"][number]["status"];
  targetPaise?: Paise; progressPercent?: number; allocatedThisMonth: Paise;
}

export function buildOverviewAnalytics(rt: PotsRuntime, range: RangeKey, now = new Date()) {
  const dash = buildDashboard(rt, now);
  const first = firstEntryAt(rt);
  const win = windowFor(range, now, first);
  const cards: PotTrendCard[] = dash.cards.map((c) => ({
    slug: c.slug, pot: c.pot, balance: c.balance, status: c.status, targetPaise: c.targetPaise,
    progressPercent: c.progressPercent, allocatedThisMonth: c.allocatedThisMonth,
    trend: balanceTrend(rt.ledger.potEntries(B, c.pot.id), win.from, win.to, range !== "all"),
  }));
  // Collected today vs yesterday (IST), only when yesterday actually had sales.
  const [dFrom] = istDayBounds(now);
  const ev = saleEvents(rt);
  const yesterday = sumIn(ev, dFrom.getTime() - DAY_MS, dFrom.getTime());
  const todayPct = yesterday > 0 ? Math.round(((dash.totals.collectedToday - yesterday) * 1000) / yesterday) / 10 : null;
  return {
    dash, range, window: win, cards,
    donut: allocationSlices(rt),
    collection: collectionTrend(rt, range, now),
    todayVsYesterday: { yesterday: yesterday > 0 ? yesterday : null, pct: todayPct },
    pendingApprovals: rt.payouts.pending(B).length,
    history: historyNote(rt, now),
  };
}

// ---------- GST ----------
export type TimelineKind = "allocation" | "reversal" | "reserve" | "release" | "transfer" | "payout-requested" | "payout-approved" | "payout-paid" | "payout-failed" | "payout-cancelled";
export interface TimelineEvent { id: string; at: number; kind: TimelineKind; title: string; detail: string; amount: Paise | null }

/** GSTR-3B monthly filers: due on the 20th of the following month. A calendar rule, NOT stored data. */
export function indicativeNextGstDue(now: Date): { date: Date; label: string; basis: string } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + (ist.getUTCDate() > 20 ? 1 : 0);
  const date = new Date(Date.UTC(y, m, 20) - IST_OFFSET_MS);
  return { date, label: date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }), basis: "Indicative: GSTR-3B monthly filing falls on the 20th. Confirm your own due date with your accountant." };
}

export function buildGstAnalytics(rt: PotsRuntime, range: RangeKey, now = new Date()) {
  const pot = rt.pots.find((p) => p.type === "GST");
  if (!pot) return null;
  const entries = [...rt.ledger.potEntries(B, pot.id)].sort(byTime);
  const first = entries[0]?.createdAt.getTime() ?? null;
  const win = windowFor(range, now, first);
  const trend = balanceTrend(entries, win.from, win.to, range !== "all");
  const totalAllocated = entries.reduce((a, e) => (e.sourceType === "ALLOCATION" || e.sourceType === "ALLOCATION_REVERSAL" ? a + e.amount : a), 0);

  const events: TimelineEvent[] = entries.map((e): TimelineEvent => {
    const base = { id: e.id, at: e.createdAt.getTime(), amount: e.amount };
    switch (e.sourceType) {
      case "ALLOCATION": return { ...base, kind: "allocation", title: "GST reserved from a payment", detail: e.sourceId };
      case "ALLOCATION_REVERSAL": return { ...base, kind: "reversal", title: "Reserve reversed (refund)", detail: e.sourceId };
      case "TRANSFER": return { ...base, kind: "transfer", title: e.amount > 0 ? "Transferred in" : "Transferred out", detail: e.reason ?? e.sourceId };
      case "PAYOUT": return { ...base, kind: "payout-paid", title: "Tax payout settled", detail: e.sourceId };
      default: return { ...base, kind: e.amount > 0 ? "reserve" : "release", title: e.amount > 0 ? "Reserve added by owner" : "Reserve released by owner", detail: e.reason ?? "" };
    }
  });
  const taxPayouts = rt.payouts.list(B, "TAX");
  for (const p of taxPayouts) {
    const ref = `${p.maskedRef}${p.invoiceRef ? ` · ${p.invoiceRef}` : ""}`;
    events.push({ id: `${p.id}:req`, at: p.createdAt.getTime(), kind: "payout-requested", title: "Tax transfer requested", detail: ref, amount: -p.amount });
    if (p.approvedAt) events.push({ id: `${p.id}:apr`, at: p.approvedAt.getTime(), kind: "payout-approved", title: "Tax transfer approved", detail: ref, amount: null });
    if (p.status === "FAILED") events.push({ id: `${p.id}:fail`, at: (p.approvedAt ?? p.createdAt).getTime() + 1, kind: "payout-failed", title: "Tax transfer failed", detail: `${ref}${p.failureReason ? ` · ${p.failureReason}` : ""}`, amount: null });
    if (p.status === "CANCELLED") events.push({ id: `${p.id}:can`, at: p.createdAt.getTime() + 1, kind: "payout-cancelled", title: "Tax transfer cancelled", detail: ref, amount: null });
  }
  // The PAYOUT ledger row duplicates a successful payout request in the timeline; keep the ledger row, drop nothing else.
  events.sort((a, b) => b.at - a.at);

  let running = 0;
  const withBalance = entries.map((e) => ({ e, balanceAfter: (running += e.amount) }));
  const label = (s: string) => ({ ALLOCATION: "Payment allocation", ALLOCATION_REVERSAL: "Refund reversal", PAYOUT: "Tax payout", TRANSFER: "Transfer", ADJUSTMENT: "Owner adjustment" } as Record<string, string>)[s] ?? s;
  return {
    pot, trend, range, totalAllocated,
    balance: rt.ledger.potBalance(B, pot.id),
    available: rt.payouts.getAvailable(B, pot.id),
    reservedForPayouts: rt.ledger.potBalance(B, pot.id) - rt.payouts.getAvailable(B, pot.id),
    nextDue: indicativeNextGstDue(now),
    timeline: events.slice(0, 12),
    recent: withBalance.slice().reverse().slice(0, 15).map(({ e, balanceAfter }) => ({ id: e.id, at: e.createdAt, label: label(e.sourceType), sourceId: e.sourceId, reason: e.reason ?? "", amount: e.amount, balanceAfter })),
    taxPayouts: taxPayouts.slice().reverse(),
    history: historyNote(rt, now),
  };
}

// ---------- Salary ----------
export type StageState = "done" | "current" | "todo" | "attention";
export interface PayrollStage { key: string; label: string; state: StageState; at: number | null; note: string }

/** Draft Created -> Under Review -> Approved -> Paid, from the run status and the payroll audit rows. */
export function payrollStages(rt: PotsRuntime, run: ReturnType<PotsRuntime["payroll"]["list"]>[number] | undefined): PayrollStage[] {
  const stages: PayrollStage[] = [
    { key: "draft", label: "Draft Created", state: "todo", at: null, note: "No payroll run for this month yet" },
    { key: "review", label: "Under Review", state: "todo", at: null, note: "Owner reviews and adjusts amounts" },
    { key: "approved", label: "Approved", state: "todo", at: null, note: "Owner approves with step-up PIN" },
    { key: "paid", label: "Paid", state: "todo", at: null, note: "Payouts released from the Salary Pot" },
  ];
  if (!run) return stages;
  const when = (action: string) => rt.payroll.audit.find((a) => a.entityId === run.id && a.action === action)?.at.getTime() ?? null;
  const adjusted = run.items.some((i) => i.adjustments.length > 0);
  stages[0] = { ...stages[0]!, state: "done", at: when("PAYROLL_RUN_CREATED"), note: `${run.items.length} employees from the Staff module` };
  if (run.status === "DRAFT") {
    stages[1] = { ...stages[1]!, state: "current", note: adjusted ? "Adjustments recorded — waiting for approval" : "Waiting for owner approval" };
    return stages;
  }
  stages[1] = { ...stages[1]!, state: "done", note: adjusted ? "Reviewed with adjustments" : "Reviewed" };
  stages[2] = { ...stages[2]!, state: "done", at: run.approvedAt?.getTime() ?? when("PAYROLL_APPROVED"), note: "Approved by owner" };
  if (run.status === "APPROVED") stages[3] = { ...stages[3]!, state: "current", note: "Approved — payment not made yet" };
  else if (run.status === "COMPLETED") stages[3] = { ...stages[3]!, state: "done", at: rt.payroll.audit.filter((a) => a.entityId.startsWith(`${run.id}:`) && a.action === "PAYROLL_ITEM_PAID").map((a) => a.at.getTime()).sort((a, b) => b - a)[0] ?? null, note: "All salaries paid (simulated)" };
  else stages[3] = { ...stages[3]!, state: "attention", note: `${run.items.filter((i) => i.status === "FAILED").length} payout(s) failed — retry from the run` };
  return stages;
}

export interface SalaryStaffInput {
  staffId: string; name: string; employeeCode: string; designation: string;
  monthlySalaryPaise: number | null; excluded: "no-salary" | "inactive" | null;
  summary: { eligibleDays: number; presentDays: number; paidLeaveDays: number; unpaidLeaveDays: number; absentDays: number; totalMinutes: number; overtimeMinutes: number };
  payable: { payablePaise: number; deductionPaise: number } | null;
}

const elapsedDays = (s: SalaryStaffInput["summary"]) => s.presentDays + s.paidLeaveDays + s.unpaidLeaveDays + s.absentDays;

export function buildSalaryAnalytics(rt: PotsRuntime, period: string, rows: readonly SalaryStaffInput[], range: RangeKey, now = new Date()) {
  const pot = rt.pots.find((p) => p.type === "SALARY");
  if (!pot) return null;
  const entries = [...rt.ledger.potEntries(B, pot.id)].sort(byTime);
  const win = windowFor(range, now, entries[0]?.createdAt.getTime() ?? null);
  const trend = balanceTrend(entries, win.from, win.to, range !== "all");
  const active = rows.filter((r) => r.excluded !== "inactive");
  const included = rows.filter((r) => r.excluded === null && r.payable);
  const [y, m] = period.split("-").map(Number) as [number, number];
  const monthFrom = new Date(Date.UTC(y, m - 1, 1)), monthTo = new Date(Date.UTC(y, m, 1));
  const run = rt.payroll.list(B).find((r) => r.period === period);
  const label = (s: string) => ({ ALLOCATION: "Payment allocation", ALLOCATION_REVERSAL: "Refund reversal", PAYOUT: "Salary payout", TRANSFER: "Transfer", ADJUSTMENT: "Owner adjustment" } as Record<string, string>)[s] ?? s;
  let running = 0;
  const recent = entries.map((e) => ({ e, balanceAfter: (running += e.amount) })).reverse().slice(0, 8)
    .map(({ e, balanceAfter }) => ({ id: e.id, at: e.createdAt, label: label(e.sourceType), sourceId: e.sourceId, reason: e.reason ?? "", amount: e.amount, balanceAfter }));
  return {
    pot, trend, range, period, run,
    balance: rt.ledger.potBalance(B, pot.id),
    available: rt.payouts.getAvailable(B, pot.id),
    monthlyAllocation: rt.ledger.allocatedToPot(B, pot.id, monthFrom, monthTo),
    totalStaff: active.length,
    totalMinutes: included.reduce((a, r) => a + r.summary.totalMinutes, 0),
    payableTotal: included.reduce((a, r) => a + r.payable!.payablePaise, 0),
    includedCount: included.length,
    employees: rows.map((r) => ({
      ...r,
      // attendance = days present / working days already elapsed (present + leave + absent). Future days are not counted.
      attendancePct: elapsedDays(r.summary) > 0 ? Math.round((r.summary.presentDays * 1000) / elapsedDays(r.summary)) / 10 : null,
    })),
    stages: payrollStages(rt, run),
    recent,
    history: historyNote(rt, now),
  };
}
