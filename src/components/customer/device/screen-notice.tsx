"use client";

/**
 * Notification bar rendered INSIDE the device, at the bottom of the screen.
 * One notice is shown at a time; the device decides which and for how long.
 *
 *  success → green  (order placed, cleared, …)
 *  error   → red    (ITEM NOT AVAILABLE, failures — same look as FARE IS ZERO)
 *  info    → cyan   (hints)
 *  waiter  → amber, ringing bell + "Ringing..." status
 */

export type ScreenNoticeKind = "success" | "error" | "info" | "waiter";

export type ScreenNoticeData = {
  /** Changes on every show, so repeating the same message re-triggers it. */
  id: number;
  kind: ScreenNoticeKind;
  text: string;
  detail?: string;
};

const PALETTE: Record<
  ScreenNoticeKind,
  { color: string; border: string; bg: string }
> = {
  success: { color: "#5fe08a", border: "#1f6b3a", bg: "rgba(31,107,58,0.22)" },
  error: { color: "#ff5a4d", border: "#8a2a24", bg: "rgba(194,59,52,0.2)" },
  info: { color: "var(--device-lcd-cyan)", border: "#1d5560", bg: "rgba(79,214,232,0.08)" },
  waiter: { color: "#f5a623", border: "#8a5d12", bg: "rgba(245,166,35,0.16)" },
};

function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={ringing ? "tablor-bell-ring" : undefined}
    >
      <path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ScreenNotice({
  notice,
  onDismiss,
}: {
  notice: ScreenNoticeData | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const palette = PALETTE[notice.kind];
  const isWaiter = notice.kind === "waiter";

  return (
    <div
      key={notice.id}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
      className="tablor-notice-in mx-1 mt-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 sm:mx-2"
      style={{ borderColor: palette.border, background: palette.bg, color: palette.color }}
    >
      {isWaiter && (
        <span
          className="tablor-ring-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: palette.border }}
        >
          <BellIcon ringing />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold uppercase leading-snug tracking-wide sm:text-[13px]">
          {notice.text}
        </p>

        {isWaiter && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Ringing...
          </p>
        )}

        {notice.detail && !isWaiter && (
          <p className="mt-0.5 text-[11px] opacity-80">{notice.detail}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={isWaiter ? "Acknowledge waiter call" : "Dismiss message"}
        className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-transform active:scale-95"
        style={{ borderColor: palette.border, color: palette.color }}
      >
        {isWaiter ? "Dismiss" : "OK"}
      </button>
    </div>
  );
}
