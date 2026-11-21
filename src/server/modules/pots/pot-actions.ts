"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/server/modules/auth/session";
import { getPotsPinVerified } from "@/server/modules/auth/pots-session";
import { DEMO_BUSINESS_ID, refreshPotsList } from "./runtime";
import { createPotDb, deletePotDb, renamePotDb, type PotResult } from "./db-pots";

const txt = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function guard(): Promise<{ ok: true; restaurantId: string } | { ok: false; notice: string }> {
  const session = await getDemoSession();
  if (!session || session.role !== "owner") {
    return { ok: false, notice: "error:Only the owner can change pots." };
  }
  if (!(await getPotsPinVerified())) {
    return { ok: false, notice: "error:step-up-required" };
  }
  return { ok: true, restaurantId: session.restaurantId || DEMO_BUSINESS_ID };
}

function done(path: string, r: PotResult | string): never {
  revalidatePath("/owner/pots", "layout");
  const code = typeof r === "string" ? r : r.ok ? "Done." : `error:${r.message}`;
  redirect(`${path}?notice=${encodeURIComponent(code)}`);
}

export async function createPotAction(f: FormData): Promise<void> {
  const g = await guard();
  if (!g.ok) return done("/owner/pots", g.notice);
  const res = await createPotDb(g.restaurantId, txt(f, "name"));
  if (res.ok) await refreshPotsList(g.restaurantId);
  return done("/owner/pots", res);
}

export async function renamePotAction(f: FormData): Promise<void> {
  const id = txt(f, "potId");
  const g = await guard();
  if (!g.ok) return done(`/owner/pots/${id}`, g.notice);
  const res = await renamePotDb(g.restaurantId, id, txt(f, "name"));
  if (res.ok) await refreshPotsList(g.restaurantId);
  return done(`/owner/pots/${id}`, res);
}

export async function deletePotAction(f: FormData): Promise<void> {
  const id = txt(f, "potId");
  const g = await guard();
  if (!g.ok) return done(`/owner/pots/${id}`, g.notice);
  const r = await deletePotDb(g.restaurantId, id);
  if (r.ok) await refreshPotsList(g.restaurantId);
  return done(r.ok ? "/owner/pots" : `/owner/pots/${id}`, r);
}