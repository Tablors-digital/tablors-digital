import "server-only";

import { randomUUID } from "node:crypto";

import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { getDoc, listDocs, putDoc } from "@/server/modules/data/documents";
import { DEFAULT_FEEDBACK_LANGUAGE, type FeedbackLanguage } from "@/server/modules/feedback/i18n";

/**
 * Customer feedback, persisted in PostgreSQL (one document per order, keyed
 * by orderId, so an order can never receive feedback twice). Feedback is always tied to a
 * real orderId — never a table alone — so it can never be associated
 * with the wrong dining session.
 */

export type Feedback = {
  id: string;
  orderId: string;
  tableId: string;
  foodRating: number;
  serviceRating: number;
  orderingRating: number;
  comment: string | null;
  submittedAt: number;
  /** Language the customer used to answer. Older records have none (English). */
  language?: FeedbackLanguage;
  /**
   * On-device feedback (1–10 scale). Absent on feedback from the post-payment
   * 1–5 form. The 1–5 fields above are always filled (device ratings are
   * mapped onto them) so the owner dashboard keeps working unchanged.
   */
  deviceRatings?: DeviceRatings;
};

export type DeviceRatings = {
  /** "How would you rate our restaurant?" 1–10 */
  overall: number;
  /** "How was the food taste?" 1–10 */
  foodTaste: number;
  /** "How easy was the ordering device to use?" 1–10 */
  deviceUsability: number;
  /** Per-dish review, 1–10, for items on the order. */
  items: { itemId: string; code: string; name: string; rating: number }[];
};

const COLLECTION = "feedback";

export async function listFeedback(): Promise<Feedback[]> {
  const docs = await listDocs<Feedback>(DEMO_RESTAURANT_ID, COLLECTION);
  return docs.map((d) => d.data);
}

export async function getFeedbackByOrderId(orderId: string): Promise<Feedback | null> {
  return getDoc<Feedback>(DEMO_RESTAURANT_ID, COLLECTION, orderId);
}

export async function submitFeedback(input: {
  orderId: string;
  tableId: string;
  foodRating: number;
  serviceRating: number;
  orderingRating: number;
  comment: string | null;
  deviceRatings?: DeviceRatings;
  language?: FeedbackLanguage;
}): Promise<Feedback> {
  const entry: Feedback = {
    id: `f_${randomUUID()}`,
    orderId: input.orderId,
    tableId: input.tableId,
    foodRating: input.foodRating,
    serviceRating: input.serviceRating,
    orderingRating: input.orderingRating,
    comment: input.comment,
    submittedAt: Date.now(),
    language: input.language ?? DEFAULT_FEEDBACK_LANGUAGE,
    ...(input.deviceRatings ? { deviceRatings: input.deviceRatings } : {}),
  };
  await putDoc(DEMO_RESTAURANT_ID, COLLECTION, input.orderId, entry);
  return entry;
}
