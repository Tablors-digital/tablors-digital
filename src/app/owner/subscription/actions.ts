"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession } from "@/server/modules/auth/session";
import { getDevicesDb } from "@/server/modules/data/devices-db";
import { changePlan } from "@/server/modules/demo-store/subscription";

export type SubscriptionActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): SubscriptionActionResult => ({ ok: false, error });

async function authorize() {
  const session = await getDemoSession();
  return session && hasPermission(session.role, "subscription") ? session : null;
}

export async function changePlanAction(plan: unknown): Promise<SubscriptionActionResult> {
  const session = await authorize();
  if (!session) return fail("Only the owner can change the subscription.");
  const parsed = z.enum(["starter", "professional", "enterprise"]).safeParse(plan);
  if (!parsed.success) return fail("Invalid plan.");

  const error = await changePlan(
    session.restaurantId,
    parsed.data,
    (await getDevicesDb(session.restaurantId)).length,
  );
  if (error) return fail(error);
  revalidatePath("/owner/subscription");
  return { ok: true };
}

/**
 * Subscription renewal and device purchases are intentionally not simulated.
 * This project has no subscription payment-provider integration yet. Returning
 * an explicit error prevents demo code from recording a successful payment.
 */
export async function renewAction(): Promise<SubscriptionActionResult> {
  const session = await authorize();
  if (!session) return fail("Only the owner can renew.");
  return fail("Subscription payments are not configured. No payment has been made.");
}

export async function addDevicesAction(_count: unknown): Promise<SubscriptionActionResult> {
  const session = await authorize();
  if (!session) return fail("Only the owner can add devices.");
  return fail("Device purchases are not configured. No devices have been added and no payment has been made.");
}
