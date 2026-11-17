"use client";

import { useState } from "react";

import type { CustomerBillState } from "@/server/modules/customer/actions";

export type LoyaltyHandlers = {
  identify: (phone: string) => Promise<{ ok: boolean; message?: string }>;
  redeem: (rewardId: string) => Promise<{ ok: boolean; message?: string }>;
  remove: () => Promise<{ ok: boolean; message?: string }>;
};

/**
 * Maps the points typed in the redeem field to the reward that costs exactly that many points.
 * Shared by the field's own Enter handler and the device keypad's ✓ key.
 */
export function findRewardByPoints(
  rewards: { id: string; pointsCost: number; redeemable: boolean; reason?: string | null }[],
  raw: string,
): { ok: true; rewardId: string } | { ok: false; message: string } {
  const text = raw.trim();
  const pts = Number(text);
  if (!/^\d+$/.test(text) || pts <= 0) return { ok: false, message: "Enter the points as a whole number." };
  const same = rewards.filter((r) => r.pointsCost === pts);
  const hit = same.find((r) => r.redeemable);
  if (hit) return { ok: true, rewardId: hit.id };
  if (same.length > 0) return { ok: false, message: same[0].reason ?? "Not enough points for that reward." };
  return { ok: false, message: `No reward costs ${pts} points.` };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Loyalty section of the customer bill: enter a mobile number, see points and
 * rewards, apply one reward. Points are deducted from the balance as soon as
 * a reward is applied, and refunded if the reward is removed.
 *
 * - Phone lookup: Enter in the field or the Continue button.
 * - Redeem: Enter ONLY (no button, nothing on blur), then onProceed shows the QR.
 */
export function LoyaltyBox({
  bill,
  handlers,
  phone: controlledPhone,
  onPhoneChange,
  redeemPoints: controlledRedeem,
  onRedeemPointsChange,
  onProceed,
}: {
  bill: CustomerBillState;
  handlers: LoyaltyHandlers;
  /** When given, the number is owned by the device so the keypad can type it. */
  phone?: string;
  onPhoneChange?: (phone: string) => void;
  /** Points typed in the redeem field (owned by the device when given, so the keypad can type it). */
  redeemPoints?: string;
  onRedeemPointsChange?: (points: string) => void;
  /** Called once a reward is applied, or the customer skips redeeming: the device then shows the payment QR. */
  onProceed?: () => void;
}) {
  const loyalty = bill.loyalty;
  const [localPhone, setLocalPhone] = useState("");
  const phone = controlledPhone ?? localPhone;
  const setPhone = onPhoneChange ?? setLocalPhone;
  const keypadDriven = controlledPhone !== undefined;
  const [localRedeem, setLocalRedeem] = useState("");
  const redeemPts = controlledRedeem ?? localRedeem;
  const setRedeemPts = onRedeemPointsChange ?? setLocalRedeem;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!loyalty.enabled || bill.status === "paid") return null;

  async function run(action: () => Promise<{ ok: boolean; message?: string }>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setMessage(null);
    let ok = false;
    try {
      const res = await action();
      ok = res.ok;
      if (!res.ok) setMessage(res.message ?? "Something went wrong.");
    } catch {
      setMessage("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
    return ok;
  }

  const rewards = loyalty.identified ? loyalty.rewards : [];
  const available = rewards.filter((r) => r.redeemable);
  const canRedeemAny = available.length > 0;

  /** Enter in the redeem field: apply the reward that costs the typed points, or skip when empty. Then pay. */
  async function submitRedeem() {
    if (redeemPts.trim() === "") {
      onProceed?.();
      return;
    }
    const pick = findRewardByPoints(rewards, redeemPts);
    if (!pick.ok) {
      setMessage(pick.message);
      return;
    }
    if (await run(() => handlers.redeem(pick.rewardId))) {
      setRedeemPts("");
      onProceed?.();
    }
  }

  const border = { borderColor: "var(--device-shell-border)", background: "var(--device-lcd-bg)" };
  const muted = { color: "var(--device-lcd-muted)" };

  return (
    <div className="mt-4 rounded-xl border p-4 text-xs" style={border}>
      <p className="text-sm font-bold" style={{ color: "var(--device-gold)" }}>
        Loyalty points
      </p>

      {!loyalty.identified ? (
        <div className="mt-2">
          <label htmlFor="loyalty-phone" style={muted}>
            Enter your mobile number to earn and use points
          </label>
          {keypadDriven && (
            <p className="mt-1 hidden lg:block" style={{ color: "var(--device-gold)" }}>
              Type it on the keypad, then press ✓ (or Enter).
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <input
              id="loyalty-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={18}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))}
              onKeyDown={(e) => {
                // Enter does exactly what Continue does.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!e.repeat && phone.trim() !== "") void run(() => handlers.identify(phone));
              }}
              placeholder="98765 43210"
              className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--device-shell-border)", color: "var(--device-lcd-text)" }}
            />
            <button
              type="button"
              disabled={busy || phone.trim() === ""}
              onClick={() => void run(() => handlers.identify(phone))}
              className="rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ background: "var(--device-gold)", color: "#171a10" }}
            >
              {busy ? "Checking…" : "Continue"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between">
            <span style={muted}>Member {loyalty.phoneMasked}</span>
            <span className="text-sm font-bold">{loyalty.balance} pts</span>
          </div>
          {loyalty.pointsToEarn > 0 && (
            <p style={muted}>You&apos;ll earn {loyalty.pointsToEarn} points when this bill is paid.</p>
          )}

          {loyalty.applied && (
            <div className="rounded-md border p-3" style={{ borderColor: "var(--device-gold)" }}>
              <p className="font-semibold">
                {loyalty.applied.rewardName} applied
                {loyalty.applied.discountRupees > 0 ? `: −${inr(loyalty.applied.discountRupees)}` : ""}
              </p>
              <p style={muted}>Code {loyalty.applied.code} · {loyalty.applied.points} points deducted</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => handlers.remove())}
                className="mt-2 text-xs underline disabled:opacity-50"
              >
                Remove reward
              </button>
            </div>
          )}

          {available.length === 0 ? (
            <p style={muted}>No reward is available with your points yet. Press Enter to continue to payment.</p>
          ) : (
            <ul className="space-y-2">
              {available.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3" style={{ borderColor: "var(--device-shell-border)" }}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="block" style={muted}>
                      {r.description} · {r.pointsCost} pts
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canRedeemAny && (
            <div>
              <label htmlFor="loyalty-redeem" style={muted}>
                Points to redeem
              </label>
              <input
                id="loyalty-redeem"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={redeemPts}
                disabled={busy}
                onChange={(e) => setRedeemPts(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  // Redeeming happens ONLY on Enter: no button, and leaving the field does nothing.
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (!e.repeat) void submitRedeem();
                }}
                placeholder="e.g. 100"
                className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: "var(--device-shell-border)", color: "var(--device-lcd-text)" }}
              />
              <p className="mt-1" style={muted}>
                Type the points, then press Enter to redeem. Press Enter on an empty field to skip and pay.
                {keypadDriven ? " On the keypad: type the points, then ✓." : ""}
              </p>
            </div>
          )}

        </div>
      )}

      {message && (
        <p role="alert" className="mt-2" style={{ color: "var(--device-lcd-muted)" }}>
          {message}
        </p>
      )}
    </div>
  );
}