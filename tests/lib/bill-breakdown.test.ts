import { describe, expect, it } from "vitest";
import { computeBillBreakdown } from "@/lib/bill-breakdown";

describe("computeBillBreakdown", () => {
  const lines = [
    { qty: 2, priceRupees: 180 }, // 360
    { qty: 1, priceRupees: 260 }, // 260
  ];

  it("sums item totals and applies each rate to the subtotal only", () => {
    const b = computeBillBreakdown(lines, {
      gstPercent: 5,
      additionalTaxPercent: 2,
      serviceChargePercent: 10,
    });
    expect(b.subtotal).toBe(620);
    expect(b.gst).toBe(31);
    expect(b.additionalTax).toBe(12); // 12.4 -> 12
    expect(b.serviceCharge).toBe(62);
    expect(b.total).toBe(620 + 31 + 12 + 62);
  });

  it("does not compound taxes", () => {
    const b = computeBillBreakdown([{ qty: 1, priceRupees: 1000 }], {
      gstPercent: 5,
      additionalTaxPercent: 5,
      serviceChargePercent: 5,
    });
    expect(b.total).toBe(1150); // not 1157.63 (compounded)
  });

  it("defaults extra tax and service to zero", () => {
    const b = computeBillBreakdown(lines, { gstPercent: 5 });
    expect(b.additionalTax).toBe(0);
    expect(b.serviceCharge).toBe(0);
    expect(b.total).toBe(651);
  });

  it("clamps invalid rates and handles an empty cart", () => {
    expect(computeBillBreakdown([], { gstPercent: 5 }).total).toBe(0);
    const b = computeBillBreakdown(lines, { gstPercent: -4, serviceChargePercent: 999 });
    expect(b.gst).toBe(0);
    expect(b.serviceCharge).toBe(Math.round((620 * 20) / 100));
  });
});
