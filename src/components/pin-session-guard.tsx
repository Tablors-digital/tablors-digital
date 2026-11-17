"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Scope = "staff" | "pots";

const ENDPOINT = "/api/pin-session";
const HEARTBEAT_MS = 4_000;

// One pending post-exit lock per scope. Survives React Strict Mode re-mounts in dev,
// and cancels automatically if the user returns to that section within `idleMs` (10s).
const pendingLocks = new Map<Scope, ReturnType<typeof setTimeout>>();

function post(scope: Scope, action: "touch" | "lock"): Promise<Response> {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope, action }),
    credentials: "same-origin",
    keepalive: true,
  });
}

/**
 * Mount once in the layout of a PIN-protected section (`/owner/staff`, `/owner/pots`).
 *  - Stays unlocked while the user is actively viewing the section.
 *  - Once the user leaves/exits the section (layout unmounts) or backgrounds the tab,
 *    starts a `idleMs` (10-second) countdown before locking the session.
 */
export function PinSessionGuard({ scope, pinPath, idleMs }: { scope: Scope; pinPath: string; idleMs: number }) {
  const router = useRouter();

  useEffect(() => {
    // Returned before the 10-second exit grace window expired: cancel the pending lock.
    const pending = pendingLocks.get(scope);
    if (pending) {
      clearTimeout(pending);
      pendingLocks.delete(scope);
    }

    let unmounted = false;
    let locked = false;
    let hiddenAt: number | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

    const lockNow = () => {
      if (locked) return;
      locked = true;
      post(scope, "lock")
        .catch(() => {})
        .finally(() => {
          if (!unmounted) router.replace(pinPath);
        });
    };

    const touch = () => {
      if (locked) return;
      post(scope, "touch")
        .then((res) => {
          if (res.status === 401) lockNow();
        })
        .catch(() => {});
    };

    // Keep the short-lived cookie alive while the section remains open & visible.
    touch();
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") touch();
    }, HEARTBEAT_MS);

    // If the user switches away / minimizes the window, lock after `idleMs` (10s).
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        touch(); // Cookie expires ~10s after hiding
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(lockNow, idleMs);
      } else if (document.visibilityState === "visible") {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = undefined;
        }
        if (hiddenAt !== null && Date.now() - hiddenAt >= idleMs) {
          lockNow();
        } else {
          hiddenAt = null;
          touch();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      clearInterval(heartbeat);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", onVisibility);

      if (!locked) {
        // Stamp the server cookie at the exact moment of exit (lives for `idleMs` = 10s),
        // and explicitly clear it after `idleMs` if the user hasn't come back.
        void post(scope, "touch").catch(() => {});
        pendingLocks.set(
          scope,
          setTimeout(() => {
            pendingLocks.delete(scope);
            void post(scope, "lock").catch(() => {});
          }, idleMs),
        );
      }
    };
  }, [scope, pinPath, idleMs, router]);

  return null;
}