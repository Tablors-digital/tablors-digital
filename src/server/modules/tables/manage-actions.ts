"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/server/modules/auth/session";
import { notifyTableReserved } from "@/server/modules/notifications/events";
import {
  renameTableDb,
  reserveTableDb,
  setTableStatusDb,
} from "@/server/modules/data/tables-db";

function readText(formData: FormData, key: string): string {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw.trim() : "";
}

function refresh(tableId: string): void {
  revalidatePath("/owner");
  revalidatePath("/owner/tables");
  revalidatePath(`/owner/tables/${tableId}`);
}

/**
 * redirect() throws internally, so call it as the last statement of a branch.
 * Forms on the tables list send returnTo=list to stay on the list.
 */
function back(tableId: string, notice: string, returnTo?: string): never {
  refresh(tableId);
  if (returnTo === "list") redirect(`/owner/tables?notice=${notice}`);
  redirect(`/owner/tables/${tableId}?notice=${notice}`);
}

export async function renameTableAction(formData: FormData): Promise<void> {
  const session = await requirePermission("tables");

  const tableId = readText(formData, "tableId");

  if (tableId === "") {
    return redirect("/owner/tables");
  }

  const result = await renameTableDb(
    session.restaurantId,
    tableId,
    readText(formData, "label"),
  );

  if (!result.ok) {
    if (result.reason === "not-found") {
      return redirect("/owner/tables");
    }

    return back(
      tableId,
      result.reason === "duplicate-label" ? "rename-duplicate" : "rename-invalid"
    );
  }

  return back(tableId, "renamed");
}

export async function reserveTableAction(formData: FormData): Promise<void> {
  const session = await requirePermission("tables");

  const tableId = readText(formData, "tableId");

  if (tableId === "") {
    return redirect("/owner/tables");
  }

  const result = await reserveTableDb(session.restaurantId, tableId);

  if (!result.ok) {
    if (result.reason === "not-found") {
      return redirect("/owner/tables");
    }

    return back(tableId, "cannot-reserve", readText(formData, "returnTo"));
  }

  await notifyTableReserved({ tableId, reservationId: `${tableId}:${Date.now()}` });

  return back(tableId, "reserved", readText(formData, "returnTo"));
}


export async function releaseTableAction(formData: FormData): Promise<void> {
  const session = await requirePermission("tables");

  const tableId = readText(formData, "tableId");

  if (tableId === "") {
    return redirect("/owner/tables");
  }

  // Explicit confirmation from the owner.
  const confirmed =
    readText(formData, "confirmActiveOrderRelease") === "yes";

  if (!confirmed) {
    return back(
      tableId,
      "confirmation-required",
      readText(formData, "returnTo"),
    );
  }

  const result = await setTableStatusDb(
    session.restaurantId,
    tableId,
    "available",
    true,
  );

  if (!result.ok) {
    if (result.reason === "not-found") {
      return redirect("/owner/tables");
    }

    return back(
      tableId,
      "cannot-release",
      readText(formData, "returnTo"),
    );
  }

  return back(
    tableId,
    "released",
    readText(formData, "returnTo"),
  );
}
