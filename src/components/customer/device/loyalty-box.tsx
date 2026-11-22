"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { redeemCustomPointsForBill, type CustomerBillState } from "@/server/modules/customer/actions";

export type LoyaltyHandlers = {
  identify: (phone: string) => Promise<{ ok: boolean; message?: string }>;
  redeem: (rewardId: string) => Promise<{ ok: boolean; message?: string }>;
  remove: () => Promise<{ ok: boolean; message?: string }>;
};

export function findRewardByPoints(
  rewards: { id: string; pointsCost: number; redeemable: boolean; reason?: string | null }[],
  raw: string,
): { ok: true; rewardId: string } | { ok: false; message: string } {
  const text = raw.trim();
  const pts = Number(text);
  if (!/^\d+$/.test(text) || pts <= 0) {
    return { ok: false, message: "Enter the points as a whole number." };
  }
  const same = rewards.filter((r) => r.pointsCost === pts);
  const hit = same.find((r) => r.redeemable);
  if (hit) return { ok: true, rewardId: hit.id };
  if (same.length > 0) {
    return { ok: false, message: same[0].reason ?? "Not enough points for that reward." };
  }
  return { ok: false, message: `No reward costs ${pts} points.` };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

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
  phone?: string;
  onPhoneChange?: (v: string) => void;
  redeemPoints?: string;
  onRedeemPointsChange?: (v: string) => void;
  onProceed?: () => void;
}) {
  const router = useRouter();
  const loyalty = bill.loyalty;
  const [localPhone, setLocalPhone] = useState("");
  const [localRedeem, setLocalRedeem] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const phone = controlledPhone !== undefined ? controlledPhone : localPhone;
  const setPhone = (v: string) => {
    setLocalPhone(v);
    onPhoneChange?.(v);
  };

  const redeemPts = controlledRedeem !== undefined ? controlledRedeem : localRedeem;
  const setRedeemPts = (v: string) => {
    setLocalRedeem(v);
    onRedeemPointsChange?.(v);
  };

  async function run(action: () => Promise<{ ok: boolean; message?: string }>): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    let ok = false;
    try {
      const res = await action();
      ok = res.ok;
      if (res.message) setMessage(res.message);
    } catch {
      setMessage("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
    return ok;
  }

  const rewards = loyalty.identified ? loyalty.rewards : [];
  const available = rewards.filter((r) => r.redeemable);
  const canRedeemPoints = loyalty.identified && !loyalty.applied && loyalty.available > 0;

  async function redeemById(rewardId: string) {
    if (await run(() => handlers.redeem(rewardId))) {
      setRedeemPts("");
      router.refresh();
      onProceed?.();
    }
  }

  async function submitRedeem() {
    if (redeemPts.trim() === "") {
      onProceed?.();
      return;
    }

    const text = redeemPts.trim();
    const pts = Number(text);
    if (!/^\d+$/.test(text) || pts <= 0) {
      setMessage("Enter the points as a whole number.");
      return;
    }

    const exactPreset = findRewardByPoints(rewards, redeemPts);
    if (exactPreset.ok) {
      await redeemById(exactPreset.rewardId);
      return;
    }

    if (await run(() => redeemCustomPointsForBill(bill.billId, pts))) {
      setRedeemPts("");
      router.refresh();
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
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!e.repeat && phone.trim() !== "" && !busy) {
                  void run(() => handlers.identify(phone));
                }
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
              <p style={muted}>
                Code {loyalty.applied.code} · {loyalty.applied.points} points deducted
              </p>
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

          {available.length > 0 && (
            <ul className="space-y-2">
              {available.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  style={{ borderColor: "var(--device-shell-border)" }}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="block" style={muted}>
                      {r.description} · {r.pointsCost} pts
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void redeemById(r.id)}
                    className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: "var(--device-gold)", color: "#171a10" }}
                  >
                    {busy ? "Redeeming…" : "Redeem"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canRedeemPoints ? (
            <div>
              <label htmlFor="loyalty-redeem" style={muted}>
                Points to redeem (up to {loyalty.available} pts · ₹0.25/pt)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="loyalty-redeem"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={redeemPts}
                  disabled={busy}
                  onChange={(e) => setRedeemPts(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (!e.repeat && !busy) void submitRedeem();
                  }}
                  placeholder={`e.g. ${Math.min(500, loyalty.available)}`}
                  className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{ borderColor: "var(--device-shell-border)", color: "var(--device-lcd-text)" }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitRedeem()}
                  className="rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ background: "var(--device-gold)", color: "#171a10" }}
                >
                  {busy ? "Redeeming…" : redeemPts.trim() === "" ? "Skip & Pay" : "Redeem"}
                </button>
              </div>
              <p className="mt-1" style={muted}>
                Enter points and click Redeem (or press Enter) to deduct from your order total, or click Skip &amp; Pay.
              </p>
            </div>
          ) : (
            !loyalty.applied && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p style={muted}>No points available to redeem yet. Press Enter to continue to payment.</p>
                {onProceed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onProceed()}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: "var(--device-gold)", color: "#171a10" }}
                  >
                    Continue to payment
                  </button>
                )}
              </div>
            )
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