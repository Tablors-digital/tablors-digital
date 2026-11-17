import { useId } from "react";
import { TONE, type ToneKey } from "./tones";

export interface SparkPoint { t: number; v: number }

/**
 * Mini balance trend. Server-renderable (no hooks besides useId, no client JS).
 * The line is a step-after path of the REAL running balance, coloured by the caller from the
 * trend direction. direction "none" draws a dotted baseline (no history), never a made-up curve.
 */
export function Sparkline({ points, direction, width = 160, height = 48, label }: { points: SparkPoint[]; direction: ToneKey; width?: number; height?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const colour = TONE[direction];
  const padX = 3, padY = 6;
  const empty = direction === "none" || points.length < 2;
  if (empty) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "No history yet"} style={{ width: "100%", height: "auto" }}>
        <line x1={padX} x2={width - padX} y1={height / 2} y2={height / 2} stroke={TONE.none} strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      </svg>
    );
  }
  const t0 = points[0]!.t, t1 = points[points.length - 1]!.t;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (t: number) => padX + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (width - padX * 2));
  const y = (v: number) => (hi === lo ? height / 2 : padY + (1 - (v - lo) / (hi - lo)) * (height - padY * 2));
  let d = `M ${x(points[0]!.t).toFixed(1)} ${y(points[0]!.v).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!, prev = points[i - 1]!;
    d += ` L ${x(p.t).toFixed(1)} ${y(prev.v).toFixed(1)} L ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`; // step-after: balance holds until the next movement
  }
  const last = points[points.length - 1]!;
  const area = `${d} L ${x(last.t).toFixed(1)} ${height} L ${x(points[0]!.t).toFixed(1)} ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", overflow: "visible" }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.32" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} className="pots-fade" />
      <path d={d} fill="none" stroke={colour} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="pots-draw" style={{ filter: `drop-shadow(0 0 4px ${colour})` }} />
      <circle cx={x(last.t)} cy={y(last.v)} r="2.6" fill={colour} className="pots-pulse" />
    </svg>
  );
}
