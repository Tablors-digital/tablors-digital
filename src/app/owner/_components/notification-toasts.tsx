"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleCheck, ShoppingBag, X } from "lucide-react";

type Item = {
  id: string;
  type: string;
  title: string;
  message: string;
  at: string;
  href: string;
  read: boolean;
  status?: string;
  severity: "info" | "warning" | "critical";
};

const POLL_MS = 4_000;
const SHOW_MS = 10_000;
const SEEN_KEY = "tablor:toasts-seen-v2";

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  } catch {
    /* storage unavailable: popups may repeat after a reload, nothing else */
  }
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

const STYLE: Record<Item["severity"], string> = {
  info: "border-emerald-400/70 bg-emerald-600 shadow-emerald-900/40",
  warning: "border-amber-300/70 bg-amber-600 shadow-amber-900/40",
  critical: "border-red-300/70 bg-red-600 shadow-red-900/40",
};

/**
 * Popup alerts for the whole owner portal (mounted in the owner layout, so they
 * appear on every dashboard tab). Every notification type pops up exactly once
 * per browser session (ids tracked in sessionStorage). A waiter request stays
 * on screen until it is acknowledged. The first load only records what already
 * exists so old items never flood the screen.
 */
export function NotificationToasts() {
  const [toasts, setToasts] = useState<Item[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const inFlight = useRef(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((n) => n.id !== id));
  }, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    try {
      await fetch("/api/owner/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* the bell still shows it as unread */
    }
  }, []);

  const acknowledge = useCallback(
    async (id: string) => {
      dismiss(id);
      await post({ acknowledge: id });
      window.dispatchEvent(new Event("tablors:notifications-changed"));
    },
    [dismiss, post],
  );

  const load = useCallback(async () => {
    if (inFlight.current) return; // never overlap requests
    inFlight.current = true;
    try {
      const res = await fetch("/api/owner/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: Item[] };
      const items = data.items ?? [];

      if (seen.current === null) {
        const known = loadSeen();
        if (known.size === 0) items.forEach((n) => known.add(n.id));
        seen.current = known;
        saveSeen(known);
        return;
      }

      // A waiter request someone else acknowledged disappears everywhere.
      const open = new Set(items.filter((n) => n.status === "unread" || n.status === "read").map((n) => n.id));
      setToasts((list) => list.filter((t) => t.type !== "waiter_call" || open.has(t.id)));

      const fresh = items.filter((n) => !n.read && !seen.current!.has(n.id));
      if (fresh.length === 0) return;
      fresh.forEach((n) => seen.current!.add(n.id));
      saveSeen(seen.current);

      setToasts((list) => [...fresh.reverse(), ...list].slice(0, 5));
      for (const n of fresh) {
        if (n.type === "waiter_call") continue; // stays until acknowledged
        timers.current.set(n.id, setTimeout(() => dismiss(n.id), SHOW_MS));
      }
    } catch {
      /* try again on the next tick */
    } finally {
      inFlight.current = false;
    }
  }, [dismiss]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const pending = timers.current;
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, [load]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((n) => {
        const Icon = n.type === "waiter_call" ? Bell : n.type.startsWith("order") ? ShoppingBag : CircleCheck;
        return (
          <div
            key={n.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3 text-white shadow-2xl ${STYLE[n.severity]}`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${n.type === "waiter_call" ? "animate-bounce" : ""}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <Link
                href={n.href}
                onClick={() => {
                  void post({ ids: [n.id] });
                  dismiss(n.id);
                }}
                className="block"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{n.title}</span>
                  <span className="shrink-0 text-[11px] opacity-90">{time(n.at)}</span>
                </span>
                <span className="block text-xs opacity-95">{n.message}</span>
              </Link>
              {n.type === "waiter_call" && (
                <button
                  type="button"
                  onClick={() => void acknowledge(n.id)}
                  className="mt-2 rounded-md bg-white px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  Acknowledge
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(n.id)}
              className="rounded p-1 opacity-80 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
