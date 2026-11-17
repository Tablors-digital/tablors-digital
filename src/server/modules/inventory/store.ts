import "server-only";

import { randomUUID } from "node:crypto";
import { deleteDoc, getDoc, listDocs, putDoc } from "@/server/modules/data/documents";
import {
  ALERT_TYPES,
  DEFAULT_TEMPLATES,
  type AlertType,
} from "@/lib/inventory-alerts";
import type { SendStatus } from "./whatsapp";

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  supplierName: string;
  /** Digits with country code, or "" */
  supplierPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recipient {
  id: string;
  name: string;
  phone: string; // digits with country code
}

export interface InventoryAlertSettings {
  /** Everything starts OFF: nothing is sent until the owner turns it on. */
  enabled: Record<AlertType, boolean>;
  templates: Record<AlertType, string>;
  recipients: Recipient[];
}

export interface DeliveryLog {
  id: string;
  at: string;
  type: AlertType;
  to: string;
  toName: string;
  message: string;
  status: SendStatus;
  providerMessageId?: string;
  error?: string;
}

const ITEMS = "inventory_items";
const SETTINGS = "inventory_alert_settings";
const SETTINGS_ID = "main";
const LOG = "inventory_whatsapp_log";

export async function listItems(restaurantId: string): Promise<InventoryItem[]> {
  return (await listDocs<InventoryItem>(restaurantId, ITEMS))
    .map((d) => d.data)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getItem(restaurantId: string, id: string) {
  return (await getDoc<InventoryItem>(restaurantId, ITEMS, id)) ?? undefined;
}
export async function saveItem(restaurantId: string, item: InventoryItem) {
  await putDoc(restaurantId, ITEMS, item.id, item);
}
export async function removeItem(restaurantId: string, id: string) {
  return deleteDoc(restaurantId, ITEMS, id);
}
export const newItemId = () => `inv_${randomUUID()}`;

function defaults(): InventoryAlertSettings {
  return {
    enabled: Object.fromEntries(ALERT_TYPES.map((t) => [t, false])) as Record<AlertType, boolean>,
    templates: { ...DEFAULT_TEMPLATES },
    recipients: [],
  };
}

export async function getAlertSettings(restaurantId: string): Promise<InventoryAlertSettings> {
  const stored = await getDoc<Partial<InventoryAlertSettings>>(restaurantId, SETTINGS, SETTINGS_ID);
  const d = defaults();
  return {
    enabled: { ...d.enabled, ...(stored?.enabled ?? {}) },
    templates: { ...d.templates, ...(stored?.templates ?? {}) },
    recipients: stored?.recipients ?? [],
  };
}
export async function saveAlertSettings(restaurantId: string, s: InventoryAlertSettings) {
  await putDoc(restaurantId, SETTINGS, SETTINGS_ID, s);
}

export async function appendLog(restaurantId: string, entry: Omit<DeliveryLog, "id" | "at">) {
  const full: DeliveryLog = { id: `wa_${randomUUID()}`, at: new Date().toISOString(), ...entry };
  await putDoc(restaurantId, LOG, full.id, full);
  return full;
}
export async function listLog(restaurantId: string, limit = 50): Promise<DeliveryLog[]> {
  return (await listDocs<DeliveryLog>(restaurantId, LOG))
    .map((d) => d.data)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
