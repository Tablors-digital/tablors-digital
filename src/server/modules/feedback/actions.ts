"use server";

import { revalidatePath } from "next/cache";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { getBillByOrderIdDb } from "@/server/modules/billing/db-billing";
import { getOrderFromDb } from "@/server/modules/orders/db-orders";
import { getFeedbackByOrderId, submitFeedback } from "@/server/modules/feedback/store";

export type SubmitFeedbackInput = {
  orderId: string;
  tableId: string;
  foodRating: number;
  serviceRating: number;
  orderingRating: number;
  comment: string;
};

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: string };

function isValidRating(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/**
 * Feedback is only ever accepted for an order that:
 *  1) actually exists and belongs to the claimed table, and
 *  2) has a Bill that is genuinely paid (paymentMethod + paidAt set),
 *  3) does not already have feedback recorded.
 *
 * This re-checks all three server-side — never trusts the client — so
 * feedback can't be attached to an unpaid order, a mismatched table,
 * or submitted twice for the same order.
 */
export async function submitCustomerFeedback(
  input: SubmitFeedbackInput
): Promise<SubmitFeedbackResult> {
  const order = await getOrderFromDb(DEMO_RESTAURANT_ID, input.orderId);
  if (!order || order.tableId !== input.tableId) {
    return { ok: false, error: "Order not found for this table." };
  }

  const bill = await getBillByOrderIdDb(DEMO_RESTAURANT_ID, input.orderId);
  if (!bill || !bill.paymentMethod || !bill.paidAt) {
    return { ok: false, error: "This order isn't marked as paid yet." };
  }

  if (await getFeedbackByOrderId(input.orderId)) {
    return { ok: false, error: "Feedback has already been submitted for this order." };
  }

  if (
    !isValidRating(input.foodRating) ||
    !isValidRating(input.serviceRating) ||
    !isValidRating(input.orderingRating)
  ) {
    return { ok: false, error: "Please rate all three categories (1-5 stars)." };
  }

  await submitFeedback({
    orderId: input.orderId,
    tableId: input.tableId,
    foodRating: input.foodRating,
    serviceRating: input.serviceRating,
    orderingRating: input.orderingRating,
    comment: input.comment.trim() ? input.comment.trim() : null,
  });

  revalidatePath(`/customer/${input.tableId}`);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// On-device feedback (1–10 scale + per-dish reviews)
// ---------------------------------------------------------------------------

/**
 * The device feedback section is available as soon as the order is placed.
 * The post-payment form above still requires a paid bill. Flip this to true to
 * hold device feedback back until the bill is paid as well.
 */
const REQUIRE_PAID_FOR_DEVICE_FEEDBACK = false;

export type SubmitDeviceFeedbackInput = {
  orderId: string;
  tableId: string;
  overall: number;
  foodTaste: number;
  deviceUsability: number;
  /** itemId (or code) → 1–10. Only dishes the customer chose to rate. */
  itemRatings: { itemId: string; rating: number }[];
  comment?: string;
};

function isValidRating10(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10;
}

/** 1–10 → 1–5, so the existing owner dashboard (1–5) still reads this feedback. */
function toFiveScale(n: number): number {
  return Math.min(5, Math.max(1, Math.ceil(n / 2)));
}

/**
 * Saves feedback against the exact order and table. Re-checks everything on
 * the server: the order exists and belongs to the table, it has no feedback
 * yet, every rating is 1–10, and every rated dish is really on that order.
 */
export async function submitDeviceFeedback(
  input: SubmitDeviceFeedbackInput
): Promise<SubmitFeedbackResult> {
  const order = await getOrderFromDb(DEMO_RESTAURANT_ID, input.orderId);
  if (!order || order.tableId !== input.tableId) {
    return { ok: false, error: "Order not found for this table." };
  }

  if (REQUIRE_PAID_FOR_DEVICE_FEEDBACK) {
    const bill = await getBillByOrderIdDb(DEMO_RESTAURANT_ID, input.orderId);
    if (!bill || !bill.paymentMethod || !bill.paidAt) {
      return { ok: false, error: "This order isn't marked as paid yet." };
    }
  }

  if (await getFeedbackByOrderId(input.orderId)) {
    return { ok: false, error: "Feedback has already been submitted for this order." };
  }

  if (
    !isValidRating10(input.overall) ||
    !isValidRating10(input.foodTaste) ||
    !isValidRating10(input.deviceUsability)
  ) {
    return { ok: false, error: "Please rate all three questions (1–10)." };
  }

  const items: { itemId: string; code: string; name: string; rating: number }[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(input.itemRatings) ? input.itemRatings : []) {
    if (!isValidRating10(entry?.rating)) {
      return { ok: false, error: "Dish ratings must be between 1 and 10." };
    }

    const line = order.lines.find(
      (l) => (l.itemId ?? l.code) === entry.itemId || l.code === entry.itemId
    );
    if (!line) {
      return { ok: false, error: "A rated dish is not part of this order." };
    }

    const key = line.itemId ?? line.code;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ itemId: key, code: line.code, name: line.name, rating: entry.rating });
  }

  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 500) : "";

  await submitFeedback({
    orderId: input.orderId,
    tableId: input.tableId,
    foodRating: toFiveScale(input.foodTaste),
    serviceRating: toFiveScale(input.overall),
    orderingRating: toFiveScale(input.deviceUsability),
    comment: comment || null,
    deviceRatings: {
      overall: input.overall,
      foodTaste: input.foodTaste,
      deviceUsability: input.deviceUsability,
      items,
    },
  });

  revalidatePath(`/customer/${input.tableId}`);
  revalidatePath("/owner/feedback");

  return { ok: true };
}
