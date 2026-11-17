import "server-only";

import { and, desc, eq, isNotNull, isNull, like, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { staffAttendance } from "@/server/db/schema";
import { deleteDoc, getDoc, listDocs, putDoc } from "@/server/modules/data/documents";
import type { StaffRole } from "@/server/modules/auth/demo-auth";
import { designationFromRole, type Designation } from "@/lib/staff-designations";
import {
  DEFAULT_HOURS_CONFIG,
  isValidPeriod,
  workedMinutes,
  type AttendanceRecord,
  type HoursConfig,
} from "@/lib/staff-hours";
import { DEFAULT_SHIFT, shiftFromHours, type Shift } from "@/lib/staff-shifts";

/**
 * Staff data. Employees and leave are JSON documents in `app_documents`
 * (PostgreSQL). Attendance lives in its own table, `staff_attendance`, so that
 * check-in / check-out are atomic and enforced by unique indexes.
 * Every function takes restaurantId first and filters by it. restaurantId must
 * always come from the server session, never the browser.
 *
 * This module is the SINGLE source of truth for employees, leave and attendance.
 * Payroll (Pots -> Salary) reads from here; it never keeps its own employee list.
 * All new fields are additive: older records are upgraded on read by withDefaults().
 */

export type StaffStatus = "active" | "inactive";
export type LeaveType = "casual" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface StaffMember {
  id: string;
  restaurantId: string;
  name: string;
  /** Primary login/contact (email if given, else phone). Kept for existing code. */
  contact: string;
  email: string | null;
  phone: string | null;
  address: string;
  /** Small JPEG data URL (resized in the browser). null = no photo. */
  photo: string | null;
  role: StaffRole;
  status: StaffStatus;
  joinedOn: string | null; // yyyy-mm-dd
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  /** Stable employee ID shown to the owner, e.g. EMP-001. Never reused. */
  employeeCode: string;
  designation: Designation;
  customDesignation: string | null;
  /** Monthly salary in paise. null = not set yet (cannot be paid). */
  monthlySalaryPaise: number | null;
  /** Working-hour rules used for overtime and absence. */
  hours: HoursConfig;
  /** Shift timing used for late arrival / early departure. */
  shift: Shift;
  /** Overtime pay per hour, in paise. 0 = overtime is tracked but not paid. */
  overtimeRatePerHourPaise: number;
}

export interface StaffInput {
  name: string;
  contact: string;
  role: StaffRole;
  status: StaffStatus;
  joinedOn: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string;
  /** undefined = leave unchanged, null = remove, string = new photo. */
  photo?: string | null;
  designation?: Designation;
  customDesignation?: string | null;
  monthlySalaryPaise?: number | null;
  hours?: HoursConfig;
  shift?: Shift;
  overtimeRatePerHourPaise?: number;
  lastActiveAt?: string | null;
}

export interface Leave {
  id: string;
  restaurantId: string;
  staffId: string;
  type: LeaveType;
  from: string; // yyyy-mm-dd, inclusive
  to: string; // yyyy-mm-dd, inclusive
  reason: string;
  /** Older records have no status and count as approved. */
  status: LeaveStatus;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface LeaveInput {
  staffId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason: string;
  status?: LeaveStatus;
}

export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const STAFF = "staff";
const LEAVES = "staff_leaves";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Upgrades older records. Nothing is invented: salary stays null, photo stays empty. */
function withDefaults(m: StaffMember): StaffMember {
  const hours = { ...DEFAULT_HOURS_CONFIG, ...(m.hours ?? {}) };
  const contact = m.contact ?? "";
  return {
    ...m,
    employeeCode: m.employeeCode ?? "",
    designation: m.designation ?? designationFromRole(m.role),
    customDesignation: m.customDesignation ?? null,
    monthlySalaryPaise: m.monthlySalaryPaise ?? null,
    hours,
    overtimeRatePerHourPaise: m.overtimeRatePerHourPaise ?? 0,
    email: m.email ?? (EMAIL.test(contact) ? contact : null),
    phone: m.phone ?? (contact && !EMAIL.test(contact) ? contact : null),
    address: m.address ?? "",
    photo: m.photo ?? null,
    shift: m.shift ? { ...DEFAULT_SHIFT, ...m.shift } : shiftFromHours(hours.standardDailyHours),
  };
}

const codeNumber = (c: string) => Number(c.replace(/\D/g, "")) || 0;
export const formatEmployeeCode = (n: number) => `EMP-${String(n).padStart(3, "0")}`;

export async function listStaff(restaurantId: string): Promise<StaffMember[]> {
  const all = (await listDocs<StaffMember>(restaurantId, STAFF))
    .map((d) => withDefaults(d.data))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // One-time backfill: records created before employee IDs existed get the next free number.
  const missing = all.filter((m) => !m.employeeCode);
  if (missing.length > 0) {
    let next = Math.max(0, ...all.map((m) => codeNumber(m.employeeCode))) + 1;
    for (const m of missing) {
      m.employeeCode = formatEmployeeCode(next++);
      await putDoc(restaurantId, STAFF, m.id, m);
    }
  }
  return all;
}

export async function getStaff(restaurantId: string, id: string): Promise<StaffMember | undefined> {
  const found = await getDoc<StaffMember>(restaurantId, STAFF, id);
  if (!found) return undefined;
  if (!found.employeeCode) return (await listStaff(restaurantId)).find((m) => m.id === id);
  return withDefaults(found);
}

export async function countActiveOwners(restaurantId: string): Promise<number> {
  return (await listStaff(restaurantId)).filter((m) => m.role === "owner" && m.status === "active").length;
}

/** True when any of the given emails/phones/contacts already belongs to someone else. */
export async function isContactTaken(
  restaurantId: string,
  contacts: string | string[],
  exceptId?: string,
): Promise<boolean> {
  const wanted = (Array.isArray(contacts) ? contacts : [contacts])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (wanted.length === 0) return false;
  return (await listStaff(restaurantId)).some(
    (m) =>
      m.id !== exceptId &&
      [m.contact, m.email, m.phone].some((v) => v && wanted.includes(v.trim().toLowerCase())),
  );
}

export async function createStaff(restaurantId: string, input: StaffInput): Promise<StaffMember> {
  const now = new Date().toISOString();
  const existing = await listStaff(restaurantId);
  const nextNumber = Math.max(0, ...existing.map((m) => codeNumber(m.employeeCode))) + 1;
  const hours = input.hours ?? DEFAULT_HOURS_CONFIG;
  const member: StaffMember = withDefaults({
    id: `staff_${crypto.randomUUID()}`,
    restaurantId,
    name: input.name,
    contact: input.contact,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? "",
    photo: input.photo ?? null,
    role: input.role,
    status: input.status,
    joinedOn: input.joinedOn,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: null,
    employeeCode: formatEmployeeCode(nextNumber),
    designation: input.designation ?? designationFromRole(input.role),
    customDesignation: input.customDesignation ?? null,
    monthlySalaryPaise: input.monthlySalaryPaise ?? null,
    hours,
    shift: input.shift ?? shiftFromHours(hours.standardDailyHours),
    overtimeRatePerHourPaise: input.overtimeRatePerHourPaise ?? 0,
  });
  await putDoc(restaurantId, STAFF, member.id, member);
  return member;
}

export async function updateStaff(
  restaurantId: string,
  id: string,
  patch: Partial<StaffInput>,
): Promise<StaffMember | undefined> {
  const found = await getStaff(restaurantId, id);
  if (!found) return undefined;
  const next: StaffMember = { ...found, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.contact !== undefined) next.contact = patch.contact;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.address !== undefined) next.address = patch.address;
  if (patch.photo !== undefined) next.photo = patch.photo;
  if (patch.role !== undefined) next.role = patch.role;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.joinedOn !== undefined) next.joinedOn = patch.joinedOn;
  if (patch.designation !== undefined) next.designation = patch.designation;
  if (patch.customDesignation !== undefined) next.customDesignation = patch.customDesignation;
  if (patch.monthlySalaryPaise !== undefined) next.monthlySalaryPaise = patch.monthlySalaryPaise;
  if (patch.hours !== undefined) next.hours = patch.hours;
  if (patch.shift !== undefined) next.shift = patch.shift;
  if (patch.overtimeRatePerHourPaise !== undefined) next.overtimeRatePerHourPaise = patch.overtimeRatePerHourPaise;
  if (patch.lastActiveAt !== undefined) next.lastActiveAt = patch.lastActiveAt;
  await putDoc(restaurantId, STAFF, id, next);
  return next;
}

export async function deleteStaff(restaurantId: string, id: string): Promise<boolean> {
  const removed = await deleteDoc(restaurantId, STAFF, id);
  if (!removed) return false;
  for (const l of await listAllLeaves(restaurantId)) {
    if (l.staffId === id) await deleteDoc(restaurantId, LEAVES, l.id);
  }
  await db
    .delete(staffAttendance)
    .where(and(eq(staffAttendance.restaurantId, restaurantId), eq(staffAttendance.staffId, id)));
  return true;
}

/* ------------------------------ Leaves ------------------------------ */

const normalizeLeave = (l: Leave): Leave => ({ ...l, status: l.status ?? "approved" });

/** Every leave including pending and rejected ones. Used by the Staff screens. */
export async function listAllLeaves(restaurantId: string): Promise<Leave[]> {
  return (await listDocs<Leave>(restaurantId, LEAVES))
    .map((d) => normalizeLeave(d.data))
    .sort((a, b) => b.from.localeCompare(a.from));
}

/**
 * APPROVED leaves only. Payroll and attendance read this, so a request that is
 * still pending (or was rejected) never reduces anyone's pay or marks them on leave.
 */
export async function listLeaves(restaurantId: string): Promise<Leave[]> {
  return (await listAllLeaves(restaurantId)).filter((l) => l.status === "approved");
}

export async function getLeave(restaurantId: string, id: string): Promise<Leave | undefined> {
  const l = await getDoc<Leave>(restaurantId, LEAVES, id);
  return l ? normalizeLeave(l) : undefined;
}

/** Pending and approved leaves block each other; rejected ones do not. */
export async function hasLeaveOverlap(
  restaurantId: string,
  staffId: string,
  from: string,
  to: string,
): Promise<boolean> {
  return (await listAllLeaves(restaurantId)).some(
    (l) => l.staffId === staffId && l.status !== "rejected" && l.from <= to && from <= l.to,
  );
}

export async function addLeave(restaurantId: string, input: LeaveInput): Promise<Leave> {
  const status = input.status ?? "approved";
  const now = new Date().toISOString();
  const leave: Leave = {
    id: `leave_${crypto.randomUUID()}`,
    restaurantId,
    staffId: input.staffId,
    type: input.type,
    from: input.from,
    to: input.to,
    reason: input.reason,
    status,
    decidedBy: null,
    decidedAt: status === "pending" ? null : now,
    createdAt: now,
  };
  await putDoc(restaurantId, LEAVES, leave.id, leave);
  return leave;
}

export async function decideLeave(
  restaurantId: string,
  id: string,
  status: "approved" | "rejected",
  by: string,
): Promise<Leave | undefined> {
  const leave = await getLeave(restaurantId, id);
  if (!leave) return undefined;
  const next: Leave = { ...leave, status, decidedBy: by, decidedAt: new Date().toISOString() };
  await putDoc(restaurantId, LEAVES, id, next);
  return next;
}

export async function deleteLeave(restaurantId: string, id: string): Promise<boolean> {
  return deleteDoc(restaurantId, LEAVES, id);
}

/* --------------------------- Attendance --------------------------- */

export interface AttendanceCorrection {
  at: string; // ISO
  by: string; // who made the change
  reason: string;
  before: { checkIn: string | null; checkOut: string | null };
  after: { checkIn: string | null; checkOut: string | null };
}

/**
 * One row per person per working day in `staff_attendance` (id = `${staffId}:${date}`).
 * `date` is the day the shift STARTED, so an overnight shift stays on the day it began.
 */
export interface AttendanceEntry extends AttendanceRecord {
  staffId: string;
  restaurantId: string;
  /** Stored at check-out (or correction). null while the shift is open. */
  workedMinutes: number | null;
  corrections: AttendanceCorrection[];
}

/** A check-in older than this is treated as forgotten: a manager must correct it. */
export const MAX_OPEN_HOURS = 20;

const attendanceId = (staffId: string, date: string) => `${staffId}:${date}`;

type AttendanceRow = typeof staffAttendance.$inferSelect;

const toEntry = (r: AttendanceRow): AttendanceEntry => ({
  staffId: r.staffId,
  restaurantId: r.restaurantId,
  date: r.workDate,
  checkIn: r.checkInAt ? r.checkInAt.toISOString() : null,
  checkOut: r.checkOutAt ? r.checkOutAt.toISOString() : null,
  workedMinutes: r.workedMinutes,
  corrections: Array.isArray(r.corrections) ? (r.corrections as AttendanceCorrection[]) : [],
});

const ofStaff = (restaurantId: string, staffId: string) =>
  and(eq(staffAttendance.restaurantId, restaurantId), eq(staffAttendance.staffId, staffId));

const isOpen = and(isNotNull(staffAttendance.checkInAt), isNull(staffAttendance.checkOutAt));

export async function listAttendance(
  restaurantId: string,
  staffId: string,
  periodPrefix?: string, // yyyy-mm
): Promise<AttendanceEntry[]> {
  if (periodPrefix && !isValidPeriod(periodPrefix)) return [];
  const rows = await db
    .select()
    .from(staffAttendance)
    .where(
      and(
        ofStaff(restaurantId, staffId),
        periodPrefix ? like(staffAttendance.workDate, `${periodPrefix}-%`) : undefined,
      ),
    )
    .orderBy(desc(staffAttendance.workDate));
  return rows.map(toEntry);
}

/** Attendance of every employee for one month (used by payroll and the Staff dashboard). */
export async function listAttendanceForPeriod(
  restaurantId: string,
  period: string,
): Promise<AttendanceEntry[]> {
  if (!isValidPeriod(period)) return [];
  const rows = await db
    .select()
    .from(staffAttendance)
    .where(
      and(eq(staffAttendance.restaurantId, restaurantId), like(staffAttendance.workDate, `${period}-%`)),
    );
  return rows.map(toEntry);
}

export type PunchResult = { ok: true; entry: AttendanceEntry } | { ok: false; error: string };

/**
 * Atomic check-in. The INSERT is protected by two unique indexes:
 *  - one row per person per day, and
 *  - one open (checked-in, not checked-out) shift per person.
 * Two simultaneous requests can therefore never both succeed.
 */
export async function punchIn(restaurantId: string, staffId: string, date: string): Promise<PunchResult> {
  const id = attendanceId(staffId, date);

  const [inserted] = await db
    .insert(staffAttendance)
    .values({ id, restaurantId, staffId, workDate: date, checkInAt: new Date() })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { ok: true, entry: toEntry(inserted) };

  // Conflict: find out why.
  const [open] = await db
    .select()
    .from(staffAttendance)
    .where(and(ofStaff(restaurantId, staffId), isOpen));
  if (open && open.workDate !== date) {
    return {
      ok: false,
      error: `You are still checked in from ${open.workDate}. Check out first, or ask a manager to correct it.`,
    };
  }
  if (open) return { ok: false, error: "Already checked in today." };

  // Today's row exists but has no check-in (a manager cleared it): allow, still atomically.
  const [reopened] = await db
    .update(staffAttendance)
    .set({ checkInAt: new Date(), checkOutAt: null, workedMinutes: null, updatedAt: new Date() })
    .where(
      and(
        eq(staffAttendance.id, id),
        eq(staffAttendance.restaurantId, restaurantId),
        isNull(staffAttendance.checkInAt),
      ),
    )
    .returning();
  if (reopened) return { ok: true, entry: toEntry(reopened) };
  return { ok: false, error: "Already checked in today." };
}

/**
 * Atomic check-out. A single UPDATE closes the person's OPEN shift whatever its
 * date, so an overnight shift started yesterday is closed after midnight.
 * `_date` is kept for call-site compatibility; the open shift decides which row is closed.
 * Worked minutes are calculated by the database clock and stored.
 */
export async function punchOut(restaurantId: string, staffId: string, _date: string): Promise<PunchResult> {
  void _date;
  const [row] = await db
    .update(staffAttendance)
    .set({
      checkOutAt: sql`now()`,
      workedMinutes: sql`GREATEST(0, round(extract(epoch FROM (now() - ${staffAttendance.checkInAt})) / 60))::int`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        ofStaff(restaurantId, staffId),
        isOpen,
        sql`${staffAttendance.checkInAt} > now() - make_interval(hours => ${MAX_OPEN_HOURS})`,
      ),
    )
    .returning();
  if (row) return { ok: true, entry: toEntry(row) };

  const [stale] = await db
    .select()
    .from(staffAttendance)
    .where(and(ofStaff(restaurantId, staffId), isOpen));
  if (stale) {
    return {
      ok: false,
      error: `Your check-in from ${stale.workDate} is over ${MAX_OPEN_HOURS} hours old. Ask a manager to correct it.`,
    };
  }
  const [last] = await db
    .select()
    .from(staffAttendance)
    .where(ofStaff(restaurantId, staffId))
    .orderBy(desc(staffAttendance.workDate))
    .limit(1);
  return { ok: false, error: last?.checkOutAt ? "Already checked out today." : "Check in first." };
}

/**
 * Authorized correction. Validated, row-locked inside a transaction, and the old
 * values and the reason are always kept in `corrections`. Throws an Error with a
 * user-safe message when the new times are invalid, or when the change would leave
 * the person with two open shifts.
 */
export async function correctAttendance(
  restaurantId: string,
  staffId: string,
  date: string,
  next: { checkIn: string | null; checkOut: string | null },
  reason: string,
  by: string,
): Promise<AttendanceEntry> {
  if (next.checkOut && !next.checkIn) throw new Error("A check-out needs a check-in.");
  if (next.checkIn && !Number.isFinite(Date.parse(next.checkIn))) throw new Error("Invalid check-in time.");
  if (next.checkOut && workedMinutes(next.checkIn, next.checkOut) === null) {
    throw new Error("Check-out must be after check-in.");
  }
  const id = attendanceId(staffId, date);

  try {
    return await db.transaction(async (tx) => {
      // Make sure the row exists, then lock it for the rest of the transaction.
      await tx
        .insert(staffAttendance)
        .values({ id, restaurantId, staffId, workDate: date })
        .onConflictDoNothing();
      const [existing] = await tx
        .select()
        .from(staffAttendance)
        .where(and(eq(staffAttendance.id, id), eq(staffAttendance.restaurantId, restaurantId)))
        .for("update");
      if (!existing) throw new Error("Attendance record not found.");

      const before = {
        checkIn: existing.checkInAt ? existing.checkInAt.toISOString() : null,
        checkOut: existing.checkOutAt ? existing.checkOutAt.toISOString() : null,
      };
      const correction: AttendanceCorrection = {
        at: new Date().toISOString(),
        by,
        reason,
        before,
        after: next,
      };
      const prior = Array.isArray(existing.corrections) ? (existing.corrections as AttendanceCorrection[]) : [];

      const [row] = await tx
        .update(staffAttendance)
        .set({
          checkInAt: next.checkIn ? new Date(next.checkIn) : null,
          checkOutAt: next.checkOut ? new Date(next.checkOut) : null,
          workedMinutes: workedMinutes(next.checkIn, next.checkOut),
          corrections: [...prior, correction],
          updatedAt: new Date(),
        })
        .where(eq(staffAttendance.id, id))
        .returning();
      return toEntry(row);
    });
  } catch (e) {
    // 23505 = unique_violation: the one-open-shift index rejected the change.
    if ((e as { code?: string })?.code === "23505") {
      throw new Error("This person already has another open shift. Close it first.");
    }
    throw e;
  }
}