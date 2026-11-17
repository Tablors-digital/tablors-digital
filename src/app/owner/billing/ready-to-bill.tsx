"use client";

import { useState } from "react";
import { ChevronDown, Receipt } from "lucide-react";

import { SubmitOnceButton } from "@/components/ui/submit-once-button";
import { computeBillBreakdown } from "@/lib/bill-breakdown";
import { createBill } from "@/server/modules/billing/actions";

export type ReadyOrder = {
  id: string;
  orderLabel: string;
  tableLabel: string;
  lines: { name: string; qty: number; priceRupees: number }[];
};

type Props = {
  orders: ReadyOrder[];
  canManage: boolean;
  defaultGst: number;
  gstMax: number;
  serviceMax: number;
  initialOpenId?: string | null;
};

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const inputCls =
  "mt-1 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#39ff6a]";

function BillForm({
  order,
  canManage,
  defaultGst,
  gstMax,
  serviceMax,
}: { order: ReadyOrder } & Omit<Props, "orders" | "initialOpenId">) {
  const [gst, setGst] = useState(String(defaultGst));
  const [service, setService] = useState("0");
  const [discount, setDiscount] = useState("0");

  const gstN = gst.trim() === "" ? NaN : Number(gst);
  const serviceN = service.trim() === "" ? NaN : Number(service);
  const discountN = discount.trim() === "" ? NaN : Number(discount);

  // Same shared maths the server uses when the bill is issued.
  const calc = computeBillBreakdown(
    order.lines,
    {
      gstPercent: Number.isFinite(gstN) ? gstN : 0,
      serviceChargePercent: Number.isFinite(serviceN) ? serviceN : 0,
    },
    Number.isFinite(discountN) ? discountN : 0,
  );
  const gross = calc.subtotal + calc.gst + calc.serviceCharge;

  let error: string | null = null;
  if (!Number.isFinite(gstN) || gstN < 0 || gstN > gstMax) {
    error = `GST must be 0 – ${gstMax}%.`;
  } else if (!Number.isFinite(serviceN) || serviceN < 0 || serviceN > serviceMax) {
    error = `Service charge must be 0 – ${serviceMax}%.`;
  } else if (!Number.isInteger(discountN) || discountN < 0) {
    error = "Discount must be a whole number of rupees (0 or more).";
  } else if (discountN > gross) {
    error = "Discount is larger than the bill amount.";
  }

  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between text-sm">
      <span className={strong ? "font-semibold text-zinc-100" : "text-zinc-400"}>{label}</span>
      <span className={strong ? "text-lg font-bold text-[#39ff6a]" : "text-zinc-200"}>{value}</span>
    </div>
  );

  return (
    <form action={createBill.bind(null, order.id)} className="border-t border-zinc-900 px-4 pb-4 pt-4">
      <ul className="space-y-1 text-xs text-zinc-400">
        {order.lines.map((l, i) => (
          <li key={`${l.name}-${i}`} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {l.name} × {l.qty}
            </span>
            <span className="shrink-0">{money(l.qty * l.priceRupees)}</span>
          </li>
        ))}
      </ul>

      {canManage ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <label className="block text-xs text-zinc-400">
              GST (%)
              <input
                type="number"
                name="gstPercent"
                value={gst}
                onChange={(e) => setGst(e.target.value)}
                min={0}
                max={gstMax}
                step={0.5}
                required
                className={inputCls}
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Service (%)
              <input
                type="number"
                name="serviceChargePercent"
                value={service}
                onChange={(e) => setService(e.target.value)}
                min={0}
                max={serviceMax}
                step={0.5}
                required
                className={inputCls}
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Discount (₹)
              <input
                type="number"
                name="discountRupees"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                min={0}
                step={1}
                required
                className={inputCls}
              />
            </label>
          </div>

          <div className="mt-4 space-y-1.5 rounded-xl bg-zinc-900/70 p-3">
            {row("Subtotal", money(calc.subtotal))}
            {row(`GST${Number.isFinite(gstN) ? ` (${gstN}%)` : ""}`, money(calc.gst))}
            {row(
              `Service charge${Number.isFinite(serviceN) ? ` (${serviceN}%)` : ""}`,
              money(calc.serviceCharge),
            )}
            {row("Discount", calc.discount > 0 ? `−${money(calc.discount)}` : money(0))}
            <div className="border-t border-zinc-800 pt-2">{row("Final total", money(calc.total), true)}</div>
          </div>

          {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}

          <div className="mt-4">
            {error ? (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-bold text-zinc-500 sm:w-auto"
              >
                Generate Bill
              </button>
            ) : (
              <SubmitOnceButton
                pendingLabel="Generating…"
                className="w-full rounded-lg bg-[#39ff6a] px-5 py-2.5 text-sm font-extrabold text-black shadow-[0_0_14px_rgba(57,255,106,0.3)] transition hover:brightness-110 active:scale-95 sm:w-auto"
              >
                Generate Bill
              </SubmitOnceButton>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">View only — only the owner can generate bills.</p>
      )}
    </form>
  );
}

export function ReadyToBill({ orders, initialOpenId, ...rest }: Props) {
  const [openId, setOpenId] = useState<string | null>(
    initialOpenId ?? (orders.length === 1 ? orders[0].id : null),
  );

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {orders.map((o) => {
        const open = openId === o.id;
        const subtotal = o.lines.reduce((s, l) => s + l.qty * l.priceRupees, 0);
        const itemCount = o.lines.reduce((s, l) => s + l.qty, 0);

        return (
          <div
            key={o.id}
            className={`self-start overflow-hidden rounded-2xl border bg-zinc-950 transition ${
              open ? "border-[#39ff6a]/60" : "border-zinc-800 hover:border-zinc-700"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : o.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-50">
                  {o.tableLabel} <span className="font-normal text-zinc-500">· {o.orderLabel}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {itemCount} item{itemCount === 1 ? "" : "s"} · Subtotal {money(subtotal)}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#39ff6a]">
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">{open ? "Close" : "Bill"}</span>
                <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
              </span>
            </button>

            {open && <BillForm order={o} {...rest} />}
          </div>
        );
      })}
    </div>
  );
}
