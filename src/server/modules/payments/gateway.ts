import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay UPI QR integration (fixed-amount, single-use QR per bill).
 *
 * Nothing here ever claims a payment succeeded on its own: a payment is only
 * recorded after Razorpay confirms it, either through a signed webhook or by
 * Tablor's server asking Razorpay's API directly. If credentials are missing
 * the customer sees which settings are required and no QR is produced.
 */

const API = "https://api.razorpay.com/v1";

export type GatewayConfig =
  | { configured: true; keyId: string; keySecret: string; webhookSecret: string | null }
  | { configured: false; missing: string[] };

export function getGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const missing = [
    !keyId ? "RAZORPAY_KEY_ID" : null,
    !keySecret ? "RAZORPAY_KEY_SECRET" : null,
  ].filter((v): v is string => v !== null);
  if (missing.length > 0 || !keyId || !keySecret) return { configured: false, missing };
  return { configured: true, keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || null };
}

function authHeader(cfg: { keyId: string; keySecret: string }): string {
  return "Basic " + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
}

export type CreatedQr = { id: string; imageUrl: string };

export async function createUpiQr(
  cfg: { keyId: string; keySecret: string },
  input: { amountPaise: number; name: string; description: string; notes: Record<string, string> },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; qr: CreatedQr } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl(`${API}/payments/qr_codes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader(cfg) },
      body: JSON.stringify({
        type: "upi_qr",
        name: input.name.slice(0, 40),
        usage: "single_use",
        fixed_amount: true,
        payment_amount: input.amountPaise,
        description: input.description.slice(0, 250),
        // Razorpay requires close_by at least 2 minutes ahead.
        close_by: Math.floor(Date.now() / 1000) + 30 * 60,
        notes: input.notes,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      image_url?: string;
      error?: { description?: string };
    };
    if (!res.ok || !data.id || !data.image_url) {
      return { ok: false, error: data.error?.description ?? `Gateway error (${res.status}).` };
    }
    return { ok: true, qr: { id: data.id, imageUrl: data.image_url } };
  } catch (error) {
    console.error("[gateway] createUpiQr failed", error);
    return { ok: false, error: "Could not reach the payment gateway." };
  }
}

export type GatewayPayment = { id: string; amountPaise: number; status: string };

/** Asks Razorpay directly which payments were made against one QR code. */
export async function listQrPayments(
  cfg: { keyId: string; keySecret: string },
  qrId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayPayment[] | null> {
  try {
    const res = await fetchImpl(`${API}/payments/qr_codes/${encodeURIComponent(qrId)}/payments`, {
      headers: { authorization: authHeader(cfg) },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { id: string; amount: number; status: string }[] };
    return (data.items ?? []).map((p) => ({ id: p.id, amountPaise: p.amount, status: p.status }));
  } catch {
    return null;
  }
}

/** Constant-time check of Razorpay's X-Razorpay-Signature over the RAW request body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
