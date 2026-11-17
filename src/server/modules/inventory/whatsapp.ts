/**
 * WhatsApp sender. Uses the Meta WhatsApp Cloud API when it is configured, and
 * otherwise reports "not_configured". It NEVER pretends a message was sent.
 *
 * "sent" means WhatsApp accepted the message. Read/delivery receipts need a
 * webhook, which is not connected yet, so they are not tracked.
 */
export type SendStatus = "sent" | "failed" | "not_configured";
export interface SendResult {
  status: SendStatus;
  providerMessageId?: string;
  error?: string;
}

export function whatsappConnection(env: NodeJS.ProcessEnv = process.env) {
  const missing: string[] = [];
  if (!env.WHATSAPP_ACCESS_TOKEN) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!env.WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return { configured: missing.length === 0, missing };
}

export async function sendWhatsApp(
  toDigits: string,
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const conn = whatsappConnection(env);
  if (!conn.configured) {
    return { status: "not_configured", error: `Not connected: set ${conn.missing.join(" and ")}.` };
  }
  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toDigits,
          type: "text",
          text: { body: text.slice(0, 4000) },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { status: "failed", error: json.error?.message ?? `WhatsApp API returned ${res.status}` };
    }
    const id = json.messages?.[0]?.id;
    if (!id) return { status: "failed", error: "WhatsApp did not return a message id." };
    return { status: "sent", providerMessageId: id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Network error" };
  }
}
