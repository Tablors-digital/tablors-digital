"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission } from "./permissions";
import { armingCookieOptions, mintArmingToken } from "./pin-session";
import { getDemoSession } from "./session";
import { checkPotsPin, POTS_PIN_COOKIE } from "./pots-pin";

export type PotsPinState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function verifyPotsPin(
  _prevState: PotsPinState,
  formData: FormData,
): Promise<PotsPinState> {
  const session = await getDemoSession();
  if (!session || !hasPermission(session.role, "pots")) redirect("/login");

  const pin = String(formData.get("pin") ?? "");
  if (!checkPotsPin(pin)) {
    return { status: "error", message: "Incorrect PIN. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(POTS_PIN_COOKIE, mintArmingToken("pots"), armingCookieOptions());

  redirect("/owner/pots");
}

/** Lets the owner lock Financial Pots again straight away. */
export async function lockPotsPage() {
  const cookieStore = await cookies();
  cookieStore.delete(POTS_PIN_COOKIE);
  redirect("/owner/pots-pin");
}