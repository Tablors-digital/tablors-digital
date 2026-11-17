import "server-only";

import { getPotsRuntime } from "@/server/modules/pots/runtime";
import { buildPayrollSource } from "@/server/modules/pots/payroll-source";
import { buildSalaryAnalytics, parseRange } from "@/server/modules/pots/analytics";
import { workedMinutes } from "@/lib/staff-shifts";
import type { AttendanceEntry, Leave } from "@/server/modules/demo-store/staff";

/** The numbers Pots -> Salary shows for each person, so both screens always agree. */
export interface PayrollSummary {
  presentDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  totalMinutes: number;
  overtimeMinutes: number;
}
export interface PayrollFacts {
  summary: PayrollSummary | null;
  attendancePct: number | null;
  payablePaise: number | null;
  deductionPaise: number | null;
  excluded: string | null;
}

/**
 * Reads payroll's own view of the month (same builders the Salary page uses). If Pots is not
 * configured the Staff screens still work and fall back to numbers from the raw attendance.
 */
export async function payrollFacts(restaurantId: string, period: string): Promise<Map<string, PayrollFacts>> {
  const out = new Map<string, PayrollFacts>();
  try {
    const rows = await buildPayrollSource(restaurantId, period);
    const a = buildSalaryAnalytics(getPotsRuntime(), period, rows, parseRange(undefined));
    const pct = new Map<string, number | null>((a?.employees ?? []).map((e) => [e.staffId, e.attendancePct]));
    for (const r of rows) {
      const x = r as unknown as {
        staffId: string;
        summary?: PayrollSummary;
        payable?: { payablePaise: number; deductionPaise: number } | null;
        excluded: string | null;
      };
      out.set(x.staffId, {
        summary: x.summary ?? null,
        attendancePct: pct.get(x.staffId) ?? null,
        payablePaise: x.payable?.payablePaise ?? null,
        deductionPaise: x.payable?.deductionPaise ?? null,
        excluded: x.excluded ?? null,
      });
    }
  } catch {
    // Pots unavailable: fall back to attendance-only numbers.
  }
  return out;
}

/** Minutes worked on one entry. A day left open (no check-out) only counts while it is still today. */
export function entryMinutes(e: { date: string; checkIn: string | null; checkOut: string | null }, today: string): number {
  if (e.checkOut) return workedMinutes(e.checkIn, e.checkOut);
  return e.date === today ? workedMinutes(e.checkIn, null) : 0;
}

export const lastDayOf = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Approved leave days of one person that fall inside the month. */
export function leaveDaysInMonth(leaves: Leave[], period: string): number {
  const first = `${period}-01`;
  const last = `${period}-${String(lastDayOf(period)).padStart(2, "0")}`;
  let n = 0;
  for (const l of leaves) {
    if (l.status !== "approved") continue;
    const s = l.from > first ? l.from : first;
    const e = l.to < last ? l.to : last;
    if (s <= e) n += dayDiff(s, e);
  }
  return n;
}

export const dayCount = dayDiff;

export function summarizeEntries(entries: AttendanceEntry[], today: string) {
  const present = entries.filter((e) => e.checkIn).length;
  const minutes = entries.reduce((s, e) => s + entryMinutes(e, today), 0);
  return { present, minutes };
}
