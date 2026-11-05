"use client";

import type { BillView } from "@/server/modules/customer/snapshot";
import type { CustomerBillState } from "@/server/modules/customer/actions";
import { LoyaltyBox, type LoyaltyHandlers } from "./loyalty-box";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const pct = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(2).replace(/0+$/, "")}%`;

function when(ms: number) {
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const muted = { color: "var(--device-lcd-muted)" } as const;
const text = { color: "var(--device-lcd-text)" } as const;
const rule = { borderColor: "var(--device-shell-border)" } as const;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[13px]">
      <span style={muted}>{label}</span>
      <span className={strong ? "font-bold" : "font-medium"} style={text}>
        {value}
      </span>
    </div>
  );
}

/**
 * The customer's bill popup. Every figure comes from the server (BillView), so
 * what is shown is exactly what is charged and what the QR will ask for:
 * items -> subtotal -> GST -> additional tax -> service charge -> discount -> payable.
 */
export function BillPopup({
  bill,
  busy,
  loyaltyState,
  loyalty,
  onPay,
  onClose,
}: {
  bill: BillView;
  busy?: boolean;
  loyaltyState?: CustomerBillState | null;
  loyalty?: LoyaltyHandlers;
  onPay: () => void;
  onClose: () => void;
}) {
  const paid = bill.status === "paid";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Bill">
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border p-5"
        style={{ background: "var(--device-shell)", borderColor: "var(--device-gold)" }}
      >
        <div className="text-center">
          <p className="text-lg font-bold tracking-wide" style={{ color: "var(--device-gold)" }}>
            {bill.restaurantName}
          </p>
          <p className="text-[11px] uppercase tracking-widest" style={muted}>
            {bill.kind === "issued" ? "Tax invoice" : "Bill estimate"}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-y py-2 text-[12px]" style={rule}>
          <span style={muted}>Order No</span>
          <span className="text-right font-semibold" style={text}>{bill.orderNumber}</span>
          <span style={muted}>Bill No</span>
          <span className="text-right font-semibold" style={text}>{bill.billNumber ?? "—"}</span>
          <span style={muted}>Table</span>
          <span className="text-right font-semibold" style={text}>{bill.tableNumber}</span>
          <span style={muted}>Date &amp; time</span>
          <span className="text-right font-semibold" style={text}>{when(bill.at)}</span>
        </div>

        <table className="mt-3 w-full text-[12px]" style={text}>
          <thead>
            <tr style={muted}>
              <th className="pb-1 text-left font-normal">Item</th>
              <th className="pb-1 text-right font-normal">Qty</th>
              <th className="pb-1 text-right font-normal">Price</th>
              <th className="pb-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={`${l.code}-${l.unitRupees}`} className="border-t" style={rule}>
                <td className="py-1 pr-2">{l.name}</td>
                <td className="py-1 text-right">{l.qty}</td>
                <td className="py-1 text-right">{inr(l.unitRupees)}</td>
                <td className="py-1 text-right font-medium">{inr(l.lineRupees)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 border-t pt-2" style={rule}>
          <Row label="Subtotal" value={inr(bill.subtotal)} />
          <Row label={`GST (${pct(bill.gst.percent)})`} value={inr(bill.gst.amount)} />
          {bill.additionalTax.amount > 0 && (
            <Row label={`${bill.additionalTax.label} (${pct(bill.additionalTax.percent)})`} value={inr(bill.additionalTax.amount)} />
          )}
          {bill.serviceCharge.amount > 0 && (
            <Row label={`Service charge (${pct(bill.serviceCharge.percent)})`} value={inr(bill.serviceCharge.amount)} />
          )}
          {bill.discount > 0 && <Row label="Discount" value={`− ${inr(bill.discount)}`} />}
        </div>

        <div
          className="mt-3 rounded-xl border p-3 text-center"
          style={{ borderColor: "var(--device-gold)", background: "var(--device-lcd-bg)" }}
        >
          <p className="text-[11px] uppercase tracking-widest" style={muted}>
            {paid ? "Total paid" : "Final amount payable"}
          </p>
          <p className="text-3xl font-extrabold" style={{ color: "var(--device-gold)" }} data-testid="bill-total">
            {inr(bill.total)}
          </p>
          {bill.status === "partial" && (
            <p className="mt-1 text-xs" style={muted}>
              Paid {inr(bill.paid)} · Balance {inr(bill.remaining)}
            </p>
          )}
        </div>

        {bill.kind === "provisional" && (
          <p className="mt-2 text-center text-[11px]" style={muted}>
            Estimate for your current order. Press BILL GEN to issue the final bill.
          </p>
        )}

        {loyaltyState && loyalty && <LoyaltyBox bill={loyaltyState} handlers={loyalty} />}

        {paid ? (
          <p className="mt-4 rounded-lg border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "var(--device-gold)", color: "var(--device-gold)" }}>
            Payment successful. Thank you for dining with us.
          </p>
        ) : (
          bill.kind === "issued" && (
            <button
              type="button"
              onClick={onPay}
              disabled={busy}
              className="mt-4 w-full rounded-md py-3 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
              style={{ background: "var(--device-gold)", color: "#171a10" }}
            >
              Scan to pay
            </button>
          )
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-md border py-2.5 text-sm font-semibold"
          style={{ ...rule, ...text }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
