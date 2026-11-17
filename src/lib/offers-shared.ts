/**
 * Pure, dependency-free offer helpers shared by the Owner UI (client), the
 * server actions, the customer device snapshot and the billing module.
 *
 * The client uses validation only for instant feedback — the server ALWAYS
 * re-runs it against the authoritative menu before any write. The discount
 * calculation here is the single implementation used by both the on-device
 * provisional bill and the bill that is finally issued, so they never differ.
 */

// ---- Types ------------------------------------------------------------

export type OfferType =
  | "fixed_price"
  | "percentage"
  | "fixed_discount"
  | "buy_x_get_y";

export type OfferTargetType = "item" | "category" | "order";

export type Offer = {
  id: string;
  name: string;
  description: string;

  type: OfferType;

  /** fixed_price: the target item/category unit price becomes this. */
  fixedPriceRupees: number | null;
  /** percentage: percent taken off the eligible amount. */
  percentagePercent: number | null;
  /** fixed_discount: rupees taken off (per unit for item/category, once for the order). */
  fixedDiscountRupees: number | null;

  /** buy_x_get_y: buy buyQuantity, get freeQuantity free. */
  buyQuantity: number | null;
  freeQuantity: number | null;

  targetType: OfferTargetType;
  /** targetType = item: menu item id. */
  targetItemId: string | null;
  /** targetType = category: exact menu category. */
  targetCategory: string | null;

  /** Order subtotal needed before the offer applies (required for targetType = order). */
  minimumOrderRupees: number | null;

  startsAt: number;
  endsAt: number;

  /** Manual on/off switch. Dates still decide scheduled / active / expired. */
  active: boolean;

  createdAt: number;
  updatedAt: number;
};

export type OfferStatus = "active" | "scheduled" | "expired" | "paused";

export const OFFER_TYPES: { value: OfferType; label: string; hint: string }[] = [
  { value: "fixed_price", label: "Fixed promotional price", hint: "The item sells at a set price." },
  { value: "percentage", label: "Percentage discount", hint: "A percentage is taken off." },
  { value: "fixed_discount", label: "Fixed amount discount", hint: "A set ₹ amount is taken off." },
  { value: "buy_x_get_y", label: "Buy X Get Y", hint: "Buy some, get some free." },
];

export const OFFER_NAME_MAX = 80;
export const OFFER_DESCRIPTION_MAX = 240;
export const OFFER_MAX_RUPEES = 100_000;
export const OFFER_MAX_QTY = 100;

// ---- Status -------------------------------------------------------------

/**
 * Status comes from the dates first: an offer past its end time is expired
 * whatever its switch says. A switched-off offer is "paused". Otherwise the
 * start time decides between scheduled and active.
 */
export function getOfferStatus(
  offer: Pick<Offer, "active" | "startsAt" | "endsAt">,
  now: number,
): OfferStatus {
  if (offer.endsAt <= now) return "expired";
  if (!offer.active) return "paused";
  if (offer.startsAt > now) return "scheduled";
  return "active";
}

export function isOfferLive(
  offer: Pick<Offer, "active" | "startsAt" | "endsAt">,
  now: number,
): boolean {
  return getOfferStatus(offer, now) === "active";
}

// ---- Labels -------------------------------------------------------------

export function offerTypeLabel(type: string): string {
  switch (type) {
    case "fixed_price":
      return "Fixed price";
    case "percentage":
      return "Percentage";
    case "fixed_discount":
      return "Fixed discount";
    case "buy_x_get_y":
      return "Buy X Get Y";
    default:
      return type;
  }
}

/** Short headline value, e.g. "20% OFF", "₹50 OFF", "₹199", "Buy 2 Get 1". */
export function offerValueLabel(
  offer: Pick<
    Offer,
    "type" | "fixedPriceRupees" | "percentagePercent" | "fixedDiscountRupees" | "buyQuantity" | "freeQuantity"
  >,
): string {
  switch (offer.type) {
    case "fixed_price":
      return `₹${offer.fixedPriceRupees ?? 0}`;
    case "percentage":
      return `${offer.percentagePercent ?? 0}% OFF`;
    case "fixed_discount":
      return `₹${offer.fixedDiscountRupees ?? 0} OFF`;
    case "buy_x_get_y":
      return `Buy ${offer.buyQuantity ?? 0} Get ${offer.freeQuantity ?? 0}`;
    default:
      return "";
  }
}

// ---- Validation ---------------------------------------------------------

export type OfferDraft = {
  name: string;
  description: string;
  type: OfferType;
  targetType: OfferTargetType;
  targetItemId: string | null;
  targetCategory: string | null;
  fixedPriceRupees: number | null;
  percentagePercent: number | null;
  fixedDiscountRupees: number | null;
  buyQuantity: number | null;
  freeQuantity: number | null;
  minimumOrderRupees: number | null;
  startsAt: number;
  endsAt: number;
  active: boolean;
};

/**
 * Clears every field the chosen type / target does not use, so a value typed
 * before switching the type can never be stored or applied.
 */
export function normaliseOfferDraft(d: OfferDraft): OfferDraft {
  const out: OfferDraft = { ...d, name: d.name.trim(), description: d.description.trim() };

  if (out.type !== "fixed_price") out.fixedPriceRupees = null;
  if (out.type !== "percentage") out.percentagePercent = null;
  if (out.type !== "fixed_discount") out.fixedDiscountRupees = null;
  if (out.type !== "buy_x_get_y") {
    out.buyQuantity = null;
    out.freeQuantity = null;
  }

  // Fixed price and Buy X Get Y only make sense for items / categories.
  if (out.targetType !== "item") out.targetItemId = null;
  if (out.targetType !== "category") out.targetCategory = null;
  if (out.targetType !== "order" && out.minimumOrderRupees === 0) out.minimumOrderRupees = null;

  return out;
}

export type OfferValidationContext = {
  /** Current customer-facing unit price of a menu item, or null if it does not exist. */
  itemPriceRupees: (itemId: string) => number | null;
  /** Lowest customer-facing price among a category's items, or null if the category has none. */
  categoryMinPriceRupees: (category: string) => number | null;
  now: number;
  /** When true, the end time must be in the future (create / date changes). */
  requireFutureEnd: boolean;
};

function isWhole(n: number | null): n is number {
  return n !== null && Number.isFinite(n) && Number.isInteger(n);
}

/** Returns the first problem as a readable sentence, or null when the offer is valid. */
export function validateOfferDraft(
  draft: OfferDraft,
  ctx: OfferValidationContext,
): string | null {
  const d = normaliseOfferDraft(draft);

  if (d.name.length < 2) return "Offer name must contain at least 2 characters.";
  if (d.name.length > OFFER_NAME_MAX) return "Offer name is too long.";
  if (d.description.length > OFFER_DESCRIPTION_MAX) return "Description is too long.";

  if (!["fixed_price", "percentage", "fixed_discount", "buy_x_get_y"].includes(d.type)) {
    return "Choose an offer type.";
  }
  if (!["item", "category", "order"].includes(d.targetType)) {
    return "Choose what the offer applies to.";
  }

  // ---- dates
  if (!Number.isFinite(d.startsAt) || d.startsAt <= 0) return "Choose a valid start date and time.";
  if (!Number.isFinite(d.endsAt) || d.endsAt <= 0) return "Choose a valid end date and time.";
  if (d.endsAt <= d.startsAt) return "Offer end time must be after the start time.";
  if (ctx.requireFutureEnd && d.endsAt <= ctx.now) return "Offer end time must be in the future.";

  // ---- target
  if (d.targetType === "item") {
    if (!d.targetItemId) return "Select a menu item.";
  }
  if (d.targetType === "category") {
    if (!d.targetCategory) return "Select a category.";
  }
  if ((d.type === "fixed_price" || d.type === "buy_x_get_y") && d.targetType === "order") {
    return d.type === "fixed_price"
      ? "Fixed-price offers must target an item or category."
      : "Buy X Get Y must target an item or category.";
  }

  const referencePrice =
    d.targetType === "item" && d.targetItemId
      ? ctx.itemPriceRupees(d.targetItemId)
      : d.targetType === "category" && d.targetCategory
        ? ctx.categoryMinPriceRupees(d.targetCategory)
        : null;

  if (d.targetType === "item" && referencePrice === null) return "Selected menu item was not found.";
  if (d.targetType === "category" && referencePrice === null) return "Selected category was not found.";

  // ---- minimum order
  if (d.minimumOrderRupees !== null) {
    if (!isWhole(d.minimumOrderRupees) || d.minimumOrderRupees < 0) {
      return "Minimum order must be a whole number of rupees, 0 or more.";
    }
    if (d.minimumOrderRupees > OFFER_MAX_RUPEES * 10) return "Minimum order is too large.";
  }
  if (d.targetType === "order" && d.minimumOrderRupees === null) {
    return "Enter a valid minimum order value.";
  }

  // ---- type specific values
  if (d.type === "fixed_price") {
    if (d.fixedPriceRupees === null) return "Enter the promotional price.";
    if (!isWhole(d.fixedPriceRupees)) return "Promotional price must be a whole number of rupees.";
    if (d.fixedPriceRupees < 0) return "Promotional price cannot be negative.";
    if (d.fixedPriceRupees > OFFER_MAX_RUPEES) return "Promotional price is too large.";
    if (referencePrice !== null && d.fixedPriceRupees >= referencePrice) {
      return d.targetType === "item"
        ? `Promotional price must be lower than the current price (₹${referencePrice}).`
        : `Promotional price must be lower than the cheapest item in the category (₹${referencePrice}).`;
    }
  }

  if (d.type === "percentage") {
    if (d.percentagePercent === null) return "Enter a percentage.";
    if (!isWhole(d.percentagePercent)) return "Percentage must be a whole number.";
    if (d.percentagePercent < 1) return "Percentage must be at least 1%.";
    if (d.percentagePercent > 100) return "Percentage cannot be more than 100%.";
  }

  if (d.type === "fixed_discount") {
    if (d.fixedDiscountRupees === null) return "Enter the discount amount.";
    if (!isWhole(d.fixedDiscountRupees)) return "Discount must be a whole number of rupees.";
    if (d.fixedDiscountRupees < 1) return "Discount must be at least ₹1.";
    if (d.fixedDiscountRupees > OFFER_MAX_RUPEES) return "Discount is too large.";
    if (referencePrice !== null && d.fixedDiscountRupees >= referencePrice) {
      return d.targetType === "item"
        ? `Discount must be lower than the item price (₹${referencePrice}).`
        : `Discount must be lower than the cheapest item in the category (₹${referencePrice}).`;
    }
    if (
      d.targetType === "order" &&
      d.minimumOrderRupees !== null &&
      d.fixedDiscountRupees >= d.minimumOrderRupees
    ) {
      return "Discount must be lower than the minimum order value.";
    }
  }

  if (d.type === "buy_x_get_y") {
    if (d.buyQuantity === null || d.freeQuantity === null) return "Enter both Buy and Get quantities.";
    if (!isWhole(d.buyQuantity) || !isWhole(d.freeQuantity)) return "Buy and Get quantities must be whole numbers.";
    if (d.buyQuantity < 1 || d.freeQuantity < 1) return "Buy and Get quantities must be at least 1.";
    if (d.buyQuantity > OFFER_MAX_QTY || d.freeQuantity > OFFER_MAX_QTY) {
      return `Buy and Get quantities cannot be more than ${OFFER_MAX_QTY}.`;
    }
  }

  return null;
}

// ---- Discount calculation -----------------------------------------------

/** A confirmed order line, as stored (prices already net of any menu-item discount). */
export type OfferLine = {
  itemId?: string | null;
  category?: string | null;
  qty: number;
  priceRupees: number;
};

export type AppliedOffer = {
  offerId: string;
  name: string;
  discountRupees: number;
};

export type OfferDiscountResult = {
  applied: AppliedOffer[];
  /** Whole-rupee total, never more than the order subtotal. */
  totalRupees: number;
};

function lineDiscountFor(offer: Offer, line: OfferLine): number {
  const gross = line.qty * line.priceRupees;
  switch (offer.type) {
    case "fixed_price": {
      const target = offer.fixedPriceRupees;
      if (target === null || target === undefined) return 0;
      return Math.round(Math.max(0, line.priceRupees - target) * line.qty);
    }
    case "percentage": {
      const pct = offer.percentagePercent;
      if (!pct || pct <= 0) return 0;
      return Math.round((gross * Math.min(pct, 100)) / 100);
    }
    case "fixed_discount": {
      const off = offer.fixedDiscountRupees;
      if (!off || off <= 0) return 0;
      return Math.round(Math.min(off, line.priceRupees) * line.qty);
    }
    case "buy_x_get_y": {
      const buy = offer.buyQuantity ?? 0;
      const free = offer.freeQuantity ?? 0;
      if (buy < 1 || free < 1) return 0;
      const groups = Math.floor(line.qty / (buy + free));
      return Math.round(groups * free * line.priceRupees);
    }
    default:
      return 0;
  }
}

function matchesLine(offer: Offer, line: OfferLine): boolean {
  if (offer.targetType === "item") return Boolean(offer.targetItemId) && offer.targetItemId === (line.itemId ?? null);
  if (offer.targetType === "category") {
    return Boolean(offer.targetCategory) && offer.targetCategory === (line.category ?? null);
  }
  return false;
}

/**
 * The offer rules, in one place:
 *  - only live offers count (switched on, between their start and end);
 *  - an offer with a minimum order applies only when the order subtotal
 *    (before any offer) reaches it;
 *  - every order line gets at most ONE item/category offer — whichever saves
 *    the customer the most — so offers never stack on the same line;
 *  - then at most one whole-order offer (percentage / fixed discount) is
 *    applied to what is left, again the best one;
 *  - the total is whole rupees and can never exceed the subtotal.
 */
export function computeOfferDiscounts(
  lines: OfferLine[],
  offers: Offer[],
  now: number,
): OfferDiscountResult {
  const usable = lines.filter(
    (l) => Number.isFinite(l.qty) && Number.isFinite(l.priceRupees) && l.qty > 0 && l.priceRupees >= 0,
  );
  const subtotal = usable.reduce((s, l) => s + l.qty * l.priceRupees, 0);
  if (subtotal <= 0) return { applied: [], totalRupees: 0 };

  const eligible = offers
    .filter((o) => isOfferLive(o, now) && (o.minimumOrderRupees ?? 0) <= subtotal)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const perOffer = new Map<string, AppliedOffer>();
  const add = (offer: Offer, amount: number) => {
    if (amount <= 0) return;
    const cur = perOffer.get(offer.id);
    if (cur) cur.discountRupees += amount;
    else perOffer.set(offer.id, { offerId: offer.id, name: offer.name, discountRupees: amount });
  };

  let lineTotal = 0;
  for (const line of usable) {
    let best: { offer: Offer; amount: number } | null = null;
    for (const offer of eligible) {
      if (!matchesLine(offer, line)) continue;
      const amount = Math.min(lineDiscountFor(offer, line), Math.round(line.qty * line.priceRupees));
      if (amount > 0 && (!best || amount > best.amount)) best = { offer, amount };
    }
    if (best) {
      add(best.offer, best.amount);
      lineTotal += best.amount;
    }
  }

  const remaining = Math.max(0, Math.round(subtotal) - lineTotal);
  let bestOrder: { offer: Offer; amount: number } | null = null;
  for (const offer of eligible) {
    if (offer.targetType !== "order") continue;
    let amount = 0;
    if (offer.type === "percentage" && offer.percentagePercent) {
      amount = Math.round((remaining * Math.min(offer.percentagePercent, 100)) / 100);
    } else if (offer.type === "fixed_discount" && offer.fixedDiscountRupees) {
      amount = Math.min(offer.fixedDiscountRupees, remaining);
    }
    if (amount > 0 && (!bestOrder || amount > bestOrder.amount)) bestOrder = { offer, amount };
  }
  if (bestOrder) add(bestOrder.offer, bestOrder.amount);

  const applied = [...perOffer.values()];
  const totalRupees = Math.min(
    applied.reduce((s, a) => s + a.discountRupees, 0),
    Math.round(subtotal),
  );
  return { applied, totalRupees };
}
