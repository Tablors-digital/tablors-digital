import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isPinTokenValid, mintPinToken, PIN_COOKIE_BY_SCOPE, pinCookieOptions, type PinScope } from "@/server/modules/auth/pin-session";
import { getDemoSession } from "@/server/modules/auth/session";

export const dynamic = "force-dynamic";

/**
 * Called by the client PinSessionGuard.
 *  - { scope, action: "touch" } extends a still-valid PIN session by another idle window.
 *  - { scope, action: "lock" }  ends it immediately (leaving the section, idle, tab closing).
 * A route handler is used because cookies cannot be written from server components, and
 * because a server action that redirects would drag the user somewhere while they leave.
 */
export async function POST(req: Request) {
  let body: { scope?: unknown; action?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the 400 below
  }
  const scope: PinScope | null = body.scope === "staff" || body.scope === "pots" ? body.scope : null;
  if (!scope) return NextResponse.json({ ok: false, error: "Bad scope" }, { status: 400 });

  const name = PIN_COOKIE_BY_SCOPE[scope];
  const store = await cookies();

  if (body.action === "lock") {
    store.delete(name);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "touch") {
    const session = await getDemoSession();
    if (!session || !isPinTokenValid(store.get(name)?.value, scope)) {
      store.delete(name);
      return NextResponse.json({ ok: false, error: "Locked" }, { status: 401 });
    }
    store.set(name, mintPinToken(scope), pinCookieOptions());
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Bad action" }, { status: 400 });
}
