import "server-only";

import { renderTemplate, type AlertType } from "@/lib/inventory-alerts";
import { getSettings } from "@/server/modules/demo-store/settings";
import {
  appendLog,
  getAlertSettings,
  type InventoryItem,
  type Recipient,
} from "./store";
import { sendWhatsApp } from "./whatsapp";

export interface DispatchOutcome {
  /** false when the alert type is switched off or nobody is set up to receive it */
  attempted: boolean;
  sent: number;
  failed: number;
  notConfigured: number;
  reason?: string;
}

/**
 * Sends one alert to its recipients and records the REAL result for each in the
 * delivery history. A disabled alert type sends nothing and logs nothing.
 */
export async function dispatchAlert(
  restaurantId: string,
  type: AlertType,
  vars: Record<string, string | number>,
  opts: { item?: InventoryItem; supplierOnly?: boolean } = {},
): Promise<DispatchOutcome> {
  const settings = await getAlertSettings(restaurantId);
  const out: DispatchOutcome = { attempted: false, sent: 0, failed: 0, notConfigured: 0 };
  if (!settings.enabled[type]) return { ...out, reason: "This alert is switched off." };

  let recipients: Recipient[];
  if (opts.supplierOnly) {
    if (!opts.item?.supplierPhone) return { ...out, reason: "This item has no supplier WhatsApp number." };
    recipients = [{ id: "supplier", name: opts.item.supplierName || "Supplier", phone: opts.item.supplierPhone }];
  } else {
    recipients = settings.recipients;
    if (recipients.length === 0) return { ...out, reason: "No recipients are set up." };
  }

  const restaurant = (await getSettings(restaurantId)).name;
  const message = renderTemplate(settings.templates[type], { restaurant, ...vars });
  out.attempted = true;

  for (const r of recipients) {
    const res = await sendWhatsApp(r.phone, message);
    if (res.status === "sent") out.sent += 1;
    else if (res.status === "failed") out.failed += 1;
    else out.notConfigured += 1;
    await appendLog(restaurantId, {
      type,
      to: r.phone,
      toName: r.name,
      message,
      status: res.status,
      providerMessageId: res.providerMessageId,
      error: res.error,
      ...(opts.item ? {} : {}),
    });
  }
  return out;
}

export function describeOutcome(o: DispatchOutcome): string {
  if (!o.attempted) return o.reason ?? "Nothing was sent.";
  const parts: string[] = [];
  if (o.sent) parts.push(`${o.sent} accepted by WhatsApp`);
  if (o.failed) parts.push(`${o.failed} failed`);
  if (o.notConfigured) parts.push(`${o.notConfigured} not sent because WhatsApp is not connected`);
  return parts.join(", ") + ".";
}
