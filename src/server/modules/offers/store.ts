import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { appDocuments } from "@/server/db/schema";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import {
  deleteDoc,
  getDoc,
  listDocs,
  putDoc,
} from "@/server/modules/data/documents";
import {
  getOfferStatus,
  type AppliedOffer,
  type Offer,
} from "@/lib/offers-shared";

// The types live in a client-safe module; they are re-exported here so every
// existing `import { Offer } from "@/server/modules/offers/store"` keeps working.
export type {
  Offer,
  OfferType,
  OfferTargetType,
  OfferStatus,
} from "@/lib/offers-shared";

const COLLECTION = "offers";
const BILL_OFFERS_COLLECTION = "bill_offers";
const RID = DEMO_RESTAURANT_ID;

/** Anything that can run drizzle selects/inserts: `db` or a transaction. */
type Exec = Pick<typeof db, "select" | "insert">;

/** Offers saved before "fixed discount" existed have no such field. */
function normalise(raw: Offer): Offer {
  return { ...raw, fixedDiscountRupees: raw.fixedDiscountRupees ?? null };
}

export async function getOffers(): Promise<Offer[]> {
  return (await listDocs<Offer>(RID, COLLECTION)).map((d) => normalise(d.data));
}

export async function getOfferById(id: string): Promise<Offer | null> {
  const offer = await getDoc<Offer>(RID, COLLECTION, id);
  return offer ? normalise(offer) : null;
}

export async function getActiveOffers(now = Date.now()): Promise<Offer[]> {
  return (await getOffers()).filter((offer) => getOfferStatus(offer, now) === "active");
}

export type CreateOfferInput = Omit<Offer, "id" | "createdAt" | "updatedAt">;

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const now = Date.now();
  const offer: Offer = {
    ...input,
    id: `offer-${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  await putDoc(RID, COLLECTION, offer.id, offer);
  return offer;
}

export type UpdateOfferInput = Partial<CreateOfferInput>;

export async function updateOffer(
  id: string,
  input: UpdateOfferInput,
): Promise<Offer | null> {
  const offer = await getOfferById(id);
  if (!offer) return null;
  const updated: Offer = { ...offer, ...input, updatedAt: Date.now() };
  await putDoc(RID, COLLECTION, id, updated);
  return updated;
}

export async function deleteOffer(id: string): Promise<boolean> {
  return deleteDoc(RID, COLLECTION, id);
}

export async function setOfferActive(
  id: string,
  active: boolean,
): Promise<Offer | null> {
  return updateOffer(id, { active });
}

export async function getActiveOfferCount(): Promise<number> {
  return (await getActiveOffers()).length;
}

// ---- offers applied to bills ---------------------------------------------

/**
 * One record per bill that was checked out through the customer device:
 * which offers were applied and what they took off. It is what "Offers
 * used" counts, what the bill popup lists, and how an unpaid bill's offer
 * discount is kept in step when more items are added.
 */
export type BillOffersRecord = {
  billId: string;
  orderId: string;
  applied: AppliedOffer[];
  totalRupees: number;
  at: number;
};

/** Live offers, read through `exec` so billing can use its own transaction. */
export async function loadOffersExec(exec: Exec): Promise<Offer[]> {
  const rows = await exec
    .select({ data: appDocuments.data })
    .from(appDocuments)
    .where(
      and(
        eq(appDocuments.restaurantId, RID),
        eq(appDocuments.collection, COLLECTION),
      ),
    );
  return rows.map((r) => normalise(r.data as Offer));
}

export async function readBillOffers(
  exec: Exec,
  billId: string,
): Promise<BillOffersRecord | null> {
  const [row] = await exec
    .select({ data: appDocuments.data })
    .from(appDocuments)
    .where(
      and(
        eq(appDocuments.restaurantId, RID),
        eq(appDocuments.collection, BILL_OFFERS_COLLECTION),
        eq(appDocuments.id, billId),
      ),
    );
  return row ? (row.data as BillOffersRecord) : null;
}

export async function writeBillOffers(
  exec: Exec,
  record: BillOffersRecord,
): Promise<void> {
  await exec
    .insert(appDocuments)
    .values({
      restaurantId: RID,
      collection: BILL_OFFERS_COLLECTION,
      id: record.billId,
      data: record as object,
    })
    .onConflictDoUpdate({
      target: [appDocuments.restaurantId, appDocuments.collection, appDocuments.id],
      set: { data: record as object, updatedAt: new Date() },
    });
}

/** How many bills each (still existing) offer has been applied to. */
export async function getOfferUsage(): Promise<Record<string, number>> {
  const records = (await listDocs<BillOffersRecord>(RID, BILL_OFFERS_COLLECTION)).map(
    (d) => d.data,
  );
  const usage: Record<string, number> = {};
  for (const record of records) {
    for (const applied of record.applied ?? []) {
      usage[applied.offerId] = (usage[applied.offerId] ?? 0) + 1;
    }
  }
  return usage;
}
