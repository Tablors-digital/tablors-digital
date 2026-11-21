"use server";

import { revalidatePath } from "next/cache";

import {
  DEMO_RESTAURANT_ID,
  getDemoRole,
} from "@/server/modules/auth/session";
import {
  createTableDb,
  removeTableDb,
} from "@/server/modules/data/tables-db";

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateTables() {
  revalidatePath("/owner/tables");
  revalidatePath("/owner");
}

export async function createTableAction(formData: FormData): Promise<void> {
  // Only the restaurant owner can create tables.
  const role = await getDemoRole();
  if (role !== "owner") return;

  const label = readString(formData, "label");
  if (!label) return;

  const result = await createTableDb(DEMO_RESTAURANT_ID, label);
  if (!result.ok) return;

  revalidateTables();
}

export async function removeTableAction(formData: FormData): Promise<void> {
  // Only the restaurant owner can remove tables.
  const role = await getDemoRole();
  if (role !== "owner") return;

  const tableId = readString(formData, "tableId");
  if (!tableId) return;

  const result = await removeTableDb(DEMO_RESTAURANT_ID, tableId);
  if (!result.ok) return;

  revalidateTables();
}