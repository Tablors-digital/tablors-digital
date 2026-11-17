"use server";

import { revalidatePath } from "next/cache";

import { DEMO_RESTAURANT_ID, requirePermission } from "@/server/modules/auth/session";
import { getMenuDb } from "@/server/modules/data/menu-db";
import { notify } from "@/server/modules/notifications/store";
import {
  createOffer,
  deleteOffer,
  getOfferById,
  getOffers,
  setOfferActive,
  updateOffer,
} from "@/server/modules/offers/store";
import { getEffectivePrice } from "@/lib/menu-shared";
import {
  OFFER_NAME_MAX,
  getOfferStatus,
  normaliseOfferDraft,
  validateOfferDraft,
  type OfferDraft,
  type OfferTargetType,
  type OfferType,
} from "@/lib/offers-shared";

export type OfferActionResult = {
  ok: boolean;
  message: string;
  offerId?: string;
};

// ---- form parsing -------------------------------------------------------

function parseNullableNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** Accepts epoch milliseconds (what the owner form sends) or a date string. */
function parseTimestamp(value: FormDataEntryValue | null): number {
  if (value === null) return Number.NaN;
  const text = String(value).trim();
  if (!text) return Number.NaN;
  if (/^\d{10,}$/.test(text)) return Number(text);
  return Date.parse(text);
}

function parseFormData(formData: FormData): OfferDraft {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    type: String(formData.get("type") ?? "") as OfferType,
    targetType: String(formData.get("targetType") ?? "") as OfferTargetType,
    targetItemId: String(formData.get("targetItemId") ?? "").trim() || null,
    targetCategory: String(formData.get("targetCategory") ?? "").trim() || null,
    fixedPriceRupees: parseNullableNumber(formData.get("fixedPriceRupees")),
    percentagePercent: parseNullableNumber(formData.get("percentagePercent")),
    fixedDiscountRupees: parseNullableNumber(formData.get("fixedDiscountRupees")),
    buyQuantity: parseNullableNumber(formData.get("buyQuantity")),
    freeQuantity: parseNullableNumber(formData.get("freeQuantity")),
    minimumOrderRupees: parseNullableNumber(formData.get("minimumOrderRupees")),
    startsAt: parseTimestamp(formData.get("startsAt")),
    endsAt: parseTimestamp(formData.get("endsAt")),
    active: String(formData.get("active")) !== "false",
  };
}

// ---- validation against the live menu -------------------------------------

async function validateAgainstMenu(
  draft: OfferDraft,
  requireFutureEnd: boolean,
): Promise<string | null> {
  const menu = (await getMenuDb(DEMO_RESTAURANT_ID)).filter((m) => m.archivedAt === null);

  return validateOfferDraft(draft, {
    now: Date.now(),
    requireFutureEnd,
    itemPriceRupees: (id) => {
      const item = menu.find((m) => m.id === id);
      return item ? getEffectivePrice(item) : null;
    },
    categoryMinPriceRupees: (category) => {
      const prices = menu
        .filter((m) => m.category === category)
        .map((m) => getEffectivePrice(m));
      return prices.length > 0 ? Math.min(...prices) : null;
    },
  });
}

/** Same name (ignoring case/spacing) as another offer that has not expired. */
async function nameClash(name: string, exceptId: string | null): Promise<boolean> {
  const wanted = name.trim().replace(/\s+/g, " ").toLowerCase();
  const now = Date.now();
  return (await getOffers()).some(
    (o) =>
      o.id !== exceptId &&
      o.name.trim().replace(/\s+/g, " ").toLowerCase() === wanted &&
      getOfferStatus(o, now) !== "expired",
  );
}

function revalidateOfferSurfaces(): void {
  revalidatePath("/owner/offers");
  revalidatePath("/customer", "layout");
}

// ---- create ---------------------------------------------------------------

export async function createOfferAction(
  formData: FormData,
): Promise<OfferActionResult> {
  await requirePermission("offers");

  const draft = normaliseOfferDraft(parseFormData(formData));

  const problem = await validateAgainstMenu(draft, true);
  if (problem) return { ok: false, message: problem };

  if (await nameClash(draft.name, null)) {
    return { ok: false, message: "An offer with this name already exists. Choose a different name or edit that offer." };
  }

  const created = await createOffer(draft);

  try {
    // dedupeKey = offer id, so one offer can never raise two notifications.
    await notify({
      type: "OFFER_CREATED",
      title: "New offer created",
      message: `Offer "${created.name}" was created.`,
      dedupeKey: `offer:${created.id}`,
    });
  } catch (error) {
    console.error("Offer notification failed", created.id, error);
  }

  revalidateOfferSurfaces();

  return { ok: true, message: "Offer created successfully.", offerId: created.id };
}

// ---- update ---------------------------------------------------------------

export async function updateOfferAction(
  id: string,
  formData: FormData,
): Promise<OfferActionResult> {
  await requirePermission("offers");

  const existing = await getOfferById(id);
  if (!existing) return { ok: false, message: "Offer not found." };

  const draft = normaliseOfferDraft(parseFormData(formData));

  // Only demand a future end time when the dates were actually changed, so a
  // typo fix on an expired offer is still possible.
  const datesChanged =
    draft.startsAt !== existing.startsAt || draft.endsAt !== existing.endsAt;

  const problem = await validateAgainstMenu(draft, datesChanged);
  if (problem) return { ok: false, message: problem };

  if (await nameClash(draft.name, id)) {
    return { ok: false, message: "Another offer already uses this name." };
  }

  const updated = await updateOffer(id, draft);
  if (!updated) return { ok: false, message: "Offer not found." };

  revalidateOfferSurfaces();

  return { ok: true, message: "Offer updated successfully.", offerId: id };
}

// ---- delete ---------------------------------------------------------------

export async function deleteOfferAction(id: string): Promise<OfferActionResult> {
  await requirePermission("offers");

  const deleted = await deleteOffer(id);
  if (!deleted) return { ok: false, message: "Offer not found." };

  revalidateOfferSurfaces();

  return { ok: true, message: "Offer deleted." };
}

// ---- activate / deactivate --------------------------------------------------

export async function toggleOfferAction(
  id: string,
  active: boolean,
): Promise<OfferActionResult> {
  await requirePermission("offers");

  const existing = await getOfferById(id);
  if (!existing) return { ok: false, message: "Offer not found." };

  if (active && existing.endsAt <= Date.now()) {
    return {
      ok: false,
      message: "This offer has expired. Edit its end date to run it again.",
    };
  }

  const offer = await setOfferActive(id, active);
  if (!offer) return { ok: false, message: "Offer not found." };

  revalidateOfferSurfaces();

  return {
    ok: true,
    message: active ? "Offer activated." : "Offer paused.",
    offerId: id,
  };
}

// ---- duplicate --------------------------------------------------------------

function copyName(base: string, taken: Set<string>): string {
  const clean = base.trim().replace(/\s+/g, " ");
  const stem = clean.replace(/ \(Copy(?: \d+)?\)$/, "");
  for (let n = 1; n < 1000; n += 1) {
    const suffix = n === 1 ? " (Copy)" : ` (Copy ${n})`;
    const candidate = `${stem.slice(0, Math.max(1, OFFER_NAME_MAX - suffix.length))}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem.slice(0, OFFER_NAME_MAX - 8)} (Copy)`;
}

/**
 * Copies an offer as a paused draft with a unique name. A copy of an offer
 * that is expired starts now and keeps the original length, so it is ready
 * to edit and switch on.
 */
export async function duplicateOfferAction(id: string): Promise<OfferActionResult> {
  await requirePermission("offers");

  const source = await getOfferById(id);
  if (!source) return { ok: false, message: "Offer not found." };

  const all = await getOffers();
  const taken = new Set(all.map((o) => o.name.trim().replace(/\s+/g, " ").toLowerCase()));

  const now = Date.now();
  const length = Math.max(60 * 60 * 1000, source.endsAt - source.startsAt);
  const keepDates = source.endsAt > now;

  const created = await createOffer({
    name: copyName(source.name, taken),
    description: source.description,
    type: source.type,
    fixedPriceRupees: source.fixedPriceRupees,
    percentagePercent: source.percentagePercent,
    fixedDiscountRupees: source.fixedDiscountRupees,
    buyQuantity: source.buyQuantity,
    freeQuantity: source.freeQuantity,
    targetType: source.targetType,
    targetItemId: source.targetItemId,
    targetCategory: source.targetCategory,
    minimumOrderRupees: source.minimumOrderRupees,
    startsAt: keepDates ? source.startsAt : now,
    endsAt: keepDates ? source.endsAt : now + length,
    active: false,
  });

  revalidateOfferSurfaces();

  return {
    ok: true,
    message: `Offer duplicated as "${created.name}". It is paused — edit it and activate when ready.`,
    offerId: created.id,
  };
}
