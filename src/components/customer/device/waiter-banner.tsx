"use client";

import type { WaiterState } from "@/server/modules/orders/waiter";

/**
 * Waiter-call popup pinned to the TOP of the device. It reflects the real,
 * server-side state: ringing until staff acknowledge it on the owner
 * dashboard, then "on the way".
 */
export function WaiterBanner({ waiter, onDismiss }: { waiter: WaiterState; onDismiss: () => void }) {
  if (waiter.status === "none") return null;
  const ringing = waiter.status === "ringing";
  const color = ringing ? "#f5a623" : "#5fe08a";
  const calledAt = new Date(waiter.calledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="tablor-notice-in sticky top-1 z-30 mx-1 mb-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 shadow-lg sm:mx-2"
      style={{ borderColor: color, background: ringing ? "rgba(60,38,6,0.96)" : "rgba(10,48,24,0.96)", color }}
    >
      {ringing && (
        <span className="tablor-ring-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: color }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="tablor-bell-ring">
            <path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" />
            <path d="M10 20.5a2 2 0 0 0 4 0" />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold uppercase leading-snug tracking-wide sm:text-[13px]">
          {ringing ? "CUSTOMER IS CALLING FOR WAITER" : "WAITER ACKNOWLEDGED — ON THE WAY"}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
          {ringing && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
          {ringing ? "Ringing..." : "Staff will be with you shortly"} · Requested {calledAt}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide waiter message"
        className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
        style={{ borderColor: color, color }}
      >
        Hide
      </button>
    </div>
  );
}
