"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { accessRoleFor, DESIGNATION_KEYS, type Designation } from "@/lib/staff-designations";
import { DEFAULT_HOURS_CONFIG } from "@/lib/staff-hours";
import { shiftLengthHours } from "@/lib/staff-shifts";
import { canActOnStaffRole, hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession, type DemoSession } from "@/server/modules/auth/session";
import { getStaffPinVerified } from "@/server/modules/auth/staff-session";
import {
  addLeave,
  correctAttendance,
  countActiveOwners,
  createStaff,
  decideLeave,
  deleteLeave,
  deleteStaff,
  getLeave,
  getStaff,
  hasLeaveOverlap,
  isContactTaken,
  listLeaves,
  punchIn,
  punchOut,
  todayInIndia,
  updateStaff,
  type StaffInput,
} from "@/server/modules/demo-store/staff";

export type StaffActionResult = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const designationSchema = z.enum(DESIGNATION_KEYS);
const statusSchema = z.enum(["active", "inactive"]);
const idSchema = z.string().min(1).max(100);
const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long");
const emailSchema = z
  .string()
  .trim()
  .max(120, "Email is too long")
  .refine((v) => v === "" || EMAIL.test(v), "Enter a valid email address");
const phoneSchema = z
  .string()
  .trim()
  .max(20, "Phone number is too long")
  .refine((v) => v === "" || PHONE.test(v), "Enter a valid phone number");

const dateSchema = z
  .string()
  .regex(DATE, "Enter a valid date")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Enter a valid date");

// Optional joining date: empty means "not set".
const joinedSchema = z
  .union([z.literal(""), dateSchema])
  .optional()
  .transform((v) => (v ? v : null));

const leaveSchema = z.object({
  type: z.enum(["casual", "sick", "unpaid"]),
  from: dateSchema,
  to: dateSchema,
  reason: z.string().trim().max(200, "Reason is too long"),
  status: z.enum(["pending", "approved"]).default("approved"),
});

/** Rupees typed by the owner ("26000", "26,000.50") -> whole paise. "" = not set. */
function rupeesToPaise(value: unknown): number | null | "invalid" {
  const t = String(value ?? "").replace(/,/g, "").trim();
  if (t === "") return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return "invalid";
  return Math.round(Number(t) * 100);
}

// Everything about a person except status. Used by Add and Edit.
const profileSchema = z
  .object({
    name: nameSchema,
    email: emailSchema.default(""),
    phone: phoneSchema.default(""),
    address: z.string().trim().max(200, "Address is too long").default(""),
    // Small JPEG data URL from the browser. undefined = keep, null = remove.
    photo: z
      .union([z.null(), z.string().startsWith("data:image/", "Photo must be an image").max(80_000, "Photo is too large")])
      .optional(),
    designation: designationSchema,
    customDesignation: z.string().trim().max(40, "Custom role is too long").optional(),
    joinedOn: joinedSchema,
    monthlySalary: z.union([z.string(), z.number()]).optional(),
    shiftStart: z.string().regex(TIME, "Use HH:MM for shift times"),
    shiftEnd: z.string().regex(TIME, "Use HH:MM for shift times"),
    graceMinutes: z.coerce.number().int("Grace must be whole minutes").min(0, "Grace must be 0–120 minutes").max(120, "Grace must be 0–120 minutes"),
    overtimeEnabled: z.boolean(),
    overtimeAfterHours: z.coerce.number().min(1, "Overtime hours must be 1–16").max(16, "Overtime hours must be 1–16").optional(),
    overtimeRate: z.union([z.string(), z.number()]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.designation === "other" && (v.customDesignation ?? "").length < 2) {
      ctx.addIssue({ code: "custom", message: 'Enter the custom role for "Other".', path: ["customDesignation"] });
    }
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: "custom", message: "Enter a phone number or an email.", path: ["phone"] });
    }
    if (v.shiftStart === v.shiftEnd) {
      ctx.addIssue({ code: "custom", message: "Shift start and end can't be the same.", path: ["shiftEnd"] });
    }
  });

type ProfileData = z.infer<typeof profileSchema>;

/** Parsed form -> what the store saves (null-safe money, derived access role, derived hours). */
function toStaffFields(d: ProfileData) {
  const salary = rupeesToPaise(d.monthlySalary);
  const rate = rupeesToPaise(d.overtimeRate);
  if (salary === "invalid") return { ok: false, error: "Enter the monthly salary in rupees (up to 2 decimals)." } as const;
  if (rate === "invalid") return { ok: false, error: "Enter the overtime rate in rupees per hour (up to 2 decimals)." } as const;
  const shift = { start: d.shiftStart, end: d.shiftEnd, graceMinutes: d.graceMinutes };
  const length = shiftLengthHours(shift); // working hours per day come from the shift
  const email = d.email ? d.email.toLowerCase() : null;
  const phone = d.phone || null;
  return {
    ok: true,
    value: {
      email,
      phone,
      contact: email ?? phone ?? "",
      address: d.address,
      photo: d.photo,
      designation: d.designation as Designation,
      customDesignation: d.designation === "other" ? (d.customDesignation ?? "").trim() : null,
      role: accessRoleFor(d.designation),
      monthlySalaryPaise: salary,
      overtimeRatePerHourPaise: rate ?? 0,
      shift,
      hours: {
        ...DEFAULT_HOURS_CONFIG,
        standardDailyHours: length,
        overtimeEnabled: d.overtimeEnabled,
        overtimeAfterHours: d.overtimeAfterHours ?? length,
      },
    },
  } as const;
}

const fail = (error: string): StaffActionResult => ({ ok: false, error });

function refresh(staffId?: string) {
  revalidatePath("/owner/staff");
  if (staffId) revalidatePath(`/owner/staff/${staffId}`);
  revalidatePath("/owner/pots/salary"); // payroll reads the same Staff records
}

// Every action re-checks the session AND the Staff PIN on the server. Role
// and restaurantId are NEVER read from the request; the UI is not trusted.
type AuthResult = { ok: true; session: DemoSession } | { ok: false; error: string };

async function authorize(): Promise<AuthResult> {
  const session = await getDemoSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (!hasPermission(session.role, "staff")) {
    return { ok: false, error: "You do not have access to staff management." };
  }
  if (!(await getStaffPinVerified())) {
    return { ok: false, error: "PIN expired. Reload the page and enter the PIN again." };
  }
  return { ok: true, session };
}

export async function addStaffAction(input: unknown): Promise<StaffActionResult> {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.error);
  const { session } = auth;

  const parsed = profileSchema.and(z.object({ status: statusSchema })).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const data = parsed.data;
  const parsedFields = toStaffFields(data);
  if (!parsedFields.ok) return fail(parsedFields.error);
  const fields = parsedFields.value;
  if (!canActOnStaffRole(session.role, fields.role)) return fail("You are not allowed to assign that role.");
  if (await isContactTaken(session.restaurantId, [fields.email ?? "", fields.phone ?? ""])) {
    return fail("A staff member with that email or phone already exists.");
  }

  await createStaff(session.restaurantId, {
    name: data.name,
    status: data.status,
    joinedOn: data.joinedOn,
    ...fields,
  });
  refresh();
  return { ok: true };
}

async function updateMember(rawId: unknown, patch: Partial<StaffInput>): Promise<StaffActionResult> {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.error);
  const { session } = auth;

  const id = idSchema.safeParse(rawId);
  if (!id.success) return fail("Invalid staff member.");

  // Lookup is scoped to the session's restaurant, so another restaurant's
  // staff id simply "does not exist" here.
  const member = await getStaff(session.restaurantId, id.data);
  if (!member) return fail("Staff member not found.");

  if (!canActOnStaffRole(session.role, member.role)) return fail("You are not allowed to modify this staff member.");
  if (patch.role !== undefined && !canActOnStaffRole(session.role, patch.role)) {
    return fail("You are not allowed to assign that role.");
  }

  const losesActiveOwner =
    member.role === "owner" &&
    member.status === "active" &&
    ((patch.role !== undefined && patch.role !== "owner") || patch.status === "inactive");
  if (losesActiveOwner && (await countActiveOwners(session.restaurantId)) <= 1) {
    return fail("There must always be at least one active Owner.");
  }

  const contacts = [patch.contact, patch.email, patch.phone].filter((v): v is string => !!v);
  if (contacts.length > 0 && (await isContactTaken(session.restaurantId, contacts, member.id))) {
    return fail("A staff member with that email or phone already exists.");
  }

  await updateStaff(session.restaurantId, member.id, patch);
  refresh(member.id);
  return { ok: true };
}

export async function editStaffAction(id: unknown, input: unknown): Promise<StaffActionResult> {
  const parsed = profileSchema.and(z.object({ status: statusSchema.optional() })).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const parsedFields = toStaffFields(parsed.data);
  if (!parsedFields.ok) return fail(parsedFields.error);
  return updateMember(id, {
    name: parsed.data.name,
    joinedOn: parsed.data.joinedOn,
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...parsedFields.value,
  });
}

/** Change only the role / designation (the quick "Change Role" dialog). */
export async function changeDesignationAction(
  id: unknown,
  designation: unknown,
  customDesignation?: unknown,
): Promise<StaffActionResult> {
  const parsed = designationSchema.safeParse(designation);
  if (!parsed.success) return fail("Invalid role.");
  const custom = String(customDesignation ?? "").trim().slice(0, 40);
  if (parsed.data === "other" && custom.length < 2) return fail('Enter the custom role for "Other".');
  return updateMember(id, {
    designation: parsed.data,
    customDesignation: parsed.data === "other" ? custom : null,
    role: accessRoleFor(parsed.data),
  });
}

export async function setStaffStatusAction(id: unknown, status: unknown): Promise<StaffActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return fail("Invalid status.");
  return updateMember(id, { status: parsed.data });
}

export async function deleteStaffAction(id: unknown): Promise<StaffActionResult> {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.error);
  const { session } = auth;

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("Invalid staff member.");

  const member = await getStaff(session.restaurantId, parsedId.data);
  if (!member) return fail("Staff member not found.");

  if (!canActOnStaffRole(session.role, member.role)) return fail("You are not allowed to delete this staff member.");
  if (member.role === "owner" && member.status === "active" && (await countActiveOwners(session.restaurantId)) <= 1) {
    return fail("There must always be at least one active Owner.");
  }

  await deleteStaff(session.restaurantId, member.id);
  refresh();
  return { ok: true };
}

/* ------------------------------ Leaves ------------------------------ */

async function authorizedForLeave(staffId: string) {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const member = await getStaff(auth.session.restaurantId, staffId);
  if (!member) return { ok: false, error: "Staff member not found." } as const;
  if (!canActOnStaffRole(auth.session.role, member.role)) {
    return { ok: false, error: "You are not allowed to change leave for this staff member." } as const;
  }
  return { ok: true, session: auth.session, member } as const;
}

export async function addLeaveAction(staffId: unknown, input: unknown): Promise<StaffActionResult> {
  const id = idSchema.safeParse(staffId);
  if (!id.success) return fail("Invalid staff member.");
  const a = await authorizedForLeave(id.data);
  if (!a.ok) return fail(a.error);

  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;

  if (data.from > data.to) return fail("The end date must be on or after the start date.");
  const days =
    (new Date(`${data.to}T00:00:00Z`).getTime() - new Date(`${data.from}T00:00:00Z`).getTime()) / 86_400_000 + 1;
  if (days > 366) return fail("A single leave can't be longer than a year.");
  if (await hasLeaveOverlap(a.session.restaurantId, a.member.id, data.from, data.to)) {
    return fail("This overlaps with another leave for the same person.");
  }

  await addLeave(a.session.restaurantId, { staffId: a.member.id, ...data });
  refresh(a.member.id);
  return { ok: true };
}

/** Approve or reject a pending leave request. Only approved leave affects attendance and pay. */
export async function decideLeaveAction(leaveId: unknown, decision: unknown): Promise<StaffActionResult> {
  const id = idSchema.safeParse(leaveId);
  const verdict = z.enum(["approved", "rejected"]).safeParse(decision);
  if (!id.success || !verdict.success) return fail("Invalid request.");

  const auth = await authorize();
  if (!auth.ok) return fail(auth.error);
  const { session } = auth;

  const leave = await getLeave(session.restaurantId, id.data);
  if (!leave) return fail("Leave not found.");
  if (leave.status !== "pending") return fail("This request has already been decided.");
  const member = await getStaff(session.restaurantId, leave.staffId);
  if (!member || !canActOnStaffRole(session.role, member.role)) {
    return fail("You are not allowed to decide this leave.");
  }

  await decideLeave(session.restaurantId, leave.id, verdict.data, session.role);
  refresh(member.id);
  return { ok: true };
}

export async function cancelLeaveAction(leaveId: unknown): Promise<StaffActionResult> {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.error);
  const { session } = auth;

  const id = idSchema.safeParse(leaveId);
  if (!id.success) return fail("Invalid leave.");
  const leave = await getLeave(session.restaurantId, id.data);
  if (!leave) return fail("Leave not found.");

  const member = await getStaff(session.restaurantId, leave.staffId);
  if (!member || !canActOnStaffRole(session.role, member.role)) {
    return fail("You are not allowed to change this leave.");
  }
  if (leave.status === "approved" && leave.to < todayInIndia()) {
    return fail("Past leaves are kept as history and can't be removed.");
  }

  await deleteLeave(session.restaurantId, leave.id);
  refresh(member.id);
  return { ok: true };
}

/* ------------------------- Attendance ------------------------- */

async function authorizedMember(
  staffId: unknown,
): Promise<{ ok: true; session: DemoSession; id: string } | { ok: false; error: string }> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const id = idSchema.safeParse(staffId);
  if (!id.success) return { ok: false, error: "Invalid staff member." };
  const member = await getStaff(auth.session.restaurantId, id.data);
  if (!member) return { ok: false, error: "Staff member not found." };
  if (!canActOnStaffRole(auth.session.role, member.role)) {
    return { ok: false, error: "You are not allowed to record attendance for this staff member." };
  }
  if (member.status !== "active") return { ok: false, error: "This staff member is inactive." };
  return { ok: true, session: auth.session, id: member.id };
}

export async function checkInAction(staffId: unknown): Promise<StaffActionResult> {
  const a = await authorizedMember(staffId);
  if (!a.ok) return fail(a.error);
  const today = todayInIndia();
  const onLeave = (await listLeaves(a.session.restaurantId)).some(
    (l) => l.staffId === a.id && l.status === "approved" && l.from <= today && today <= l.to,
  );
  if (onLeave) return fail("On approved leave today. Cancel the leave first to record attendance.");
  const res = await punchIn(a.session.restaurantId, a.id, today); // blocks a second check-in
  if (!res.ok) return fail(res.error);
  await updateStaff(a.session.restaurantId, a.id, { lastActiveAt: res.entry.checkIn });
  refresh(a.id);
  return { ok: true };
}

export async function checkOutAction(staffId: unknown): Promise<StaffActionResult> {
  const a = await authorizedMember(staffId);
  if (!a.ok) return fail(a.error);
  const res = await punchOut(a.session.restaurantId, a.id, todayInIndia()); // needs a check-in, blocks a second check-out
  if (!res.ok) return fail(res.error);
  await updateStaff(a.session.restaurantId, a.id, { lastActiveAt: res.entry.checkOut });
  refresh(a.id);
  return { ok: true };
}

const correctionSchema = z.object({
  date: dateSchema,
  checkIn: z.union([z.literal(""), z.string().regex(TIME, "Use HH:MM for the times")]),
  checkOut: z.union([z.literal(""), z.string().regex(TIME, "Use HH:MM for the times")]),
  reason: z.string().trim().min(3, "A reason is required for every correction").max(200, "Reason is too long"),
});

/** Owner / manager correction of a day's times. Keeps the old values, who changed them and why. */
export async function correctAttendanceAction(staffId: unknown, input: unknown): Promise<StaffActionResult> {
  const a = await authorizedMember(staffId);
  if (!a.ok) return fail(a.error);

  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const d = parsed.data;

  if (d.date > todayInIndia()) return fail("You can't record attendance for a future date.");
  if (!d.checkIn && d.checkOut) return fail("A check-out needs a check-in.");

  const iso = (t: string) => (t ? new Date(`${d.date}T${t}:00+05:30`).toISOString() : null);
  const checkIn = iso(d.checkIn);
  const checkOut = iso(d.checkOut);
  if (checkIn && checkOut && Date.parse(checkOut) <= Date.parse(checkIn)) {
    return fail("Check-out must be after check-in.");
  }

  await correctAttendance(a.session.restaurantId, a.id, d.date, { checkIn, checkOut }, d.reason, a.session.role);
  refresh(a.id);
  return { ok: true };
}