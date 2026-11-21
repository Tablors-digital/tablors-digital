import "server-only";

import { randomUUID } from "node:crypto";
import { getDoc, putDoc } from "@/server/modules/data/documents";

export type PlanId = "starter" | "professional" | "enterprise";

export const PLANS: Record<PlanId, { name: string; monthlyRupees: number; deviceLimit: number }> = {
  starter: { name: "Starter", monthlyRupees: 499, deviceLimit: 10 },
  professional: { name: "Professional", monthlyRupees: 999, deviceLimit: 30 },
  enterprise: { name: "Enterprise", monthlyRupees: 1999, deviceLimit: 100 },
};
export const PLAN_ORDER: PlanId[] = ["starter", "professional", "enterprise"];
export const EXTRA_DEVICE_RUPEES = 30;

export interface PaymentRecord {
  id: string;
  invoiceNo: string;
  paidAt: string;
  description: string;
  amountRupees: number;
  status: "paid" | "failed";
}

export interface Subscription {
  restaurantId: string;
  plan: PlanId;
  renewalDate: string;
  extraDevices: number;
  payments: PaymentRecord[];
}

export function monthlyRupees(sub: Pick<Subscription, "plan" | "extraDevices">): number {
  return PLANS[sub.plan].monthlyRupees + sub.extraDevices * EXTRA_DEVICE_RUPEES;
}

export function deviceLimit(sub: Pick<Subscription, "plan" | "extraDevices">): number {
  return PLANS[sub.plan].deviceLimit + sub.extraDevices;
}

const COLLECTION = "subscription";
const DOC_ID = "current";

function seed(restaurantId: string): Subscription {
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    restaurantId,
    plan: "professional",
    renewalDate: nextMonth,
    extraDevices: 0,
    payments: [],
  };
}

export async function getSubscription(restaurantId: string): Promise<Subscription> {
  const existing = await getDoc<Subscription>(restaurantId, COLLECTION, DOC_ID);
  if (existing) return existing;
  const fresh = seed(restaurantId);
  await putDoc(restaurantId, COLLECTION, DOC_ID, fresh);
  return fresh;
}

export async function changePlan(
  restaurantId: string,
  plan: PlanId,
  activeDevices: number,
): Promise<string | null> {
  const sub = await getSubscription(restaurantId);
  const limit = deviceLimit({ plan, extraDevices: sub.extraDevices });
  if (activeDevices > limit) {
    return `You have ${activeDevices} active devices, which exceeds the ${PLANS[plan].name} limit of ${limit}.`;
  }
  sub.plan = plan;
  await putDoc(restaurantId, COLLECTION, DOC_ID, sub);
  return null;
}

export async function renewSubscription(restaurantId: string): Promise<PaymentRecord> {
  const sub = await getSubscription(restaurantId);
  const planInfo = PLANS[sub.plan];
  const amountRupees = monthlyRupees(sub);
  const baseDate = Math.max(Date.now(), Date.parse(sub.renewalDate) || Date.now());
  sub.renewalDate = new Date(baseDate + 30 * 24 * 60 * 60 * 1000).toISOString();

  const record: PaymentRecord = {
    id: `sub_${randomUUID().slice(0, 8)}`,
    invoiceNo: `INV-${new Date().getFullYear()}-${String(sub.payments.length + 1).padStart(4, "0")}`,
    paidAt: new Date().toISOString(),
    description: `${planInfo.name} Plan Renewal${sub.extraDevices > 0 ? ` + ${sub.extraDevices} extra devices` : ""}`,
    amountRupees,
    status: "paid",
  };
  sub.payments = [record, ...sub.payments];
  await putDoc(restaurantId, COLLECTION, DOC_ID, sub);
  return record;
}

export async function addExtraDevices(restaurantId: string, count: number): Promise<PaymentRecord> {
  const sub = await getSubscription(restaurantId);
  const amountRupees = count * EXTRA_DEVICE_RUPEES;
  sub.extraDevices += count;

  const record: PaymentRecord = {
    id: `dev_${randomUUID().slice(0, 8)}`,
    invoiceNo: `INV-${new Date().getFullYear()}-${String(sub.payments.length + 1).padStart(4, "0")}`,
    paidAt: new Date().toISOString(),
    description: `Add ${count} extra device slot${count === 1 ? "" : "s"}`,
    amountRupees,
    status: "paid",
  };
  sub.payments = [record, ...sub.payments];
  await putDoc(restaurantId, COLLECTION, DOC_ID, sub);
  return record;
}