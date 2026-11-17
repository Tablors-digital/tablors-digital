"use client";

import { useEffect, useId, useState } from "react";
import { TONE } from "@/components/pots/tones";

export type SandTimerProps = {
  /** Widget heading, e.g. "Next GST filing". */
  title: string;
  /** Start and end of the cycle, epoch ms. */
  startMs: number;
  endMs: number;
  /** Server time for first paint (keeps server and client HTML identical). */
  nowMs: number;
  /** One line under the countdown, e.g. "GSTR-3B for Oct 2026 · due 20th". */
  caption?: string;
  /** Cycle already finished (paid, approved...): full bottom bulb, green, no countdown. */
  done?: boolean;
  doneLabel?: string;
  /** Word shown after the time, e.g. "left" / "to approve". */
  suffix?: string;
  className?: string;
};

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

/**
 * Sand-timer status widget. The top bulb empties and the bottom bulb fills as
 * the cycle runs out. Green = plenty of time, gold = getting close,
 * red = nearly out of time or overdue.
 */
export function SandTimer({ title, startMs, endMs, nowMs, caption, done = false, doneLabel = "Completed", suffix = "left", className = "" }: SandTimerProps) {
  const uid = useId().replace(/:/g, "");
  const [now, setNow] = useState(nowMs);

  const remaining = endMs - now;
  // Tick every second in the last hour, otherwise every 30 seconds.
  const fast = remaining < 3_600_000;
 useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNow(Date.now()), fast ? 1_000 : 30_000);
    return () => clearInterval(id);
  }, [done, fast]);

  const total = Math.max(1, endMs - startMs);
  const progress = done ? 1 : Math.min(1, Math.max(0, (now - startMs) / total));
  const overdue = !done && remaining <= 0;
  const colour = done ? TONE.up : overdue || progress >= 0.9 ? TONE.down : progress >= 0.75 ? TONE.gold : TONE.up;

  const topY = 2 + 14 * progress; // sand surface in the top bulb
  const botY = 30 - 14 * progress; // sand surface in the bottom bulb
  const pct = Math.round(progress * 100);

  const headline = done ? doneLabel : overdue ? "Overdue" : `${formatLeft(remaining)} ${suffix}`;

  return (
    <div
      className={`pots-panel relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 sm:p-5 ${className}`}
      style={{ borderColor: `color-mix(in srgb, ${colour} 35%, #27272a)` }}
      role="timer"
      aria-label={`${title}: ${headline}`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl" style={{ background: `color-mix(in srgb, ${colour} 16%, transparent)` }} />

      <svg viewBox="0 0 24 32" className="relative h-14 w-11 shrink-0" aria-hidden>
        <defs>
          <clipPath id={`${uid}-top`}><path d="M5 2H19V8L12.8 16H11.2L5 8Z" /></clipPath>
          <clipPath id={`${uid}-bot`}><path d="M5 30H19V24L12.8 16H11.2L5 24Z" /></clipPath>
        </defs>
        {/* sand */}
        <rect x="4" y={topY} width="16" height={16 - topY} fill={colour} opacity="0.9" clipPath={`url(#${uid}-top)`} />
        <rect x="4" y={botY} width="16" height={30 - botY} fill={colour} opacity="0.9" clipPath={`url(#${uid}-bot)`} />
        {/* falling grains while the cycle is running */}
        {!done && progress < 1 ? (
          <line x1="12" y1="16" x2="12" y2={botY} stroke={colour} strokeWidth="0.8" strokeDasharray="1 1.4">
            <animate attributeName="stroke-dashoffset" from="2.4" to="0" dur="0.7s" repeatCount="indefinite" />
          </line>
        ) : null}
        {/* glass */}
        <path d="M5 2H19V8L12.8 16L19 24V30H5V24L11.2 16L5 8Z" fill="none" stroke="#a1a1aa" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M3.5 2H20.5M3.5 30H20.5" stroke="#d4d4d8" strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <div className="relative min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{title}</p>
        <p className="mt-0.5 text-xl font-extrabold tabular-nums leading-tight" style={{ color: colour }}>{headline}</p>
        {caption ? <p className="mt-0.5 truncate text-xs text-zinc-500">{caption}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800/80" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour, boxShadow: `0 0 10px ${colour}` }} />
          </div>
          <span className="w-9 text-right text-[11px] tabular-nums text-zinc-500">{pct}%</span>
        </div>
      </div>
    </div>
  );
}