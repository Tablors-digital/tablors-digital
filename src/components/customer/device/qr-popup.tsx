"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Image from "next/image";
import type { PaymentQrResult } from "@/server/modules/customer/actions";

export type QrState =
  | { status: "loading" }
  | { status: "done"; result: PaymentQrResult };

type QrPopupProps = {
  restaurantName: string;
  tableNumber: string | number;
  orderNumber: string;
  state: QrState;
  onRetry: () => void;
  onSimulatePayment: () => Promise<void>;
  onClose: () => void;
};

function money(value: number) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Payment QR. Renders INSIDE the device screen, in the right-hand slot where
 * "Your Order" normally sits (no full-screen overlay).
 */
export function QrPopup({
  restaurantName,
  tableNumber,
  orderNumber,
  state,
  onRetry,
  onSimulatePayment,
  onClose,
}: QrPopupProps) {
  const [simulating, setSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState("");

  async function handleSimulate() {
    if (simulating) return;
    setSimulating(true);
    setSimulateError("");
    try {
      await onSimulatePayment();
    } catch {
      setSimulateError("Could not record the demo payment. Please try again.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <section
      role="region"
      aria-labelledby="payment-qr-title"
      className="relative h-full overflow-y-auto overscroll-contain rounded-lg border border-amber-400/40 bg-[#101820] p-3 text-white sm:p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close payment panel"
        className="absolute right-3 top-3 rounded-full px-3 py-1 text-xl text-white/70 hover:bg-white/10"
      >
        ×
      </button>

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
          {restaurantName}
        </p>
        <h2 id="payment-qr-title" className="mt-2 text-2xl font-black tracking-widest">
          SCAN TO PAY
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Table {tableNumber} <span className="px-1">·</span> Order {orderNumber}
        </p>
      </div>

      {state.status === "loading" ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-amber-300/25 border-t-amber-300" />
          <p className="text-sm text-white/70">Preparing payment details…</p>
        </div>
      ) : !state.result.ok ? (
        <div className="my-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-center">
          <p className="font-semibold text-red-200">{state.result.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-amber-300 px-5 py-2 text-sm font-bold text-slate-950"
          >
            TRY AGAIN
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-xl bg-white p-4 text-center">
            {state.result.mode === "demo" ? (
              <QRCodeSVG
                value={state.result.qrValue}
                size={220}
                level="M"
                includeMargin
                className="mx-auto h-auto max-w-full"
              />
            ) : (
              <Image
                src={state.result.imageUrl}
                alt="Real payment QR code"
                width={220}
                height={220}
                unoptimized
                className="mx-auto h-auto w-[220px] max-w-full object-contain"
              />
            )}
          </div>

          <div className="mt-5 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-white/55">
              Amount payable
            </p>
            <p className="mt-1 text-4xl font-black text-amber-300">
              ₹{money(state.result.amountRupees)}
            </p>
          </div>

          {state.result.mode === "demo" ? (
            <div className="mt-5 rounded-xl border-2 border-dashed border-amber-300/70 bg-amber-300/10 p-4 text-center">
              <p className="text-sm font-black tracking-widest text-amber-200">
                DEMO MODE — NOT A REAL UPI QR
              </p>
              <p className="mt-2 text-xs leading-5 text-white/70">
                This QR only displays a demo reference. Scanning it will not
                transfer money or complete a real payment.
              </p>
              <button
                type="button"
                onClick={handleSimulate}
                disabled={simulating}
                className="mt-4 w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-black tracking-widest text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {simulating ? "RECORDING DEMO…" : "SIMULATE PAYMENT"}
              </button>
              {simulateError ? (
                <p role="alert" className="mt-2 text-xs text-red-200">
                  {simulateError}
                </p>
              ) : null}
              <p className="mt-2 text-[10px] text-white/50">
                Test only · No money will be collected
              </p>
            </div>
          ) : (
            <p className="mt-4 text-center text-xs leading-5 text-white/65">
              Scan this QR with your UPI app to complete payment. The order
              will be marked paid only after the payment gateway confirms it.
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
      >
        CLOSE
      </button>
    </section>
  );
}

type MenuQrPopupProps = {
  restaurantName: string;
  tableNumber: string | number;
  menuUrl: string;
  onClose: () => void;
};

export function MenuQrPopup({
  restaurantName,
  tableNumber,
  menuUrl,
  onClose,
}: MenuQrPopupProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-qr-title"
        className="relative w-full max-w-sm rounded-2xl border border-amber-400/40 bg-[#101820] p-4 sm:p-5 text-center text-white shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu QR popup"
          className="absolute right-3 top-3 rounded-full px-3 py-1 text-xl text-white/70 hover:bg-white/10"
        >
          ×
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
          {restaurantName}
        </p>
        <h2 id="menu-qr-title" className="mt-2 text-xl font-black tracking-widest">
          SCAN FOR MENU
        </h2>
        <p className="mt-1 text-sm text-white/60">Table {tableNumber}</p>
        <div className="mt-5 rounded-xl bg-white p-4">
          {menuUrl ? (
            <QRCodeSVG value={menuUrl} size={220} includeMargin className="mx-auto h-auto max-w-full" />
          ) : (
            <p className="p-4 sm:p-8 text-sm text-slate-700">Menu link is not available.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
        >
          CLOSE
        </button>
      </section>
    </div>
  );
}