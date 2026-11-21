"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession } from "@/server/modules/auth/session";
import { getDevicesDb } from "@/server/modules/data/devices-db";
import {
  addExtraDevices,
  changePlan,
  renewSubscription,
} from "@/server/modules/demo-store/subscription";

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

export async function renewAction(): Promise<SubscriptionActionResult> {
  const session = await authorize();
  if (!session) return fail("Only the owner can renew.");
  await renewSubscription(session.restaurantId);
  revalidatePath("/owner/subscription");
  return { ok: true };
}

export async function addDevicesAction(count: unknown): Promise<SubscriptionActionResult> {
  const session = await authorize();
  if (!session) return fail("Only the owner can add devices.");
  const parsed = z.coerce.number().int().min(1, "Add at least 1 device.").max(100, "Maximum 100 devices at once.").safeParse(count);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid device count.");
  await addExtraDevices(session.restaurantId, parsed.data);
  revalidatePath("/owner/subscription");
  return { ok: true };
}