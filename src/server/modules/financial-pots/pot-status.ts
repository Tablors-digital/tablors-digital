import type { FinancialPot } from "./types";

/**
 * Derived, display-only status for a pot.
 *
 * The 85%/100% thresholds below are placeholder UI thresholds for the demo
 * only — no business rule for "near limit" / "over allocated" has been
 * confirmed. Replace this once real thresholds are defined.
 */
export interface PotStatusInfo {
  remainingRupees: number;
  usedPercent: number;
  label: "On track" | "Near limit" | "Over allocated";
  colorClass: string;
}

export function getPotStatus(pot: FinancialPot): PotStatusInfo {
  const remainingRupees = pot.allocatedRupees - pot.usedRupees;
  const usedPercent =
    pot.allocatedRupees === 0
      ? 0
      : Math.round((pot.usedRupees / pot.allocatedRupees) * 100);

  let label: PotStatusInfo["label"] = "On track";
  let colorClass =
    "text-[var(--radium-green)] bg-[var(--radium-green)]/10 border-[var(--radium-green)]/30";

  if (usedPercent >= 100) {
    label = "Over allocated";
    colorClass = "text-red-400 bg-red-500/10 border-red-500/30";
  } else if (usedPercent >= 85) {
    label = "Near limit";
    colorClass = "text-amber-400 bg-amber-500/10 border-amber-500/30";
  }

  return { remainingRupees, usedPercent, label, colorClass };
}

/* ------------------------------------------------------------------ */
/* Liquid-jar fill status (remaining-balance based)                    */
/* ------------------------------------------------------------------ */

/** Pure and unit-agnostic (paise or rupees), so it is safe to import from client components. */
export type FillState = "safe" | "monitor" | "alert" | "empty" | "unset";

/** Remaining-balance bands: > safeAbove = safe; monitorFrom..safeAbove = monitor; below monitorFrom = alert. */
export const FILL_THRESHOLDS = { safeAbove: 50, monitorFrom: 15 } as const;

export const FILL_LABEL: Record<FillState, string> = {
  safe: "Safe Zone",
  monitor: "Monitor",
  alert: "Alert",
  empty: "Empty",
  unset: "No limit set",
};

export interface FillStatusInfo {
  state: FillState;
  label: string;
  /** available / limit * 100, clamped 0..100. null when there is no limit to compare against. */
  remainingPercent: number | null;
}

export function getFillStatus(available: number, limit?: number | null): FillStatusInfo {
  const done = (state: FillState, remainingPercent: number | null): FillStatusInfo => ({ state, label: FILL_LABEL[state], remainingPercent });
  if (!(available > 0)) return done("empty", 0); // zero, negative or NaN: never any liquid
  if (limit === undefined || limit === null || !(limit > 0)) return done("unset", null);
  const raw = (available / limit) * 100;
  const pct = Math.min(100, Math.max(0, raw));
  if (raw > FILL_THRESHOLDS.safeAbove) return done("safe", pct);
  if (raw >= FILL_THRESHOLDS.monitorFrom) return done("monitor", pct);
  return done("alert", pct);
}