import type { StaffRole } from "@/server/modules/auth/demo-auth";

/**
 * Job designations shown in the Staff role dropdown. A designation is what the
 * person DOES; the access role (owner / manager / cashier / kitchen / waiter)
 * is what they may OPEN in the app. The access role is always derived here, on
 * the server, so picking "HR" can never grant more access than listed below.
 *
 * Designations with no system screen of their own (HR, Accountant, Delivery,
 * Other) map to "kitchen", the role with no Owner-portal pages.
 */
export const DESIGNATIONS = [
  { key: "owner", label: "Owner", access: "owner" },
  { key: "manager", label: "Manager", access: "manager" },
  { key: "hr", label: "HR", access: "kitchen" },
  { key: "cashier", label: "Cashier", access: "cashier" },
  { key: "waiter", label: "Waiter", access: "waiter" },
  { key: "chef", label: "Chef", access: "kitchen" },
  { key: "kitchen_staff", label: "Kitchen Staff", access: "kitchen" },
  { key: "delivery_staff", label: "Delivery Staff", access: "kitchen" },
  { key: "accountant", label: "Accountant", access: "kitchen" },
  { key: "other", label: "Other", access: "kitchen" },
] as const satisfies readonly { key: string; label: string; access: StaffRole }[];

export type Designation = (typeof DESIGNATIONS)[number]["key"];
export const DESIGNATION_KEYS = DESIGNATIONS.map((d) => d.key) as [Designation, ...Designation[]];

export function accessRoleFor(d: Designation): StaffRole {
  return DESIGNATIONS.find((x) => x.key === d)!.access;
}

/** Older staff records only have an access role; show a sensible designation for them. */
export function designationFromRole(role: StaffRole): Designation {
  return role === "kitchen" ? "kitchen_staff" : (role as Designation);
}

/** The text shown everywhere: the custom title when "Other" was chosen. */
export function designationLabel(d: Designation, custom: string | null): string {
  if (d === "other" && custom?.trim()) return custom.trim();
  return DESIGNATIONS.find((x) => x.key === d)?.label ?? d;
}
