"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SubmitOnceButton } from "@/components/ui/submit-once-button";
import { refundPaymentAction } from "@/server/modules/payments/actions";

export type LedgerStatus = "paid" | "partial" | "unpaid" | "refunded";

export type LedgerRow = {
  id: string;
  billId: string;
  paidAt: string; // preformatted, IST
  table: string;
  orderNo: string;
  billNo: string;
  method: "cash" | "qr" | string;
  transactionId: string | null;
  amountRupees: number;
  refundedRupees: number;
  refundableRupees: number;
  status: LedgerStatus;
  billTotalRupees: number;
  billPaidRupees: number;
  refunds: { id: string; at: string; amountRupees: number; reason: string }[];
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const ACCENT = "#d7fe3b";

const BADGES: Record<LedgerStatus, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "border-[#d7fe3b]/40 bg-[#d7fe3b]/10 text-[#d7fe3b]" },
  partial: { label: "Partial", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  unpaid: { label: "Unpaid", cls: "border-zinc-600 bg-zinc-800/60 text-zinc-300" },
  refunded: { label: "Refunded", cls: "border-rose-400/40 bg-rose-400/10 text-rose-300" },
};

function StatusBadge({ status }: { status: LedgerStatus }) {
  const b = BADGES[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>
      {b.label}
    </span>
  );
}

function MethodIcon({ method, className = "h-4 w-4" }: { method: string; className?: string }) {
  if (method === "qr") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </svg>
  );
}

const methodName = (m: string) => (m === "qr" ? "QR" : m === "cash" ? "Cash" : m);

export function PaymentsLedger({ rows, canManage }: { rows: LedgerRow[]; canManage: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const selected = rows.find((r) => r.id === openId) ?? null;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [selected]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
        <p className="text-sm text-zinc-300">No payments match these filters.</p>
        <p className="mt-1 text-xs text-zinc-500">Widen the date range or clear the search to see more.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <tr>
              {["Paid at", "Table", "Order", "Bill", "Method", "Amount", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer border-b border-zinc-800/70 transition-colors last:border-0 hover:bg-zinc-800/40"
              >
                <td className="px-4 py-3 text-zinc-400 tabular-nums">{r.paidAt}</td>
                <td className="px-4 py-3 text-zinc-200">{r.table}</td>
                <td className="px-4 py-3 text-zinc-400 tabular-nums">{r.orderNo}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/owner/billing/${r.billId}`}
                    className="text-zinc-200 tabular-nums underline-offset-2 hover:text-[#d7fe3b] hover:underline"
                  >
                    {r.billNo}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-zinc-300">
                    <MethodIcon method={r.method} className="h-4 w-4 text-zinc-500" />
                    {methodName(r.method)}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-zinc-50 tabular-nums">
                  {inr(r.amountRupees)}
                  {r.refundedRupees > 0 && (
                    <span className="ml-2 text-xs font-normal text-rose-300">−{inr(r.refundedRupees)}</span>
                  )}
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}
                    className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-[#d7fe3b] hover:text-[#d7fe3b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d7fe3b]"
                  >
                    Receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(r.id)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d7fe3b]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-zinc-50 tabular-nums">{inr(r.amountRupees)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{r.table} · {r.paidAt}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <MethodIcon method={r.method} className="h-3.5 w-3.5" />
                  {methodName(r.method)}
                </span>
                <span className="tabular-nums">{r.orderNo} · {r.billNo}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Slide-over receipt */}
      {selected && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Payment receipt">
          <button
            type="button"
            aria-label="Close receipt"
            onClick={() => setOpenId(null)}
            className="absolute inset-0 bg-black/70"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
              <div>
                <p className="text-xs text-zinc-500">Receipt</p>
                <p className="mt-1 text-3xl font-semibold text-zinc-50 tabular-nums">{inr(selected.amountRupees)}</p>
                <div className="mt-2"><StatusBadge status={selected.status} /></div>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-[#d7fe3b] hover:text-[#d7fe3b]"
              >
                Close
              </button>
            </header>

            <div className="space-y-6 p-5">
              <dl className="divide-y divide-zinc-800/80 rounded-2xl border border-zinc-800 text-sm">
                {[
                  ["Paid at", selected.paidAt],
                  ["Table", selected.table],
                  ["Order", selected.orderNo],
                  ["Bill", selected.billNo],
                  ["Bill total", inr(selected.billTotalRupees)],
                  ["Paid on bill", inr(selected.billPaidRupees)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="text-zinc-100 tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <section className="rounded-2xl border border-zinc-800 p-4">
                <div className="flex items-center gap-2 text-sm text-zinc-200">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#d7fe3b]/10 text-[#d7fe3b]">
                    <MethodIcon method={selected.method} className="h-4 w-4" />
                  </span>
                  {selected.method === "qr" ? "QR payment" : "Cash payment"}
                </div>
                {selected.method === "qr" && (
                  <div className="mt-4">
                    <p className="text-xs text-zinc-500">Transaction ID / UTR</p>
                    <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <code className="break-all text-sm text-zinc-100">{selected.transactionId ?? "—"}</code>
                      {selected.transactionId && (
                        <button
                          type="button"
                          onClick={() => copy(selected.transactionId!)}
                          className="shrink-0 text-xs text-[#d7fe3b] hover:underline"
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {selected.refunds.length > 0 && (
                <section>
                  <h3 className="text-sm text-zinc-300">Refunds</h3>
                  <ul className="mt-2 space-y-2">
                    {selected.refunds.map((f) => (
                      <li key={f.id} className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm">
                        <div className="flex justify-between text-rose-200 tabular-nums">
                          <span>{inr(f.amountRupees)}</span>
                          <span className="text-xs text-zinc-500">{f.at}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{f.reason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {canManage && selected.refundableRupees > 0 && (
                <form action={refundPaymentAction} className="space-y-3 rounded-2xl border border-zinc-800 p-4">
                  <h3 className="text-sm text-zinc-200">Refund this payment</h3>
                  <input type="hidden" name="paymentId" value={selected.id} />
                  <label className="block text-xs text-zinc-400">
                    Amount ₹ (max {inr(selected.refundableRupees)})
                    <input
                      type="number"
                      name="amountRupees"
                      defaultValue={selected.refundableRupees}
                      min={1}
                      max={selected.refundableRupees}
                      step={1}
                      required
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 focus:border-[#d7fe3b] focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Reason
                    <input
                      type="text"
                      name="reason"
                      minLength={3}
                      maxLength={200}
                      required
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 focus:border-[#d7fe3b] focus:outline-none"
                    />
                  </label>
                  <SubmitOnceButton
                    className="w-full rounded-lg bg-rose-400 px-4 py-2 text-sm font-medium text-[#0a0a0a] hover:opacity-90"
                    pendingLabel="Refunding…"
                  >
                    Confirm refund
                  </SubmitOnceButton>
                  <p className="text-xs text-zinc-500">
                    This records the refund only. No money moves through a payment gateway.
                  </p>
                </form>
              )}

              <Link
                href={`/owner/billing/${selected.billId}`}
                className="block rounded-lg px-4 py-2.5 text-center text-sm font-medium text-[#0a0a0a]"
                style={{ backgroundColor: ACCENT }}
              >
                Open bill
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}