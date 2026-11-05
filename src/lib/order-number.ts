/** Human-readable numbers shown to customers and staff (never raw database ids). */
const pad = (n: number, width = 5) => String(Math.max(0, Math.trunc(n))).padStart(width, "0");

export function formatOrderNo(n: number | null | undefined): string {
  return n == null ? "ORD-—" : `ORD-${pad(n)}`;
}

export function formatBillNo(n: number | null | undefined): string {
  return n == null ? "BILL-—" : `BILL-${pad(n)}`;
}

/** "Table 03" / "t03" -> "3"; falls back to the label. */
export function tableNumberFromLabel(label: string): string {
  const digits = label.replace(/[^0-9]/g, "");
  return digits ? String(Number(digits)) : label;
}
