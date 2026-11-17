"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DEMO_RESTAURANT_ID, getDemoRole } from "@/server/modules/auth/session";
import { isValidPeriod } from "@/lib/staff-hours";
import { buildPayrollSource } from "./payroll-source";
import { getPotsPinVerified } from "@/server/modules/auth/pots-session";
import {
  adjustPointsDb,
  createRewardDb,
  findOrCreateCustomerDb,
  saveLoyaltySettingsDb,
  setCustomerStatusDb,
} from "@/server/modules/loyalty-db/db-loyalty";
import type { RewardType } from "@/server/modules/loyalty-db/engine";
import { parseRupees } from "./money";
import { simulatedProvider } from "./payouts";
import { DEMO_BUSINESS_ID as B, getPotsRuntime } from "./runtime";
import type { ActorRole } from "./support";

/** All server-side guards live here: role from the session, step-up from the PIN-verified session, strict parsing, every error shown as a notice (never thrown to the client). */
async function actor(): Promise<{ role: ActorRole; id: string; stepUp: boolean }> {
  const r = String(await getDemoRole()).toUpperCase();
  const role = (["OWNER", "MANAGER", "ACCOUNTANT", "STAFF"].includes(r) ? r : "STAFF") as ActorRole;
  return { role, id: role.toLowerCase(), stepUp: await getPotsPinVerified() };
}
const txt = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };
const money = (f: FormData, k: string) => { const p = parseRupees(txt(f, k)); if (p === null || p <= 0) throw new Error("Enter a valid amount greater than zero (max 2 decimals)."); return p; };
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function run(
  path: string,
  fn: (a: Awaited<ReturnType<typeof actor>>) => string | void | Promise<string | void>,
): Promise<never> {
  let code = "done";
  try { code = (await fn(await actor())) ?? "done"; }
  catch (e) { code = `error:${e instanceof Error ? e.message : "Something went wrong"}`; }
  revalidatePath("/owner/pots", "layout");
  redirect(`${path}?notice=${encodeURIComponent(code)}`);
}
const rt = () => getPotsRuntime();

// ---------- Pot detail: reserve / transfer ----------
export async function movePotAction(f: FormData): Promise<void> {
  const potId = txt(f, "potId");
  return run(`/owner/pots/${potId}`, (a) => {
    const to = txt(f, "to"); const mode = txt(f, "mode"); // reserve: UNALLOCATED -> this Pot, transfer: this Pot -> other
    const from = mode === "reserve" ? "UNALLOCATED" as const : { potId };
    const dest = mode === "reserve" ? { potId } : to === "UNALLOCATED" ? "UNALLOCATED" as const : { potId: to };
    rt().payouts.move({ businessId: B, moveId: uid("mv"), from, to: dest, amount: money(f, "amount"), reason: txt(f, "reason"), actorId: a.id, role: a.role, stepUpVerified: a.stepUp, kind: mode === "reserve" ? "ADJUSTMENT" : "TRANSFER" });
    return "Pot updated.";
  });
}

// ---------- Team / directory ----------
// Employees are managed ONLY in the Staff module (/owner/staff); payroll reads them from there.
export async function addVendorAction(f: FormData): Promise<void> {
  return run("/owner/pots/suppliers", (a) => { rt().directory.addVendor(B, { name: txt(f, "name"), payoutRef: txt(f, "payoutRef") }, a.role); return "Supplier added."; });
}

// ---------- Salary ----------
export async function createPayrollRunAction(f: FormData): Promise<void> {
  const salaryPot = rt().pots.find((p) => p.type === "SALARY")?.id ?? "";
  const runId = `run_${txt(f, "period")}_${Date.now().toString(36)}`;
  let failed = "";
  try {
    const a = await actor();
    const period = txt(f, "period"); if (!isValidPeriod(period)) throw new Error("Choose a payroll month.");
    // One draft per month: a second run for the same period could pay everyone twice.
    if (rt().payroll.list(B).some((r) => r.period === period)) throw new Error(`A payroll run for ${period} already exists. Open it from the list below.`);
    const rows = (await buildPayrollSource(DEMO_RESTAURANT_ID, period)).filter((r) => r.excluded === null && r.payable);
    if (!rows.length) throw new Error("No active staff with a monthly salary. Add salaries in the Staff module first.");
    // payoutRef is only an internal reference (no bank details are stored yet; provider payouts are simulated).
    rt().payroll.createRun({ runId, businessId: B, potId: salaryPot, period, actorId: a.id, role: a.role, employees: rows.map((r) => ({ employeeId: r.staffId, name: `${r.name} (${r.employeeCode})`, payoutRef: `staff:${r.staffId}`, salaryPaise: r.payable!.payablePaise })) });
  } catch (e) { failed = e instanceof Error ? e.message : "Could not create the payroll run."; }
  revalidatePath("/owner/pots", "layout");
  redirect(failed ? `/owner/pots/salary?notice=${encodeURIComponent("error:" + failed)}` : `/owner/pots/salary/${runId}`);
}
export async function adjustPayrollItemAction(f: FormData): Promise<void> {
  const runId = txt(f, "runId");
  return run(`/owner/pots/salary/${runId}`, (a) => {
    const item = rt().payroll.get(runId).items.find((x) => x.employeeId === txt(f, "employeeId")); if (!item) throw new Error("Employee not in this run.");
    let amount: number;
    const absent = txt(f, "absentDays"), days = txt(f, "workingDays");
    if (absent) { // absence deduction on the ORIGINAL salary, integer maths
      if (!/^\d{1,2}$/.test(absent) || !/^\d{1,2}$/.test(days) || Number(days) < 1 || Number(absent) > Number(days)) throw new Error("Enter valid absent and working days.");
      amount = Math.floor((item.originalPaise * (Number(days) - Number(absent))) / Number(days));
    } else amount = money(f, "newAmount");
    rt().payroll.adjustItem({ runId, employeeId: item.employeeId, newAmountPaise: amount, reason: txt(f, "reason"), actorId: a.id, role: a.role });
    return "Adjustment saved. The original salary is kept.";
  });
}
export async function approvePayrollAction(f: FormData): Promise<void> {
  const runId = txt(f, "runId");
  return run(`/owner/pots/salary/${runId}`, (a) => { rt().payroll.approve({ runId, actorId: a.id, role: a.role, stepUpVerified: a.stepUp }); return "Salary batch approved by owner."; });
}
export async function executePayrollAction(f: FormData): Promise<void> {
  const runId = txt(f, "runId"); const outcome = txt(f, "outcome") === "FAILED" ? "FAILED" : "SUCCESS";
  return run(`/owner/pots/salary/${runId}`, (a) => {
    if (a.role !== "OWNER") throw new Error("Only the owner can release salary payouts.");
    const r = rt().payroll.execute({ runId, actorId: a.id, provider: (x) => simulatedProvider(x.payoutId, outcome) });
    return r.status === "COMPLETED" ? "Salaries paid (simulated)." : "Some payouts failed — the Pot was not reduced for them. You can retry.";
  });
}

// ---------- Supplier / profit / tax payouts ----------
async function payoutFromForm(path: string, f: FormData, kind: "SUPPLIER" | "PROFIT" | "TAX", potId: string, recipientRef: (a: Awaited<ReturnType<typeof actor>>) => { ref: string; vendorId?: string }): Promise<never> {
  return run(path, (a) => {
    const r = recipientRef(a);
    rt().payouts.requestPayout({ businessId: B, payoutId: uid("po"), potId, kind, amount: money(f, "amount"), recipientRef: r.ref, vendorId: r.vendorId, invoiceRef: txt(f, "invoice") || undefined, note: txt(f, "note") || undefined, actorId: a.id, role: a.role });
    return "Request created. It needs approval before money moves.";
  });
}
export async function supplierPaymentAction(f: FormData): Promise<void> {
  return payoutFromForm("/owner/pots/suppliers", f, "SUPPLIER", txt(f, "potId"), () => {
    const v = rt().directory.vendor(txt(f, "vendorId")); if (!v) throw new Error("Choose a supplier.");
    if (!txt(f, "invoice")) throw new Error("Enter the invoice number.");
    return { ref: v.payoutRef, vendorId: v.id };
  });
}
export async function profitWithdrawalAction(f: FormData): Promise<void> {
  const potId = rt().pots.find((p) => p.type === "OWNER_PROFIT")?.id ?? "";
  if (txt(f, "confirm") !== "yes") return run("/owner/pots/profit", () => { throw new Error("Tick the confirmation box."); });
  return payoutFromForm("/owner/pots/profit", f, "PROFIT", potId, () => ({ ref: txt(f, "destination") }));
}
export async function taxTransferAction(f: FormData): Promise<void> {
  const potId = rt().pots.find((p) => p.type === "GST")?.id ?? "";
  return payoutFromForm("/owner/pots/gst", f, "TAX", potId, () => ({ ref: txt(f, "destination") }));
}
export async function gstAdjustAction(f: FormData): Promise<void> {
  const gst = rt().pots.find((p) => p.type === "GST")?.id ?? "";
  return run("/owner/pots/gst", (a) => {
    const down = txt(f, "direction") === "release";
    rt().payouts.move({ businessId: B, moveId: uid("gst"), from: down ? { potId: gst } : "UNALLOCATED", to: down ? "UNALLOCATED" : { potId: gst }, amount: money(f, "amount"), reason: txt(f, "reason"), actorId: a.id, role: a.role, stepUpVerified: a.stepUp });
    return "GST reserve adjusted with reason.";
  });
}

// ---------- Approvals ----------
export async function approvePayoutAction(f: FormData): Promise<void> {
  return run("/owner/pots/approvals", (a) => { rt().payouts.approvePayout({ payoutId: txt(f, "payoutId"), actorId: a.id, role: a.role, stepUpVerified: a.stepUp }); return "Approved."; });
}
export async function executePayoutAction(f: FormData): Promise<void> {
  return run("/owner/pots/approvals", (a) => {
    if (a.role !== "OWNER") throw new Error("Only the owner can release payouts.");
    const id = txt(f, "payoutId"); const p = rt().payouts.executePayout(id, simulatedProvider(id, txt(f, "outcome") === "FAILED" ? "FAILED" : "SUCCESS"));
    return p.status === "SUCCESS" ? "Paid (simulated). Pot ledger updated." : "Payout failed. The Pot was not reduced.";
  });
}
export async function cancelPayoutAction(f: FormData): Promise<void> {
  return run("/owner/pots/approvals", (a) => { rt().payouts.cancelPayout(txt(f, "payoutId"), a.id, a.role); return "Cancelled."; });
}

// ---------- Loyalty (PostgreSQL, the single source of truth) ----------
const R = DEMO_RESTAURANT_ID;
const optInt = (f: FormData, k: string): number | null => {
  const v = txt(f, k);
  if (!v) return null;
  if (!/^\d{1,9}$/.test(v)) throw new Error(`${k} must be a whole number.`);
  return Number(v);
};

export async function saveLoyaltySettingsAction(f: FormData): Promise<void> {
  return run("/owner/pots/loyalty", async (a) => {
    if (a.role !== "OWNER" && a.role !== "MANAGER") throw new Error("You cannot change loyalty settings.");
    const per = optInt(f, "pointsPerBlock");
    const block = parseRupees(txt(f, "blockRupees"));
    if (!per || per < 1 || block === null || block < 1) throw new Error("Set points and rupee block (for example 1 point per ₹10).");
    const minBill = txt(f, "minBill") ? parseRupees(txt(f, "minBill")) : 0;
    if (minBill === null) throw new Error("Enter a valid minimum bill.");
    await saveLoyaltySettingsDb(R, {
      enabled: txt(f, "enabled") === "on",
      earnPoints: per,
      earnSpendPaise: block,
      excludeGst: txt(f, "excludeGst") === "on",
      excludeServiceCharge: txt(f, "excludeService") === "on",
      discountBeforePoints: txt(f, "deductDiscounts") === "on",
      minBillPaise: minBill,
      maxPointsPerBill: optInt(f, "maxPerBill"),
      expiryMonths: optInt(f, "expiryMonths"),
      minPointsToRedeem: optInt(f, "minPointsToRedeem") ?? 0,
    });
    return "Loyalty settings saved.";
  });
}

export async function createRewardAction(f: FormData): Promise<void> {
  return run("/owner/pots/loyalty", async (a) => {
    if (a.role !== "OWNER" && a.role !== "MANAGER") throw new Error("You cannot add rewards.");
    const name = txt(f, "name");
    if (name.length < 2) throw new Error("Enter a reward name.");
    const cost = optInt(f, "pointsCost");
    if (!cost || cost < 1) throw new Error("Points cost must be at least 1.");
    const value = txt(f, "value") ? parseRupees(txt(f, "value")) : null;
    if (txt(f, "value") && value === null) throw new Error("Enter a valid value.");
    const pct = optInt(f, "percent");
    if (pct !== null && (pct < 1 || pct > 100)) throw new Error("Percent must be 1–100.");
    await createRewardDb(R, {
      name,
      type: txt(f, "type") as RewardType,
      pointsCost: cost,
      valuePaise: value,
      percent: pct,
      maxDiscountPaise: value,
      quantity: optInt(f, "quantity"),
      terms: txt(f, "terms") || null,
      validFrom: null,
      validTo: null,
    });
    return "Reward added.";
  });
}

export async function enrolMemberAction(f: FormData): Promise<void> {
  return run("/owner/pots/loyalty", async () => {
    const c = await findOrCreateCustomerDb(R, txt(f, "phone"));
    if (!c) throw new Error("Enter a valid 10-digit mobile number.");
    return "Member enrolled.";
  });
}

export async function adjustPointsAction(f: FormData): Promise<void> {
  const id = txt(f, "memberId");
  return run(`/owner/pots/loyalty/${id}`, async (a) => {
    if (a.role !== "OWNER" && a.role !== "MANAGER") throw new Error("You cannot adjust points.");
    const res = await adjustPointsDb(R, id, Number(txt(f, "points")), txt(f, "reason"), a.id, txt(f, "requestId") || uid("adj"));
    if (!res.ok) throw new Error(res.message);
    return "Points adjusted and logged.";
  });
}

export async function setMemberStatusAction(f: FormData): Promise<void> {
  const id = txt(f, "memberId");
  return run(`/owner/pots/loyalty/${id}`, async (a) => {
    if (a.role !== "OWNER" && a.role !== "MANAGER") throw new Error("You cannot change member status.");
    await setCustomerStatusDb(R, id, txt(f, "status") === "SUSPENDED" ? "blocked" : "active");
    return "Member updated.";
  });
}