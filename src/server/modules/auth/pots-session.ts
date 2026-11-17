import { cookies } from "next/headers";
import { isPinTokenValid } from "./pin-session";
import { POTS_PIN_COOKIE } from "./pots-pin";

export async function getPotsPinVerified(): Promise<boolean> {
  const cookieStore = await cookies();
  return isPinTokenValid(cookieStore.get(POTS_PIN_COOKIE)?.value, "pots");
}
