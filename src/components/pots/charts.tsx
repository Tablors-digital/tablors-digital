"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatINR } from "@/server/modules/pots/money";
import { TONE, compactINR, fmtDate, fmtDateTime, fmtHour, type ToneKey } from "./tones";

export interface ChartPoint { t: number; v: number }
type TimeMode = "datetime" | "day" | "hour";
const stamp = (mode: TimeMode, t: number) => (mode === "day" ? fmtDate(t) : mode === "hour" ? fmtHour(t) : fmtDateTime(t));

/** Round-number y ticks (0-based when all values are >= 0). */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) out.push(Math.round(v));
  return out;
}

/**
 * Interactive area/line chart. Hover (or arrow keys) shows the exact amount and time of a real ledger
 * point. `step` draws balances as step-after lines; buckets (sales per day/hour) use smooth segments.
 * With fewer than 2 points it shows the empty state instead of a fabricated curve.
 */
export function AreaChart({ points, tone, mode, step = false, height = 260, emptyTitle, emptyHint, valueLabel = "Balance" }: {
  points: ChartPoint[]; tone: ToneKey; mode: TimeMode; step?: boolean; height?: number; emptyTitle: string; emptyHint?: string; valueLabel?: string;
}) {
  const id = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.floor(el.clientWidth))));
    ro.observe(el); setW(Math.max(280, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const colour = TONE[tone];
  const M = { l: 52, r: 12, t: 12, b: 26 };
  const usable = points.length >= 2 && !(points.length === 2 && points[0]!.t === points[1]!.t);

  const move = useCallback((clientX: number) => {
    const el = box.current; if (!el || !usable) return;
    const rect = el.getBoundingClientRect(); const px = clientX - rect.left;
    const t0 = points[0]!.t, t1 = points[points.length - 1]!.t;
    const target = t0 + ((px - M.l) / Math.max(1, w - M.l - M.r)) * (t1 - t0);
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(p.t - target); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  }, [points, usable, w]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!usable) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-black/30 px-6 text-center" style={{ height }}>
        <svg width="56" height="28" viewBox="0 0 56 28" aria-hidden><path d="M2 22 L16 14 L28 18 L40 6 L54 10" fill="none" stroke="#3f3f46" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" /></svg>
        <p className="mt-3 text-sm font-medium text-zinc-300">{emptyTitle}</p>
        {emptyHint ? <p className="mt-1 max-w-sm text-xs text-zinc-500">{emptyHint}</p> : null}
      </div>
    );
  }

  const t0 = points[0]!.t, t1 = points[points.length - 1]!.t;
  const vals = points.map((p) => p.v);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals, 1);
  const ticks = niceTicks(lo, hi);
  const yMin = Math.min(lo, ticks[0]!), yMax = Math.max(hi, ticks[ticks.length - 1]!);
  const iw = w - M.l - M.r, ih = height - M.t - M.b;
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0 || 1)) * iw;
  const y = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;

  let d = `M ${x(points[0]!.t).toFixed(1)} ${y(points[0]!.v).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!, q = points[i - 1]!;
    d += step ? ` L ${x(p.t).toFixed(1)} ${y(q.v).toFixed(1)} L ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}` : ` L ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
  }
  const base = y(Math.max(yMin, 0));
  const area = `${d} L ${x(t1).toFixed(1)} ${base} L ${x(t0).toFixed(1)} ${base} Z`;
  const hp = hover !== null ? points[hover]! : null;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));
  const tipLeft = hp ? Math.min(Math.max(x(hp.t) - 70, 4), w - 150) : 0;

  return (
    <div ref={box} className="relative select-none" style={{ height }} onPointerMove={(e) => move(e.clientX)} onPointerLeave={() => setHover(null)}
      tabIndex={0} role="img" aria-label={`${valueLabel} chart, ${points.length} points. Use left and right arrow keys to inspect values.`}
      onKeyDown={(e) => { if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1)); if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1)); if (e.key === "Escape") setHover(null); }}
      onBlur={() => setHover(null)}>
      <svg width={w} height={height} className="block">
        <defs>
          <linearGradient id={`a${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colour} stopOpacity="0.30" /><stop offset="100%" stopColor={colour} stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={M.l} x2={w - M.r} y1={y(tv)} y2={y(tv)} stroke="#262b33" strokeDasharray="3 5" />
            <text x={M.l - 8} y={y(tv) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">{compactINR(tv)}</text>
          </g>
        ))}
        {xTicks.map((tt, i) => (
          <text key={i} x={x(tt)} y={height - 7} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize="10" fill="#6b7280">{stamp(mode === "datetime" ? "day" : mode, tt)}</text>
        ))}
        <path d={area} fill={`url(#a${id})`} className="pots-fade" />
        <path d={d} fill="none" stroke={colour} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="pots-draw" style={{ filter: `drop-shadow(0 0 6px ${colour})` }} />
        {hp ? (
          <g>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={M.t} y2={base} stroke={colour} strokeOpacity="0.4" strokeDasharray="3 3" />
            <circle cx={x(hp.t)} cy={y(hp.v)} r="5" fill="#05070a" stroke={colour} strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-zinc-700 bg-black/90 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur" style={{ left: tipLeft }}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{stamp(mode, hp.t)}</p>
          <p className="font-semibold tabular-nums" style={{ color: colour }}>{formatINR(hp.v)}</p>
          <p className="text-[10px] text-zinc-500">{valueLabel}</p>
        </div>
      ) : null}
    </div>
  );
}

export interface DonutSlice { key: string; label: string; value: number; percent: number; colour: string; href?: string }

/** Allocation donut with a legend that highlights the matching slice (and vice-versa). */
export function DonutChart({ slices, total, centreLabel = "Held in total" }: { slices: DonutSlice[]; total: number; centreLabel?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const R = 70, C = 2 * Math.PI * R, GAP = slices.length > 1 ? 2.2 : 0;
  let offset = 0;
  const shown = active ? slices.find((s) => s.key === active) : null;

  if (slices.length === 0 || total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
        <svg width="170" height="170" viewBox="0 0 180 180" aria-hidden><circle cx="90" cy="90" r={R} fill="none" stroke="#262b33" strokeWidth="18" strokeDasharray="3 7" /></svg>
        <p className="text-sm font-medium text-zinc-300">Nothing allocated yet</p>
        <p className="max-w-xs text-xs text-zinc-500">The chart fills in as settled payments reach your pots or the unallocated balance.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg width="190" height="190" viewBox="0 0 180 180" role="img" aria-label="Allocation of settled money across pots" style={{ filter: "drop-shadow(0 0 18px rgba(212,175,55,0.12))" }}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="#161a21" strokeWidth="18" />
          <g transform="rotate(-90 90 90)">
            {slices.map((s) => {
              const len = Math.max(0, (s.percent / 100) * C - GAP);
              const el = (
                <circle key={s.key} cx="90" cy="90" r={R} fill="none" stroke={s.colour} strokeWidth={active === s.key ? 22 : 18}
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} opacity={active && active !== s.key ? 0.35 : 1}
                  style={{ transition: "stroke-width .15s, opacity .15s", cursor: "pointer" }}
                  onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)} />
              );
              offset += (s.percent / 100) * C;
              return el;
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{shown ? shown.label : centreLabel}</span>
          <span className="mt-0.5 text-lg font-extrabold tabular-nums text-zinc-100">{formatINR(shown ? shown.value : total)}</span>
          <span className="text-[11px] font-medium" style={{ color: shown?.colour ?? "var(--color-gold-500)" }}>{shown ? `${shown.percent}%` : `${slices.length} ${slices.length === 1 ? "bucket" : "buckets"}`}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {slices.map((s) => {
          const row = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.colour, boxShadow: `0 0 8px ${s.colour}` }} />
              <span className="min-w-0 flex-1 truncate text-zinc-300">{s.label}</span>
              <span className="tabular-nums text-zinc-100">{formatINR(s.value)}</span>
              <span className="w-12 text-right tabular-nums text-zinc-500">{s.percent}%</span>
            </>
          );
          const cls = `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${active === s.key ? "bg-white/5" : ""}`;
          return (
            <li key={s.key} onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(s.key)} onBlur={() => setActive(null)}>
              {s.href ? <Link href={s.href} className={`${cls} hover:bg-white/5`}>{row}</Link> : <div className={cls}>{row}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
