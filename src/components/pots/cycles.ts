import type { Direction } from "@/server/modules/pots/analytics";

/*
 * Pure helpers for the sand-timer widgets. No "use client": server pages call
 * these, then pass the numbers to <SandTimer />. All calendar maths is in IST.
 */

const IST_MS = 19_800_000; // UTC+05:30

/** Hours a payout may wait for approval before the timer runs out. Change to match your policy. */
export const APPROVAL_WINDOW_HOURS = 24;

const parts = (ms: number) => {
  const d = new Date(ms + IST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const istStart = (y: number, m: number, d: number) => Date.UTC(y, m, d, 0, 0, 0, 0) - IST_MS;
const istEnd = (y: number, m: number, d: number) => Date.UTC(y, m, d, 23, 59, 59, 999) - IST_MS;

export type Cycle = { startMs: number; endMs: number };

/** GSTR-3B: due on the 20th. The cycle runs from the previous 20th to the next 20th. */
export function gstCycle(now: number): Cycle & { period: string } {
  const { y, m, d } = parts(now);
  const dueMonth = d <= 20 ? m : m + 1;
  const period = new Date(Date.UTC(y, dueMonth - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  return { startMs: istEnd(y, dueMonth - 1, 20) + 1, endMs: istEnd(y, dueMonth, 20), period };
}

/** Payroll month "YYYY-MM": from the 1st to the last day of that month. */
export function payrollCycle(period: string): Cycle {
  const [y, mm] = period.split("-").map(Number) as [number, number];
  return { startMs: istStart(y, mm - 1, 1), endMs: istEnd(y, mm, 0) };
}

/** A payout waiting for approval: the window opens when it was requested. */
export function approvalWindow(createdAt: Date | number, hours = APPROVAL_WINDOW_HOURS): Cycle {
  const start = typeof createdAt === "number" ? createdAt : createdAt.getTime();
  return { startMs: start, endMs: start + hours * 3_600_000 };
}

const FINISHED = new Set(["SUCCESS", "COMPLETED", "PAID", "FAILED", "PARTIALLY_FAILED", "CANCELLED"]);
/** Anything not finished is still waiting (matches how statusCls colours statuses). */
export const isPendingStatus = (status: string) => !FINISHED.has(status);

/** Graph colour rule: growth = green, decrease OR no growth = red. "none" (no history) stays neutral. */
export const growthDirection = (d: Direction): Direction => (d === "flat" ? "down" : d);