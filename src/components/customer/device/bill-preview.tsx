"use client";

import type { CartLine } from "@/components/customer/cart-context";
import {
  computeBillBreakdown,
  normaliseRates,
  type BillRates,
} from "@/lib/bill-breakdown";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const pctLabel = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(1)}%`;

/**
 * Provisional bill shown on the device when the customer presses BILL GEN
 * before the kitchen has marked the order served. The real bill can only be
 * issued after that (server rule), so this is clearly labelled as an estimate
 * and writes nothing. It uses the same maths and rates as the issued bill.
 */
export function BillPreview({
  restaurantName,
  tableLabel,
  orderId,
  lines,
  rates,
  onClose,
}: {
  restaurantName: string;
  tableLabel: string;
  orderId: string;
  lines: CartLine[];
  rates: Partial<BillRates>;
  onClose: () => void;
}) {
  const r = normaliseRates(rates);
  const b = computeBillBreakdown(lines, r);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const previewNo = `PRE-${orderId.slice(-6).toUpperCase()}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bill"
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border p-4 sm:p-5"
        style={{ background: "var(--device-shell)", borderColor: "var(--device-gold)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--device-gold)" }}>
              BILL {previewNo}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--device-lcd-muted)" }}>
              Provisional — final bill is issued once your order is served
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1 text-xs"
            style={{ color: "var(--device-lcd-text)", borderColor: "var(--device-shell-border)" }}
          >
            Close
          </button>
        </div>

        <div
          className="mt-4 rounded-xl border p-4 text-xs"
          style={{
            borderColor: "var(--device-shell-border)",
            background: "var(--device-lcd-bg)",
            color: "var(--device-lcd-text)",
          }}
        >
          <p className="text-center text-sm font-bold" style={{ color: "var(--device-gold)" }}>
            {restaurantName}
          </p>
          <p className="mt-0.5 text-center" style={{ color: "var(--device-lcd-muted)" }}>
            Bill estimate
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
            <dt style={{ color: "var(--device-lcd-muted)" }}>Bill no.</dt>
            <dd className="text-right font-semibold">{previewNo}</dd>
            <dt style={{ color: "var(--device-lcd-muted)" }}>Order no.</dt>
            <dd className="text-right font-semibold">#{orderId}</dd>
            <dt style={{ color: "var(--device-lcd-muted)" }}>Table</dt>
            <dd className="text-right font-semibold">{tableLabel}</dd>
          </dl>

          <table className="mt-3 w-full">
            <thead>
              <tr style={{ color: "var(--device-lcd-muted)" }}>
                <th className="pb-1 text-left font-normal">Item</th>
                <th className="pb-1 text-right font-normal">Qty</th>
                <th className="pb-1 text-right font-normal">Price</th>
                <th className="pb-1 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.code}
                  className="border-t"
                  style={{ borderColor: "var(--device-shell-border)" }}
                >
                  <td className="py-1 pr-2">{line.name}</td>
                  <td className="py-1 text-right">{line.qty}</td>
                  <td className="py-1 text-right">{inr(line.priceRupees)}</td>
                  <td className="py-1 text-right">{inr(line.qty * line.priceRupees)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            className="mt-2 space-y-1 border-t pt-2"
            style={{ borderColor: "var(--device-shell-border)" }}
          >
            <Row label={`Subtotal (${itemCount} items)`} value={inr(b.subtotal)} />
            <Row label={`GST (${pctLabel(r.gstPercent)})`} value={inr(b.gst)} />
            <Row
              label={`Additional tax (${pctLabel(r.additionalTaxPercent)})`}
              value={inr(b.additionalTax)}
            />
            <Row
              label={`Service charge (${pctLabel(r.serviceChargePercent)})`}
              value={inr(b.serviceCharge)}
            />
          </div>

          <div
            className="mt-3 flex items-center justify-between rounded-lg border px-3 py-2.5"
            style={{ borderColor: "var(--device-gold)", background: "rgba(212,175,55,0.1)" }}
          >
            <span className="text-[11px] font-bold uppercase tracking-widest">
              Final payable
            </span>
            <span className="text-xl font-bold" style={{ color: "var(--device-gold)" }}>
              {inr(b.total)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md py-3 text-sm font-semibold"
          style={{ background: "var(--device-gold)", color: "#171a10" }}
        >
          Close Bill
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: "var(--device-lcd-muted)" }}>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
