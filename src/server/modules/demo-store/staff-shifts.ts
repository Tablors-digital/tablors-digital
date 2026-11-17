/**
 * Shift + attendance helpers (pure, no server imports). India has no DST, so IST is a fixed +05:30.
 * Late / early / status are all derived from the person's own configured shift.
 */
export interface Shift {
  start: string; // HH:MM, 24h
  end: string; // HH:MM, 24h (earlier than start = overnight shift)
  graceMinutes: number;
}

export const DEFAULT_SHIFT: Shift = { start: "09:00", end: "17:00", graceMinutes: 10 };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHHMM = (v: string) => HHMM.test(v);
export const toMinutes = (v: string) => {
  const [h = 0, m = 0] = v.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (n: number) => {
  const x = ((Math.round(n) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/** Builds a shift for older records that only stored "hours per day". */
export function shiftFromHours(hours: number, start = DEFAULT_SHIFT.start): Shift {
  return { start, end: fromMinutes(toMinutes(start) + Math.round(hours * 60)), graceMinutes: DEFAULT_SHIFT.graceMinutes };
}

/** Shift length in hours, rounded to half hours and clamped to 1-16. */
export function shiftLengthHours(s: Shift): number {
  let d = toMinutes(s.end) - toMinutes(s.start);
  if (d <= 0) d += 1440;
  return Math.min(16, Math.max(1, Math.round(d / 30) / 2));
}

const IST_OFFSET_MS = 330 * 60_000;
export const istMinuteOfDay = (iso: string) => Math.floor(((Date.parse(iso) + IST_OFFSET_MS) % 86_400_000) / 60_000);
export const nowMinuteIST = () => istMinuteOfDay(new Date().toISOString());
export const isoToHHMM = (iso: string | null) => (iso ? fromMinutes(istMinuteOfDay(iso)) : "");

const clock = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
export const formatClock = (iso: string | null) => (iso ? clock.format(new Date(iso)).toUpperCase() : "—");

export function shiftLabel(s: Shift): string {
  const f = (v: string) => formatClock(new Date(Date.UTC(2000, 0, 1, 0, 0) + (toMinutes(v) - 330) * 60_000).toISOString());
  return `${f(s.start)} – ${f(s.end)}`;
}

/** Minutes after (shift start + grace). 0 = on time. */
export function lateByMinutes(checkIn: string, s: Shift): number {
  const d = istMinuteOfDay(checkIn) - toMinutes(s.start);
  return d > s.graceMinutes ? d : 0;
}

/** Minutes before (shift end - grace). 0 = stayed to the end. Overnight shifts are not scored. */
export function earlyByMinutes(checkOut: string, s: Shift): number {
  const end = toMinutes(s.end);
  if (end <= toMinutes(s.start)) return 0;
  const d = end - istMinuteOfDay(checkOut);
  return d > s.graceMinutes ? d : 0;
}

export function workedMinutes(checkIn: string | null, checkOut: string | null, nowMs = Date.now()): number {
  if (!checkIn) return 0;
  const end = checkOut ? Date.parse(checkOut) : nowMs;
  return Math.max(0, Math.round((end - Date.parse(checkIn)) / 60_000));
}

export type DayStatus = "working" | "checked_out" | "on_leave" | "absent" | "not_in_yet" | "inactive";

export function dayStatus(i: {
  active: boolean;
  onLeave: boolean;
  checkIn: string | null;
  checkOut: string | null;
  shift: Shift;
  nowMinute: number;
}): DayStatus {
  if (!i.active) return "inactive";
  if (i.checkIn) return i.checkOut ? "checked_out" : "working";
  if (i.onLeave) return "on_leave";
  return i.nowMinute <= toMinutes(i.shift.start) + i.shift.graceMinutes ? "not_in_yet" : "absent";
}