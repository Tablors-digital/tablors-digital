"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ALERT_TYPES,
  alertForStockChange,
  normalizePhone,
  stockState,
  type AlertType,
} from "@/lib/inventory-alerts";
import { hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession } from "@/server/modules/auth/session";
import { describeOutcome, dispatchAlert } from "@/server/modules/inventory/notify";
import {
  getAlertSettings,
  getItem,
  listItems,
  newItemId,
  removeItem,
  saveAlertSettings,
  saveItem,
  type InventoryItem,
} from "@/server/modules/inventory/store";

const PATH = "/owner/inventory";
const txt = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function authorize() {
  const session = await getDemoSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, "inventory")) throw new Error("You do not have access to inventory.");
  return session;
}

/** Every action ends here: refresh the page and show the result as a notice. */
function done(message: string, error = false): never {
  revalidatePath(PATH);
  revalidatePath("/owner");
  redirect(`${PATH}?notice=${encodeURIComponent(`${error ? "error:" : ""}${message}`)}`);
}

function qty(value: string, label: string): number {
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(value)) throw new Error(`${label} must be a number (0 or more, up to 3 decimals).`);
  return Number(value);
}

function itemVars(item: InventoryItem) {
  return {
    item: item.name,
    quantity: item.quantity,
    unit: item.unit,
    threshold: item.lowStockThreshold,
    supplier: item.supplierName || "supplier",
  };
}

/** Runs the automatic alerts a stock change should raise and returns a short summary. */
async function alertsAfterChange(restaurantId: string, before: InventoryItem | null, after: InventoryItem): Promise<string[]> {
  const notes: string[] = [];
  const prevState = before ? stockState(before.quantity, before.lowStockThreshold) : "ok";
  const nextState = stockState(after.quantity, after.lowStockThreshold);
  const worsened: AlertType | null = before ? alertForStockChange(prevState, nextState) : nextState === "ok" ? null : nextState === "out" ? "out_of_stock" : "low_stock";
  if (worsened) notes.push(`${worsened === "out_of_stock" ? "Out-of-stock" : "Low-stock"} alert: ${describeOutcome(await dispatchAlert(restaurantId, worsened, itemVars(after)))}`);
  else if (!before || after.quantity > before.quantity) {
    notes.push(`Inventory update: ${describeOutcome(await dispatchAlert(restaurantId, "inventory_update", itemVars(after)))}`);
  }
  return notes;
}

export async function saveItemAction(f: FormData): Promise<void> {
  const session = await authorize();
  let message = "";
  try {
    const id = txt(f, "id");
    const name = txt(f, "name");
    const unit = txt(f, "unit");
    if (name.length < 2 || name.length > 80) throw new Error("Item name must be 2–80 characters.");
    if (!unit || unit.length > 12) throw new Error("Enter a unit (kg, litre, pcs...).");
    const phoneRaw = txt(f, "supplierPhone");
    const supplierPhone = phoneRaw ? normalizePhone(phoneRaw) : "";
    if (supplierPhone === null) throw new Error("Supplier WhatsApp number is not valid.");

    const existing = id ? await getItem(session.restaurantId, id) : undefined;
    if (id && !existing) throw new Error("Item not found.");
    const all = await listItems(session.restaurantId);
    if (all.some((i) => i.id !== id && i.name.toLowerCase() === name.toLowerCase())) throw new Error("An item with that name already exists.");

    const now = new Date().toISOString();
    const item: InventoryItem = {
      id: existing?.id ?? newItemId(),
      name,
      unit,
      quantity: qty(txt(f, "quantity") || "0", "Quantity"),
      lowStockThreshold: qty(txt(f, "lowStockThreshold") || "0", "Low-stock level"),
      supplierName: txt(f, "supplierName").slice(0, 80),
      supplierPhone,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await saveItem(session.restaurantId, item);
    const notes = await alertsAfterChange(session.restaurantId, existing ?? null, item);
    message = [existing ? "Item updated." : "Item added.", ...notes].join(" ");
  } catch (e) {
    done(e instanceof Error ? e.message : "Could not save the item.", true);
  }
  done(message);
}

export async function updateStockAction(f: FormData): Promise<void> {
  const session = await authorize();
  let message = "";
  try {
    const item = await getItem(session.restaurantId, txt(f, "id"));
    if (!item) throw new Error("Item not found.");
    const next: InventoryItem = { ...item, quantity: qty(txt(f, "quantity"), "Quantity"), updatedAt: new Date().toISOString() };
    await saveItem(session.restaurantId, next);
    const notes = await alertsAfterChange(session.restaurantId, item, next);
    message = [`${item.name} stock set to ${next.quantity} ${item.unit}.`, ...notes].join(" ");
  } catch (e) {
    done(e instanceof Error ? e.message : "Could not update stock.", true);
  }
  done(message);
}

export async function deleteItemAction(f: FormData): Promise<void> {
  const session = await authorize();
  await removeItem(session.restaurantId, txt(f, "id"));
  done("Item deleted.");
}

export async function saveAlertSettingsAction(f: FormData): Promise<void> {
  const session = await authorize();
  try {
    const current = await getAlertSettings(session.restaurantId);
    for (const t of ALERT_TYPES) {
      current.enabled[t] = f.get(`enabled_${t}`) === "on";
      const tpl = txt(f, `template_${t}`);
      if (!tpl || tpl.length > 500) throw new Error("Each message template must be 1–500 characters.");
      current.templates[t] = tpl;
    }
    await saveAlertSettings(session.restaurantId, current);
  } catch (e) {
    done(e instanceof Error ? e.message : "Could not save settings.", true);
  }
  done("Alert settings saved.");
}

export async function addRecipientAction(f: FormData): Promise<void> {
  const session = await authorize();
  try {
    const name = txt(f, "name");
    const phone = normalizePhone(txt(f, "phone"));
    if (name.length < 2) throw new Error("Enter the recipient's name.");
    if (!phone) throw new Error("Enter a valid WhatsApp number with country code.");
    const s = await getAlertSettings(session.restaurantId);
    if (s.recipients.some((r) => r.phone === phone)) throw new Error("That number is already a recipient.");
    if (s.recipients.length >= 10) throw new Error("You can add up to 10 recipients.");
    s.recipients.push({ id: `rcp_${Date.now().toString(36)}`, name: name.slice(0, 60), phone });
    await saveAlertSettings(session.restaurantId, s);
  } catch (e) {
    done(e instanceof Error ? e.message : "Could not add the recipient.", true);
  }
  done("Recipient added.");
}

export async function removeRecipientAction(f: FormData): Promise<void> {
  const session = await authorize();
  const s = await getAlertSettings(session.restaurantId);
  s.recipients = s.recipients.filter((r) => r.id !== txt(f, "id"));
  await saveAlertSettings(session.restaurantId, s);
  done("Recipient removed.");
}

export async function sendReplenishmentAction(): Promise<void> {
  const session = await authorize();
  const needing = (await listItems(session.restaurantId)).filter((i) => stockState(i.quantity, i.lowStockThreshold) !== "ok");
  if (needing.length === 0) done("Nothing is low or out of stock, so no reminder was sent.");
  const lines = needing.map((i) => `• ${i.name}: ${i.quantity} ${i.unit} left (level ${i.lowStockThreshold})`).join("\n");
  const out = await dispatchAlert(session.restaurantId, "replenishment", { items: lines });
  done(`Replenishment reminder: ${describeOutcome(out)}`, !out.attempted);
}

export async function notifySupplierAction(f: FormData): Promise<void> {
  const session = await authorize();
  const item = await getItem(session.restaurantId, txt(f, "id"));
  if (!item) done("Item not found.", true);
  const out = await dispatchAlert(session.restaurantId, "supplier_update", itemVars(item!), { item: item!, supplierOnly: true });
  done(`Supplier update: ${describeOutcome(out)}`, !out.attempted);
}
