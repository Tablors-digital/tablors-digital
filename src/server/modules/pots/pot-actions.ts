"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDemoRole } from "@/server/modules/auth/session";
import { getPotsPinVerified } from "@/server/modules/auth/pots-session";
import { DEMO_BUSINESS_ID as B } from "./runtime";
import { createPotDb, deletePotDb, renamePotDb, type PotResult } from "./db-pots";

const txt = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };

async function guard(): Promise<string | null> {
  if ((await getDemoRole()) !== "owner") return "error:Only the owner can change pots.";
  if (!(await getPotsPinVerified())) return "error:step-up-required";
  return null;
}
function done(path: string, r: PotResult | string): never {
  revalidatePath("/owner/pots", "layout");
  const code = typeof r === "string" ? r : r.ok ? "Done." : `error:${r.message}`;
  redirect(`${path}?notice=${encodeURIComponent(code)}`);
}

export async function createPotAction(f: FormData): Promise<void> {
  const g = await guard(); if (g) return done("/owner/pots", g);
  return done("/owner/pots", await createPotDb(B, txt(f, "name")));
}
export async function renamePotAction(f: FormData): Promise<void> {
  const id = txt(f, "potId"); const g = await guard(); if (g) return done(`/owner/pots/${id}`, g);
  return done(`/owner/pots/${id}`, await renamePotDb(B, id, txt(f, "name")));
}
export async function deletePotAction(f: FormData): Promise<void> {
  const id = txt(f, "potId"); const g = await guard(); if (g) return done(`/owner/pots/${id}`, g);
  const r = await deletePotDb(B, id);
  return done(r.ok ? "/owner/pots" : `/owner/pots/${id}`, r);
}