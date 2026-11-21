"use client";

import { useState } from "react";
import { formatINR } from "@/server/modules/pots/money";
import { LiquidGlassPot, type LiquidGlassPotProps } from "./LiquidGlassPot";
import { TONE } from "./tones";

/** Preview-only: local React state, no server calls, no form, nothing is saved. */
export function PotSimulator(props: Pick<LiquidGlassPotProps, "name" | "availablePaise" | "limitPaise" | "shareBasisPaise" | "allocatedPaise" | "recentDelta">) {
  const { availablePaise, limitPaise, shareBasisPaise } = props;
  const [deltaPaise, setDelta] = useState(0);

  const base = Math.max(0, availablePaise);
  const minRs = -Math.floor(base / 100);
  const maxPaise = limitPaise && limitPaise > 0 ? Math.max(limitPaise - base, 0) : base; // no limit: preview up to doubling
  const maxRs = Math.floor(maxPaise / 100);
  const disabled = minRs === 0 && maxRs === 0;

  const simulated = availablePaise + deltaPaise;
  const simShare = shareBasisPaise && shareBasisPaise > 0 ? shareBasisPaise + deltaPaise : shareBasisPaise;
  const tone = deltaPaise > 0 ? TONE.up : deltaPaise < 0 ? TONE.down : TONE.flat;

  return (
    <div className="grid items-center gap-5 sm:grid-cols-2">
      <LiquidGlassPot {...props} availablePaise={simulated} shareBasisPaise={simShare} recentDelta={null} inspectable={false} size="md" />
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Allocation simulator</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Preview only. Drag to see how adding or spending would change the level and status. Nothing is saved or moved.</p>
        </div>
        <div>
          <label htmlFor="pot-sim" className="flex items-baseline justify-between text-xs text-zinc-400">
            <span>Add / spend</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: tone }}>{deltaPaise > 0 ? "+" : deltaPaise < 0 ? "-" : ""}{formatINR(Math.abs(deltaPaise))}</span>
          </label>
          <input
            id="pot-sim" type="range" className="mt-2 w-full accent-[var(--color-gold-500)]" disabled={disabled}
            min={minRs} max={maxRs} step={1} value={Math.round(deltaPaise / 100)}
            onChange={(e) => setDelta(Number(e.target.value) * 100)}
          />
          <div className="flex justify-between text-[10px] text-zinc-600"><span>Spend {formatINR(-minRs * 100)}</span><span>Add {formatINR(maxRs * 100)}</span></div>
          {limitPaise && limitPaise > 0 ? null : <p className="mt-1 text-[10px] text-zinc-600">No limit is set, so the add range is capped at the current balance.</p>}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-xs">
          <span className="text-zinc-500">Balance after</span>
          <span className="font-semibold tabular-nums text-zinc-100">{formatINR(simulated)}</span>
        </div>
        <button type="button" onClick={() => setDelta(0)} disabled={deltaPaise === 0} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-40">Reset preview</button>
      </div>
    </div>
  );
}