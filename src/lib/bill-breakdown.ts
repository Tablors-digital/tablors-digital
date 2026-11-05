/**
 * Pure bill maths shared by the on-device provisional bill and its tests.
 *
 * Rules (kept identical to issueBillDb so the preview never disagrees with the
 * bill that is finally issued):
 *  - every charge is a percentage of the SUBTOTAL only (no compounding), so no
 *    tax is ever charged on top of another tax;
 *  - each charge is rounded to a whole rupee;
 *  - total = subtotal + GST + additional tax + service charge.
 */

export type BillRates = {
  gstPercent: number;
  /** Any extra applicable levy (e.g. state cess). 0 unless configured. */
  additionalTaxPercent: number;
  serviceChargePercent: number;
};

export type BillLineInput = { qty: number; priceRupees: number };

export type BillBreakdown = {
  subtotal: number;
  gst: number;
  additionalTax: number;
  serviceCharge: number;
  /** Whole-rupee discount actually applied (never more than subtotal + charges). */
  discount: number;
  total: number;
};

/** Same ceilings the server enforces (BILL_LIMITS) plus a sane cap for the extra tax. */
const MAX_GST = 28;
const MAX_SERVICE = 20;
const MAX_ADDITIONAL = 28;

export const RATE_LIMITS = { gst: MAX_GST, service: MAX_SERVICE, additional: MAX_ADDITIONAL } as const;

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, max);
}

export function normaliseRates(input: Partial<BillRates>): BillRates {
  return {
    gstPercent: clampPercent(input.gstPercent ?? 5, MAX_GST),
    additionalTaxPercent: clampPercent(input.additionalTaxPercent ?? 0, MAX_ADDITIONAL),
    serviceChargePercent: clampPercent(input.serviceChargePercent ?? 0, MAX_SERVICE),
  };
}

export function computeBillBreakdown(
  lines: BillLineInput[],
  rates: Partial<BillRates>,
  discountRupees = 0
): BillBreakdown {
  const r = normaliseRates(rates);
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.priceRupees, 0);
  const pct = (p: number) => Math.round((subtotal * p) / 100);

  const gst = pct(r.gstPercent);
  const additionalTax = pct(r.additionalTaxPercent);
  const serviceCharge = pct(r.serviceChargePercent);

  const gross = subtotal + gst + additionalTax + serviceCharge;
  const discount = Math.min(
    Math.max(0, Number.isFinite(discountRupees) ? Math.round(discountRupees) : 0),
    gross
  );

  return {
    subtotal,
    gst,
    additionalTax,
    serviceCharge,
    discount,
    total: gross - discount,
  };
}
