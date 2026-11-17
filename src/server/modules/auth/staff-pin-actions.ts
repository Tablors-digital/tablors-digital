"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission } from "./permissions";
import { armingCookieOptions, mintArmingToken } from "./pin-session";
import { getDemoSession } from "./session";
import { checkStaffPin, STAFF_PIN_COOKIE } from "./staff-pin";

export type StaffPinState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function verifyStaffPin(
  _prevState: StaffPinState,
  formData: FormData,
): Promise<StaffPinState> {
  const session = await getDemoSession();
  if (!session || !hasPermission(session.role, "staff")) redirect("/login");

  const pin = String(formData.get("pin") ?? "");
  if (!checkStaffPin(pin)) {
    return { status: "error", message: "Incorrect PIN. Please try again." };
  }

  const cookieStore = await cookies();
  // Long arming window; PinSessionGuard shortens it to the 10s idle window once the page is on screen.
  cookieStore.set(STAFF_PIN_COOKIE, mintArmingToken("staff"), armingCookieOptions());

  redirect("/owner/staff");
}

/** Lets the owner lock the Staff page again straight away. */
export async function lockStaffPage() {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_PIN_COOKIE);
  redirect("/owner/staff-pin");
}