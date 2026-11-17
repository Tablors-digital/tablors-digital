import { cookies } from "next/headers";
import { isPinTokenValid } from "./pin-session";
import { STAFF_PIN_COOKIE } from "./staff-pin";

export async function getStaffPinVerified(): Promise<boolean> {
  const cookieStore = await cookies();
  return isPinTokenValid(cookieStore.get(STAFF_PIN_COOKIE)?.value, "staff");
}
