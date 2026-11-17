import { describe, expect, it } from "vitest";

import {
  computeOfferDiscounts,
  getOfferStatus,
  normaliseOfferDraft,
  offerValueLabel,
  validateOfferDraft,
  type Offer,
  type OfferDraft,
} from "@/lib/offers-shared";

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const HOUR = 3_600_000;

function offer(over: Partial<Offer>): Offer {
  return {
    id: "o1",
    name: "Test offer",
    description: "",
    type: "percentage",
    fixedPriceRupees: null,
    percentagePercent: null,
    fixedDiscountRupees: null,
    buyQuantity: null,
    freeQuantity: null,
    targetType: "item",
    targetItemId: "biryani",
    targetCategory: null,
    minimumOrderRupees: null,
    startsAt: NOW - HOUR,
    endsAt: NOW + HOUR,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

const lines = [
  { itemId: "biryani", category: "Mains", qty: 3, priceRupees: 200 },
  { itemId: "lassi", category: "Drinks", qty: 2, priceRupees: 80 },
];

describe("getOfferStatus", () => {
  it("is decided by the dates first, then the switch", () => {
    expect(getOfferStatus(offer({}), NOW)).toBe("active");
    expect(getOfferStatus(offer({ startsAt: NOW + HOUR, endsAt: NOW + 2 * HOUR }), NOW)).toBe("scheduled");
    expect(getOfferStatus(offer({ startsAt: NOW - 2 * HOUR, endsAt: NOW - HOUR }), NOW)).toBe("expired");
    expect(getOfferStatus(offer({ active: false }), NOW)).toBe("paused");
    // past its end date wins over the switch
    expect(getOfferStatus(offer({ active: false, endsAt: NOW - 1 }), NOW)).toBe("expired");
    // the end time itself is already expired, the start time itself is already live
    expect(getOfferStatus(offer({ endsAt: NOW }), NOW)).toBe("expired");
    expect(getOfferStatus(offer({ startsAt: NOW }), NOW)).toBe("active");
  });
});

describe("computeOfferDiscounts", () => {
  it("percentage on an item", () => {
    const r = computeOfferDiscounts(lines, [offer({ type: "percentage", percentagePercent: 10 })], NOW);
    expect(r.totalRupees).toBe(60);
    expect(r.applied).toEqual([{ offerId: "o1", name: "Test offer", discountRupees: 60 }]);
  });

  it("fixed price lowers each unit and never raises a price", () => {
    expect(computeOfferDiscounts(lines, [offer({ type: "fixed_price", fixedPriceRupees: 150 })], NOW).totalRupees).toBe(150);
    expect(computeOfferDiscounts(lines, [offer({ type: "fixed_price", fixedPriceRupees: 999 })], NOW).totalRupees).toBe(0);
  });

  it("fixed discount is per unit for items and capped at the unit price", () => {
    expect(computeOfferDiscounts(lines, [offer({ type: "fixed_discount", fixedDiscountRupees: 25 })], NOW).totalRupees).toBe(75);
    expect(computeOfferDiscounts(lines, [offer({ type: "fixed_discount", fixedDiscountRupees: 500 })], NOW).totalRupees).toBe(600);
  });

  it("buy X get Y gives whole groups free", () => {
    const bxgy = offer({ type: "buy_x_get_y", buyQuantity: 2, freeQuantity: 1 });
    expect(computeOfferDiscounts(lines, [bxgy], NOW).totalRupees).toBe(200); // 3 = one group
    const two = [{ itemId: "biryani", category: "Mains", qty: 2, priceRupees: 200 }];
    expect(computeOfferDiscounts(two, [bxgy], NOW).totalRupees).toBe(0);
    const six = [{ itemId: "biryani", category: "Mains", qty: 6, priceRupees: 200 }];
    expect(computeOfferDiscounts(six, [bxgy], NOW).totalRupees).toBe(400);
  });

  it("category offers match the order line category", () => {
    const r = computeOfferDiscounts(
      lines,
      [offer({ targetType: "category", targetItemId: null, targetCategory: "Drinks", type: "percentage", percentagePercent: 50 })],
      NOW,
    );
    expect(r.totalRupees).toBe(80);
  });

  it("order offers respect the minimum order and apply to what is left", () => {
    const order = offer({
      id: "o2",
      targetType: "order",
      targetItemId: null,
      type: "percentage",
      percentagePercent: 10,
      minimumOrderRupees: 700,
    });
    expect(computeOfferDiscounts(lines, [order], NOW).totalRupees).toBe(76); // 10% of 760
    expect(computeOfferDiscounts(lines, [{ ...order, minimumOrderRupees: 800 }], NOW).totalRupees).toBe(0);

    const both = computeOfferDiscounts(lines, [offer({ type: "percentage", percentagePercent: 10 }), order], NOW);
    expect(both.totalRupees).toBe(60 + 70); // 10% of the remaining 700
  });

  it("a minimum order also gates item offers", () => {
    const gated = offer({ type: "percentage", percentagePercent: 10, minimumOrderRupees: 1000 });
    expect(computeOfferDiscounts(lines, [gated], NOW).totalRupees).toBe(0);
  });

  it("uses only one item offer per line (the best) so offers never stack", () => {
    const a = offer({ id: "a", type: "percentage", percentagePercent: 10 });
    const b = offer({ id: "b", type: "percentage", percentagePercent: 25, createdAt: 2 });
    const r = computeOfferDiscounts(lines, [a, b], NOW);
    expect(r.totalRupees).toBe(150);
    expect(r.applied.map((x) => x.offerId)).toEqual(["b"]);
  });

  it("ignores paused, scheduled and expired offers", () => {
    const base = { type: "percentage", percentagePercent: 50 } as const;
    expect(computeOfferDiscounts(lines, [offer({ ...base, active: false })], NOW).totalRupees).toBe(0);
    expect(computeOfferDiscounts(lines, [offer({ ...base, startsAt: NOW + HOUR, endsAt: NOW + 2 * HOUR })], NOW).totalRupees).toBe(0);
    expect(computeOfferDiscounts(lines, [offer({ ...base, endsAt: NOW - 1 })], NOW).totalRupees).toBe(0);
  });

  it("never discounts more than the subtotal", () => {
    const r = computeOfferDiscounts(lines, [offer({ type: "percentage", percentagePercent: 100 })], NOW);
    expect(r.totalRupees).toBeLessThanOrEqual(760);
    expect(computeOfferDiscounts([], [offer({})], NOW).totalRupees).toBe(0);
  });
});

describe("validateOfferDraft", () => {
  const draft: OfferDraft = {
    name: "Lunch deal",
    description: "",
    type: "percentage",
    targetType: "item",
    targetItemId: "biryani",
    targetCategory: null,
    fixedPriceRupees: null,
    percentagePercent: 10,
    fixedDiscountRupees: null,
    buyQuantity: null,
    freeQuantity: null,
    minimumOrderRupees: null,
    startsAt: NOW,
    endsAt: NOW + 24 * HOUR,
    active: true,
  };
  const ctx = {
    now: NOW,
    requireFutureEnd: true,
    itemPriceRupees: (id: string) => (id === "biryani" ? 200 : null),
    categoryMinPriceRupees: (c: string) => (c === "Mains" ? 120 : null),
  };

  it("accepts a good offer", () => {
    expect(validateOfferDraft(draft, ctx)).toBeNull();
  });

  it("checks dates", () => {
    expect(validateOfferDraft({ ...draft, endsAt: draft.startsAt }, ctx)).toMatch(/after the start/);
    expect(validateOfferDraft({ ...draft, startsAt: NOW - 3 * HOUR, endsAt: NOW - HOUR }, ctx)).toMatch(/future/);
    expect(validateOfferDraft({ ...draft, startsAt: NOW - 3 * HOUR, endsAt: NOW - HOUR }, { ...ctx, requireFutureEnd: false })).toBeNull();
    expect(validateOfferDraft({ ...draft, startsAt: Number.NaN }, ctx)).toMatch(/start/);
  });

  it("checks percentage, price and discount values", () => {
    expect(validateOfferDraft({ ...draft, percentagePercent: 0 }, ctx)).toMatch(/at least 1/);
    expect(validateOfferDraft({ ...draft, percentagePercent: 101 }, ctx)).toMatch(/more than 100/);
    expect(validateOfferDraft({ ...draft, percentagePercent: 12.5 }, ctx)).toMatch(/whole number/);
    expect(validateOfferDraft({ ...draft, percentagePercent: null }, ctx)).toMatch(/percentage/i);

    const fp = { ...draft, type: "fixed_price" as const, percentagePercent: null };
    expect(validateOfferDraft({ ...fp, fixedPriceRupees: 150 }, ctx)).toBeNull();
    expect(validateOfferDraft({ ...fp, fixedPriceRupees: 200 }, ctx)).toMatch(/lower than the current price/);
    expect(validateOfferDraft({ ...fp, fixedPriceRupees: -1 }, ctx)).toMatch(/negative/);
    expect(validateOfferDraft({ ...fp, fixedPriceRupees: null }, ctx)).toMatch(/promotional price/i);

    const fd = { ...draft, type: "fixed_discount" as const, percentagePercent: null };
    expect(validateOfferDraft({ ...fd, fixedDiscountRupees: 50 }, ctx)).toBeNull();
    expect(validateOfferDraft({ ...fd, fixedDiscountRupees: 0 }, ctx)).toMatch(/at least/);
    expect(validateOfferDraft({ ...fd, fixedDiscountRupees: 200 }, ctx)).toMatch(/lower than the item price/);
  });

  it("checks Buy X Get Y and the targets", () => {
    const b = { ...draft, type: "buy_x_get_y" as const, percentagePercent: null };
    expect(validateOfferDraft({ ...b, buyQuantity: 2, freeQuantity: 1 }, ctx)).toBeNull();
    expect(validateOfferDraft({ ...b, buyQuantity: 2, freeQuantity: null }, ctx)).toMatch(/both/);
    expect(validateOfferDraft({ ...b, buyQuantity: 0, freeQuantity: 1 }, ctx)).toMatch(/at least 1/);
    expect(validateOfferDraft({ ...b, buyQuantity: 2, freeQuantity: 1, targetType: "order", minimumOrderRupees: 100 }, ctx)).toMatch(/item or category/);

    expect(validateOfferDraft({ ...draft, targetItemId: null }, ctx)).toMatch(/Select a menu item/);
    expect(validateOfferDraft({ ...draft, targetItemId: "ghost" }, ctx)).toMatch(/not found/);
    expect(validateOfferDraft({ ...draft, targetType: "category", targetItemId: null, targetCategory: "Ghost" }, ctx)).toMatch(/not found/);
    expect(validateOfferDraft({ ...draft, targetType: "order", targetItemId: null }, ctx)).toMatch(/minimum order/i);
    expect(validateOfferDraft({ ...draft, targetType: "order", targetItemId: null, minimumOrderRupees: 500 }, ctx)).toBeNull();
  });

  it("drops fields the chosen type does not use", () => {
    const n = normaliseOfferDraft({ ...draft, fixedPriceRupees: 99, buyQuantity: 3, targetType: "order", minimumOrderRupees: 300 });
    expect(n.fixedPriceRupees).toBeNull();
    expect(n.buyQuantity).toBeNull();
    expect(n.targetItemId).toBeNull();
    expect(n.percentagePercent).toBe(10);
  });
});

describe("offerValueLabel", () => {
  it("words every type", () => {
    const base = offer({});
    expect(offerValueLabel({ ...base, type: "fixed_price", fixedPriceRupees: 199 })).toBe("₹199");
    expect(offerValueLabel({ ...base, type: "percentage", percentagePercent: 20 })).toBe("20% OFF");
    expect(offerValueLabel({ ...base, type: "fixed_discount", fixedDiscountRupees: 50 })).toBe("₹50 OFF");
    expect(offerValueLabel({ ...base, type: "buy_x_get_y", buyQuantity: 2, freeQuantity: 1 })).toBe("Buy 2 Get 1");
  });
});
