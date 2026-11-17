import { createHmac, timingSafeEqual } from "node:crypto";
import { POTS_PIN_COOKIE } from "./pots-pin";
import { STAFF_PIN_COOKIE } from "./staff-pin";

export type PinScope = "staff" | "pots";

/** Grace window after leaving/closing a PIN-protected section before it re-locks. */
export const PIN_IDLE_MS = 10_000;
const GRACE_MS = 1_000;

/**
 * Right after the PIN is verified the cookie gets this longer "arming" window, so a slow
 * redirect / first compile can't expire it before the section renders. The guard replaces it
 * with the short live token (PIN_IDLE_MS + GRACE_MS) while mounted.
 */
export const PIN_ARM_MS = 120_000;

export const PIN_COOKIE_BY_SCOPE: Record<PinScope, string> = {
  staff: STAFF_PIN_COOKIE,
  pots: POTS_PIN_COOKIE,
};

function secret(): string {
  const s = process.env.PIN_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("PIN_SESSION_SECRET is not set");
  return "dev-only-pin-session-secret";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Signed, scope-bound token with an absolute expiry: `<scope>.<expiresAtMs>.<hmac>`. */
export function mintPinToken(
  scope: PinScope,
  now = Date.now(),
  ttlMs = PIN_IDLE_MS + GRACE_MS,
): string {
  const payload = `${scope}.${now + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

/** Long-lived token used only right after the PIN is verified. */
export const mintArmingToken = (scope: PinScope): string => mintPinToken(scope, Date.now(), PIN_ARM_MS);

export function isPinTokenValid(token: string | undefined, scope: PinScope, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [s, exp, sig] = parts as [string, string, string];
  if (s !== scope) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${s}.${exp}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > now;
}

export function pinCookieOptions(ttlMs = PIN_IDLE_MS + GRACE_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.ceil(ttlMs / 1000),
  };
}

export const armingCookieOptions = () => pinCookieOptions(PIN_ARM_MS);