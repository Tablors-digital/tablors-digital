"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatINR } from "@/server/modules/pots/money";
import { getFillStatus, type FillState } from "@/server/modules/financial-pots/pot-status";
import { TONE } from "./tones";

/**
 * Transparent glass jar with two animated liquid layers.
 * - Level = remaining balance / limit (never the amount spent).
 * - State, label and thresholds come from getFillStatus() (pot-status.ts); colours come from TONE (tones.ts).
 * - All money props are integer paise, like the rest of the pots module.
 */
export type LiquidGlassPotProps = {
  name: string;
  /** Available balance, paise. Zero or negative renders an empty jar. */
  availablePaise: number;
  /** Target / limit, paise. When absent the jar cannot show health (see shareBasisPaise). */
  limitPaise?: number | null;
  /** Used only when there is no limit: level = share of this total (e.g. all money held in pots). */
  shareBasisPaise?: number | null;
  /** Allocated this month, paise (shown in the inspection popover when provided). */
  allocatedPaise?: number | null;
  /** Most recent real movement, with a label saying what it measures. */
  recentDelta?: { paise: number; label: string } | null;
  /** Liquid colour for jars with no limit (no health status to show). Ignored when a limit exists. */
  accentColour?: string;
  /** Hover/focus popover + ripple. Default true. */
  inspectable?: boolean;
  /** Make the jar keyboard-focusable (for pages where it is not already inside a link). */
  focusable?: boolean;
  /** Tap/click toggles the popover (only for jars that are not inside a link). */
  toggleOnClick?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const STATE_TONE: Record<FillState, string> = {
  safe: TONE.up,
  monitor: TONE.gold,
  alert: TONE.down,
  empty: TONE.down,
  unset: TONE.flat,
};
const SIZE: Record<NonNullable<LiquidGlassPotProps["size"]>, string> = { sm: "max-w-[150px]", md: "max-w-[200px]", lg: "max-w-[240px]" };

// Jar geometry (viewBox 0 0 200 260). Liquid spans LEVEL_BOTTOM (empty) .. LEVEL_TOP (full).
const JAR = "M66 30 L66 50 C66 66 28 70 28 100 L28 208 C28 228 40 240 60 240 L140 240 C160 240 172 228 172 208 L172 100 C172 70 134 66 134 50 L134 30 Z";
const LEVEL_TOP = 52;
const LEVEL_BOTTOM = 240;
const MIN_VISIBLE_FILL = 3; // a non-zero balance never disappears completely

/** Sine-ish wave using chained quadratic segments; baseline at y=0, one period = L, seamless when shifted by L. */
function wavePath(L: number, A: number, width: number): string {
  const half = L / 2;
  const n = Math.ceil(width / half);
  let d = `M0 0 q${L / 4} ${-A} ${half} 0`;
  for (let i = 1; i < n; i++) d += ` t${half} 0`;
  return `${d} V320 H0 Z`;
}
const WAVE_A = { L: 100, A: 7, path: wavePath(100, 7, 400) };
const WAVE_B = { L: 140, A: 5, path: wavePath(140, 5, 480) };

const CSS = `
.lgp-drift-a{animation:lgp-drift-a 7s linear infinite}
.lgp-drift-b{animation:lgp-drift-b 11s linear infinite reverse}
@keyframes lgp-drift-a{from{transform:translateX(0)}to{transform:translateX(-${WAVE_A.L}px)}}
@keyframes lgp-drift-b{from{transform:translateX(0)}to{transform:translateX(-${WAVE_B.L}px)}}
.lgp-level{transition:transform 900ms cubic-bezier(.22,1,.36,1)}
.lgp-amp{transition:transform 450ms ease;transform-origin:0 0}
.lgp-ripple{transform-box:fill-box;transform-origin:center;animation:lgp-ripple 1.1s ease-out forwards}
@keyframes lgp-ripple{from{transform:scale(.3);opacity:.75}to{transform:scale(4.2);opacity:0}}
.lgp-float{transition:transform 350ms ease}
.lgp-tip{transition:opacity 160ms ease,transform 160ms ease}
@media (prefers-reduced-motion: reduce){
  .lgp-drift-a,.lgp-drift-b,.lgp-ripple{animation:none}
  .lgp-level,.lgp-amp,.lgp-float,.lgp-tip{transition:none}
  .lgp-ripple{display:none}
}`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function LiquidGlassPot({
  name, availablePaise, limitPaise, shareBasisPaise, allocatedPaise, recentDelta, accentColour,
  inspectable = true, focusable = false, toggleOnClick = false, size = "md", className = "",
}: LiquidGlassPotProps) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [inspect, setInspect] = useState(false);
  const [ripple, setRipple] = useState(0);

  const status = getFillStatus(availablePaise, limitPaise);
  const statusColour = STATE_TONE[status.state];
  const colour = status.state === "unset" && accentColour ? accentColour : statusColour;
  const hasLiquid = status.state !== "empty";

  // Level: remaining/limit when a limit exists, otherwise share of the pots total (real data, neutral colour).
  let fill = status.remainingPercent ?? 0;
  if (status.state === "unset" && shareBasisPaise && shareBasisPaise > 0) fill = clamp((availablePaise / shareBasisPaise) * 100, 0, 100);
  const visibleFill = hasLiquid ? Math.max(fill, MIN_VISIBLE_FILL) : 0;
  const levelY = LEVEL_BOTTOM - (visibleFill / 100) * (LEVEL_BOTTOM - LEVEL_TOP);
  const ampScale = Math.min(1, ((LEVEL_BOTTOM - levelY) / 16)) * (inspect ? 1.5 : 1);

  const pctText = !hasLiquid
    ? availablePaise < 0 ? "Overdrawn" : "Empty"
    : status.state === "unset"
      ? shareBasisPaise && shareBasisPaise > 0 ? `${fill < 1 ? "<1" : Math.round(fill)}% of all pots` : "No limit set"
      : `${fill < 1 ? "<1" : Math.round(fill)}% remaining`;

  // Smoothly speed the waves up while inspecting (playbackRate keeps the current phase, so no jump).
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof el.getAnimations !== "function") return;
    for (const a of el.getAnimations({ subtree: true })) {
      if ("animationName" in a && String((a as CSSAnimation).animationName).startsWith("lgp-drift")) a.playbackRate = inspect ? 1.8 : 1;
    }
  }, [inspect, hasLiquid]);

  const open = () => { if (!inspectable) return; setInspect(true); setRipple((r) => r + 1); };
  const close = () => setInspect(false);

  const glow = `color-mix(in srgb, ${colour} 45%, transparent)`;
  const rimStroke = `color-mix(in srgb, ${colour} 55%, #d4d4d8)`;
  const delta = recentDelta?.paise ?? null;

  const summary = [
    `${name}: ${formatINR(availablePaise)} available`,
    limitPaise && limitPaise > 0 ? `of ${formatINR(limitPaise)} limit` : "no limit set",
    pctText,
    status.label,
  ].join(", ");

  return (
    <div className={`mx-auto flex w-full flex-col items-center gap-2 ${SIZE[size]} ${className}`}>
      <style>{CSS}</style>
      <div
        className={`lgp-float relative w-full ${inspect ? "-translate-y-[3px]" : ""}`}
        style={{ aspectRatio: "200 / 260", containerType: "inline-size", transform: inspect ? "translateY(-3px)" : undefined }}
        onPointerEnter={open}
        onPointerLeave={close}
        onFocus={focusable ? open : undefined}
        onBlur={focusable ? close : undefined}
        onClick={toggleOnClick ? () => (inspect ? close() : open()) : undefined}
        tabIndex={focusable ? 0 : undefined}
        role="img"
        aria-label={summary}
      >
        <svg ref={svgRef} viewBox="0 0 200 260" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <clipPath id={`${uid}-clip`}><path d={JAR} /></clipPath>
            <linearGradient id={`${uid}-glass`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
              <stop offset="50%" stopColor="#fff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.07" />
            </linearGradient>
            <linearGradient id={`${uid}-liq`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: colour }} stopOpacity="0.95" />
              <stop offset="100%" style={{ stopColor: `color-mix(in srgb, ${colour} 60%, #000)` }} stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id={`${uid}-base`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" style={{ stopColor: colour }} stopOpacity="0.55" />
              <stop offset="100%" style={{ stopColor: colour }} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* glowing base */}
          <ellipse cx="100" cy="246" rx="82" ry="11" fill={`url(#${uid}-base)`} />

          {/* glass body */}
          <path d={JAR} fill={`url(#${uid}-glass)`} />

          {/* liquid: strictly clipped to the jar */}
          {hasLiquid ? (
            <g clipPath={`url(#${uid}-clip)`}>
              <g className="lgp-level" style={{ transform: `translateY(${levelY}px)` }}>
                <g className="lgp-amp" style={{ transform: `scaleY(${ampScale})`, opacity: 0.5 }}>
                  <g className="lgp-drift-b"><path d={WAVE_B.path} transform="translate(0 -2)" fill={`url(#${uid}-liq)`} /></g>
                </g>
                <g className="lgp-amp" style={{ transform: `scaleY(${ampScale})`, opacity: 0.88 }}>
                  <g className="lgp-drift-a"><path d={WAVE_A.path} fill={`url(#${uid}-liq)`} /></g>
                </g>
                {ripple > 0 ? <ellipse key={ripple} className="lgp-ripple" cx="100" cy="0" rx="14" ry="3" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.4" /> : null}
              </g>
            </g>
          ) : null}

          {/* reflections */}
          <path d="M42 108 L42 198" stroke="#fff" strokeOpacity="0.30" strokeWidth="5" strokeLinecap="round" />
          <path d="M159 116 L159 150" stroke="#fff" strokeOpacity="0.18" strokeWidth="3" strokeLinecap="round" />
          <path d="M74 58 C82 64 92 66 102 66" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="2.5" strokeLinecap="round" />

          {/* outline + rim */}
          <path d={JAR} fill="none" stroke={rimStroke} strokeOpacity="0.75" strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="58" y="17" width="84" height="14" rx="6" fill="#fff" fillOpacity="0.07" stroke={rimStroke} strokeOpacity="0.9" strokeWidth="2" />
        </svg>

        {/* amount + percentage, always readable: white with a dark halo over any liquid */}
        <div className="pointer-events-none absolute inset-x-0 top-[58%] -translate-y-1/2 px-[16%] text-center" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,.7)" }}>
          <p className="whitespace-nowrap font-extrabold leading-none tabular-nums" style={{ fontSize: "clamp(13px, 10.5cqw, 26px)" }}>{formatINR(availablePaise)}</p>
          <p className="mt-1 whitespace-nowrap font-semibold leading-none" style={{ fontSize: "clamp(10px, 6.4cqw, 14px)" }}>{pctText}</p>
        </div>

        {/* inspection popover: sits inside the card (no clipping), never intercepts the pointer */}
        {inspectable ? (
          <div
            aria-hidden
            data-open={inspect}
            className="lgp-tip pointer-events-none absolute inset-x-[-6%] top-[14%] z-10 rounded-xl border border-zinc-700 bg-black/90 p-2.5 text-[11px] shadow-2xl backdrop-blur opacity-0 data-[open=true]:opacity-100 group-focus-visible:opacity-100"
            style={{ transform: inspect ? "translateY(0)" : "translateY(4px)" }}
          >
            <p className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{name}</p>
            <dl className="space-y-1">
              <Row k="Target / limit" v={limitPaise && limitPaise > 0 ? formatINR(limitPaise) : "Not set"} />
              <Row k="Available" v={formatINR(availablePaise)} />
              {allocatedPaise !== undefined && allocatedPaise !== null ? <Row k="Allocated this month" v={formatINR(allocatedPaise)} /> : null}
              <Row
                k={recentDelta?.label ?? "Recent change"}
                v={delta === null ? "—" : `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${formatINR(Math.abs(delta))}`}
                tone={delta === null || delta === 0 ? undefined : delta > 0 ? TONE.up : TONE.down}
              />
              <Row k="Status" v={status.label} tone={statusColour} />
            </dl>
          </div>
        ) : null}
      </div>

      <span
        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ color: statusColour, borderColor: `color-mix(in srgb, ${statusColour} 45%, transparent)`, background: `color-mix(in srgb, ${statusColour} 10%, transparent)`, boxShadow: `0 0 14px ${glow}` }}
      >
        {status.label}
      </span>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="font-semibold tabular-nums text-zinc-100" style={tone ? { color: tone } : undefined}>{v}</dd>
    </div>
  );
}