"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDemoSession } from "@/server/modules/auth/session";
import { getPotsPinVerified } from "@/server/modules/auth/pots-session";
import { PermissionError, RuleChangeError, type NewRuleInput } from "./support";
import type { AllocationMethod } from "./rules";
import { DEMO_BUSINESS_ID, ensurePotsRuntime } from "./runtime";

const METHODS: readonly AllocationMethod[] = ["PERCENTAGE", "FIXED", "MONTHLY_TARGET", "REMAINING"];

function back(code: string): never {
  redirect(`/owner/pots/rules?notice=${encodeURIComponent(code)}`);
}
function text(f: FormData, k: string): string {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function num(f: FormData, k: string): number | null {
  const t = text(f, k);
  if (t === "") return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
const toPaise = (r: number) => Math.round(r * 100);

export async function publishRuleAction(formData: FormData): Promise<void> {
  const session = await getDemoSession();
  if (!session || session.role !== "owner") return back("forbidden");
  const stepUpVerified = await getPotsPinVerified();
  if (!stepUpVerified) return back("step-up-required");

  const restaurantId = session.restaurantId || DEMO_BUSINESS_ID;

  const ruleKey = text(formData, "ruleKey").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(ruleKey)) return back("invalid-rule-key");
  const potId = text(formData, "potId");
  const method = text(formData, "method") as AllocationMethod;
  if (!METHODS.includes(method)) return back("invalid-method");
  const reason = text(formData, "reason");
  if (!reason) return back("reason-required");

  const rt = await ensurePotsRuntime(restaurantId);
  if (!rt.potIds.includes(potId)) return back("invalid-pot");

  const valueRaw = num(formData, "value");
  if (method !== "REMAINING" && (valueRaw === null || Number.isNaN(valueRaw))) return back("invalid-value");
  const capRaw = num(formData, "capRupees");
  const floorRaw = num(formData, "floorRupees");
  if (Number.isNaN(capRaw) || Number.isNaN(floorRaw)) return back("invalid-cap-floor");
  const priority = Number(text(formData, "priority"));
  if (!Number.isSafeInteger(priority)) return back("invalid-priority");
  const from = text(formData, "effectiveFrom");
  const effectiveFrom = from ? new Date(`${from}T00:00:00+05:30`) : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) return back("invalid-date");

  const value = method === "REMAINING" ? 0 : method === "PERCENTAGE" ? Math.round((valueRaw as number) * 100) : toPaise(valueRaw as number);
  const input: NewRuleInput = {
    ruleKey,
    potId,
    method,
    value,
    priority,
    cap: capRaw === null ? null : toPaise(capRaw),
    floor: floorRaw === null ? null : toPaise(floorRaw),
    effectiveFrom,
    enabled: formData.get("enabled") === "on",
  };

  try {
    rt.registry.publish(restaurantId, input, { id: "owner", role: "OWNER" }, { stepUpVerified, reason, at: new Date() });
  } catch (e) {
    if (e instanceof RuleChangeError) return back(`rule-error:${e.message}`);
    if (e instanceof PermissionError) return back("forbidden");
    throw e;
  }
  revalidatePath("/owner/pots");
  revalidatePath("/owner/pots/rules");
  return back("published");
}