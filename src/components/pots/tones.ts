/**
 * Financial Pots colour language. Every value is an EXISTING Tablor token (globals.css):
 * radium green = increase, danger red = decrease, gold = brand accent. No new hues.
 */
export const TONE = {
  up: "var(--color-radium-500)",
  down: "var(--color-danger)",
  flat: "#9ca3af",
  none: "#52525b",
  gold: "var(--color-gold-500)",
} as const;
export type ToneKey = keyof typeof TONE;

/** Donut / legend colours per pot, all from the brand palette (gold, radium, lime, info blue). */
const POT_COLOURS: Record<string, string> = {
  GST: "#d4af37",            // gold-500
  SALARY: "#39ff6a",         // radium-500
  INVENTORY: "#4fb4ff",      // info
  MAINTENANCE: "#a9862a",    // gold-600
  SUBSCRIPTIONS: "#189446",  // radium-700
  SERVICE_CHARGES: "#e4c766",// gold-400
  OWNER_PROFIT: "#d7fe3b",   // acid lime (customer brand)
  UNALLOCATED: "#6b7280",    // text-muted
};
const CUSTOM_CYCLE = ["#9da194", "#8fd3ff", "#f5c451", "#22c95a"];
export function potColour(key: string, index = 0): string {
  return POT_COLOURS[key] ?? CUSTOM_CYCLE[index % CUSTOM_CYCLE.length]!;
}

/** Display-only compact rupees for axes and tight spaces: ₹1.2L, ₹3.4Cr. Input is integer paise. */
export function compactINR(paise: number): string {
  const r = paise / 100, a = Math.abs(r), sign = r < 0 ? "-" : "";
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  if (a >= 1e7) return `${sign}₹${f(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${f(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${f(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
export const fmtDateTime = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const fmtHour = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric" });
export const fmtRange = (from: number, to: number) => `${fmtDate(from)} – ${fmtDate(to)}`;
