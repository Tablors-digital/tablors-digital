/**
 * Attendance, working-hour and payable-salary maths. Pure functions (no I/O)
 * so the Staff profile and the Salary pot always use the SAME calculation.
 * All money is whole paise (integer maths only). Dates are yyyy-mm-dd in the
 * restaurant's local calendar (Asia/Kolkata).
 */

export type HoursConfig = {
  /** Expected hours in a normal working day. */
  standardDailyHours: number;
  /** Overtime is tracked and paid ONLY when this is on. */
  overtimeEnabled: boolean;
  /** Hours worked beyond this in one day count as overtime. */
  overtimeAfterHours: number;
  /** Days of the week with no work (0 = Sunday ... 6 = Saturday). */
  weeklyOff: number[];
};

export const DEFAULT_HOURS_CONFIG: HoursConfig = {
  standardDailyHours: 8,
  overtimeEnabled: false,
  overtimeAfterHours: 8,
  weeklyOff: [0],
};

export type AttendanceRecord = {
  date: string;
  checkIn: string | null; // ISO timestamp
  checkOut: string | null; // ISO timestamp
};

export type LeaveRange = { type: "casual" | "sick" | "unpaid"; from: string; to: string };

/** Minutes between check-in and check-out; null while the day is still open or the times are invalid. */
export function workedMinutes(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = Date.parse(checkIn);
  const b = Date.parse(checkOut);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60_000);
}

export function overtimeMinutes(worked: number | null, cfg: HoursConfig): number {
  if (worked === null || !cfg.overtimeEnabled) return 0;
  return Math.max(0, worked - Math.round(cfg.overtimeAfterHours * 60));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Every yyyy-mm-dd in a yyyy-mm period. */
export function daysInPeriod(period: string): string[] {
  const [y, m] = period.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${period}-${pad(i + 1)}`);
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

export type MonthlySummary = {
  period: string;
  /** Working days in the whole month (weekly offs removed). */
  workingDaysInMonth: number;
  /** Working days from the joining date to month end. */
  eligibleDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  /** Past working days with no attendance and no leave. */
  absentDays: number;
  /** Days checked in but not yet checked out. */
  openDays: number;
  totalMinutes: number;
  overtimeMinutes: number;
};

export function monthlySummary(input: {
  period: string;
  /** Today (yyyy-mm-dd). Days after today are never counted absent. */
  today: string;
  joinedOn: string | null;
  records: AttendanceRecord[];
  leaves: LeaveRange[];
  cfg: HoursConfig;
}): MonthlySummary {
  const { period, today, joinedOn, records, leaves, cfg } = input;
  const days = daysInPeriod(period);
  const byDate = new Map(records.map((r) => [r.date, r]));
  const off = new Set(cfg.weeklyOff);
  const leaveOn = (d: string) => leaves.find((l) => l.from <= d && d <= l.to);

  const s: MonthlySummary = {
    period,
    workingDaysInMonth: 0,
    eligibleDays: 0,
    presentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    openDays: 0,
    totalMinutes: 0,
    overtimeMinutes: 0,
  };

  for (const d of days) {
    if (off.has(weekday(d))) continue;
    s.workingDaysInMonth += 1;
    if (joinedOn && d < joinedOn) continue;
    s.eligibleDays += 1;

    const rec = byDate.get(d);
    if (rec?.checkIn) {
      s.presentDays += 1;
      const w = workedMinutes(rec.checkIn, rec.checkOut);
      if (w === null) s.openDays += 1;
      else {
        s.totalMinutes += w;
        s.overtimeMinutes += overtimeMinutes(w, cfg);
      }
      continue;
    }
    const leave = leaveOn(d);
    if (leave) {
      if (leave.type === "unpaid") s.unpaidLeaveDays += 1;
      else s.paidLeaveDays += 1;
      continue;
    }
    // Today is not "absent" yet: the person may still check in.
    if (d < today) s.absentDays += 1;
  }
  return s;
}

export type Payable = {
  baseSalaryPaise: number;
  deductionDays: number;
  deductionPaise: number;
  overtimePayPaise: number;
  payablePaise: number;
};

/**
 * Payable = pro-rated base − (absent + unpaid-leave days) × per-day rate + overtime pay.
 * Overtime pay is only added when overtime is enabled AND an hourly overtime rate is configured.
 */
export function computePayable(input: {
  monthlySalaryPaise: number;
  summary: MonthlySummary;
  overtimeRatePerHourPaise: number;
}): Payable {
  const { monthlySalaryPaise: salary, summary: s, overtimeRatePerHourPaise: rate } = input;
  if (s.workingDaysInMonth === 0) {
    return { baseSalaryPaise: 0, deductionDays: 0, deductionPaise: 0, overtimePayPaise: 0, payablePaise: 0 };
  }
  const base = Math.floor((salary * s.eligibleDays) / s.workingDaysInMonth);
  const deductionDays = s.absentDays + s.unpaidLeaveDays;
  const deduction = Math.min(base, Math.floor((salary * deductionDays) / s.workingDaysInMonth));
  const overtimePay = Math.floor((s.overtimeMinutes * rate) / 60);
  return {
    baseSalaryPaise: base,
    deductionDays,
    deductionPaise: deduction,
    overtimePayPaise: overtimePay,
    payablePaise: base - deduction + overtimePay,
  };
}
