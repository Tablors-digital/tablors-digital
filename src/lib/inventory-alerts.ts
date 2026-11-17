/** Pure inventory-alert rules (no I/O). */

export const ALERT_TYPES = [
  "low_stock",
  "out_of_stock",
  "replenishment",
  "inventory_update",
  "supplier_update",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_LABEL: Record<AlertType, string> = {
  low_stock: "Low-stock alert",
  out_of_stock: "Out-of-stock alert",
  replenishment: "Replenishment reminder",
  inventory_update: "Inventory update",
  supplier_update: "Supplier update",
};

export const ALERT_HELP: Record<AlertType, string> = {
  low_stock: "Sent when stock falls to or below the item's low-stock level.",
  out_of_stock: "Sent when stock reaches zero.",
  replenishment: "Sent when you press “Send replenishment reminder” (lists everything low or out).",
  inventory_update: "Sent when a new item is added or stock is increased.",
  supplier_update: "Sent to an item's supplier when you press “Notify supplier”.",
};

export const DEFAULT_TEMPLATES: Record<AlertType, string> = {
  low_stock: "⚠️ {restaurant}: {item} is running low. {quantity} {unit} left (alert level {threshold} {unit}).",
  out_of_stock: "🚫 {restaurant}: {item} is OUT OF STOCK.",
  replenishment: "🧾 {restaurant}: please reorder these items:\n{items}",
  inventory_update: "📦 {restaurant}: {item} stock is now {quantity} {unit}.",
  supplier_update: "Hello {supplier}, this is {restaurant}. We need to restock {item} (currently {quantity} {unit}). Please confirm availability.",
};

export type StockState = "ok" | "low" | "out";

export function stockState(quantity: number, lowStockThreshold: number): StockState {
  if (quantity <= 0) return "out";
  if (quantity <= lowStockThreshold) return "low";
  return "ok";
}

const RANK: Record<StockState, number> = { ok: 0, low: 1, out: 2 };

/** Which automatic alert (if any) a stock change should raise. Only a worsening state alerts, so repeats don't spam. */
export function alertForStockChange(prev: StockState, next: StockState): AlertType | null {
  if (RANK[next] <= RANK[prev]) return null;
  return next === "out" ? "out_of_stock" : "low_stock";
}

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * Normalises a WhatsApp number to digits with country code. A bare 10-digit
 * number is treated as Indian (+91). Returns null when it can't be valid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}
