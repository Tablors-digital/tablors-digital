import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { istDay, todayIst, yesterdayIst } from "@/lib/day";
import { LiveRefresh } from "@/components/live/live-refresh";
import { SubmitOnceButton } from "@/components/ui/submit-once-button";
import { formatBillNo, formatOrderNo } from "@/lib/order-number";
import { DEMO_RESTAURANT_ID, getDemoRole } from "@/server/modules/auth/session";
import {
  getBillSummariesDb,
  getDailyCollectionDb,
  listBillsDb,
  listPaymentsDb,
  listRefundsDb,
} from "@/server/modules/billing/db-billing";
import { getTablesDb } from "@/server/modules/data/tables-db";
import { recordPaymentAction } from "@/server/modules/payments/actions";
import { PaymentsLedger, type LedgerRow, type LedgerStatus } from "./payments-ledger";

export const dynamic = "force-dynamic";

type SP = {
  notice?: string;
  bill?: string;
  status?: string;
  method?: string;
  q?: string;
  from?: string;
  to?: string;
  range?: string;
};
type PageProps = { searchParams: Promise<SP> };

const NOTICES: Record<string, [tone: "success" | "error", text: string]> = {
  paid: ["success", "Payment recorded. The bill is fully paid."],
  partial: ["success", "Part payment recorded. The table stays occupied until the balance is paid."],
  refunded: ["success", "Refund recorded against the original payment."],
  "already-paid": ["error", "This bill is already fully paid. Nothing was recorded."],
  overpayment: ["error", "That amount is more than the remaining balance."],
  "invalid-amount": ["error", "Enter a whole number of rupees, 1 or more."],
  "invalid-method": ["error", "Only cash and QR payments are accepted."],
  "missing-reference": ["error", "QR payments need a transaction ID / UTR."],
  "invalid-reference": ["error", "Enter a valid transaction ID (6–40 letters, digits, - _ / .)."],
  "duplicate-reference": ["error", "That transaction ID has already been used. Nothing was recorded."],
  "missing-bill": ["error", "That bill no longer exists."],
  "table-missing": ["error", "That bill's order or table no longer exists."],
  "missing-payment": ["error", "That payment no longer exists."],
  "refund-invalid-amount": ["error", "Refund amount must be a whole number of rupees, 1 or more."],
  "refund-invalid-reason": ["error", "Enter a refund reason of 3 to 200 characters."],
  "refund-exceeds": ["error", "Refund amount exceeds the refundable balance."],
  forbidden: ["error", "Only the restaurant owner can record payments or refunds."],
  invalid: ["error", "That request was invalid."],
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const shiftDay = (day: string, delta: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + delta * 86_400_000).toISOString().slice(0, 10);

const card = "rounded-2xl border border-zinc-800 bg-zinc-900/40";
const input =
  "mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 focus:border-[#d7fe3b] focus:outline-none";
const primaryBtn =
  "rounded-lg bg-[#d7fe3b] px-4 py-2 text-xs font-medium text-[#0a0a0a] transition-opacity hover:opacity-90";

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`${card} p-4 ${accent ? "border-[#d7fe3b]/40" : ""}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${accent ? "text-[#d7fe3b]" : "text-zinc-50"}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500 tabular-nums">{hint}</p>
    </div>
  );
}

export default async function PaymentsPage({ searchParams }: PageProps) {
  const role = await getDemoRole();
  if (role !== "owner" && role !== "admin") redirect("/login");
  const canManage = role === "owner";

  const sp = await searchParams;
  const notice = sp.notice ? NOTICES[sp.notice] : undefined;

  const today = todayIst();
  const yesterday = yesterdayIst();
  const weekStart = shiftDay(today, -6);

  const allTime = sp.range === "all";
  const from = allTime ? "" : isDay(sp.from) ? sp.from! : isDay(sp.to) ? "" : today;
  const to = allTime ? "" : isDay(sp.to) ? sp.to! : isDay(sp.from) ? "" : today;
  const status = ["paid", "partial", "refunded"].includes(sp.status ?? "") ? (sp.status as string) : "all";
  const method = ["cash", "qr"].includes(sp.method ?? "") ? (sp.method as string) : "all";
  const q = (sp.q ?? "").trim().toLowerCase();

  const [tables, bills, payments, refunds, collection] = await Promise.all([
    getTablesDb(DEMO_RESTAURANT_ID),
    listBillsDb(DEMO_RESTAURANT_ID),
    listPaymentsDb(DEMO_RESTAURANT_ID),
    listRefundsDb(DEMO_RESTAURANT_ID),
    getDailyCollectionDb(DEMO_RESTAURANT_ID),
  ]);
  const summaries = await getBillSummariesDb(DEMO_RESTAURANT_ID, bills);
  const billById = new Map(bills.map((b) => [b.id, b]));
  const tableLabel = (id: string) => tables.find((t) => t.id === id)?.label ?? id;

  const inRange = (day: string) => (!from || day >= from) && (!to || day <= to);

  const outstanding = bills.filter((b) => {
    const s = summaries.get(b.id)?.status;
    return s === "unpaid" || s === "partial";
  });
  const pendingRupees = outstanding.reduce((sum, b) => sum + (summaries.get(b.id)?.remainingRupees ?? 0), 0);

  // KPIs follow the selected date range.
  const rangePayments = payments.filter((p) => inRange(istDay(p.paidAt)));
  const rangeRefunds = refunds.filter((r) => inRange(istDay(r.refundedAt)));
  const grossRange = rangePayments.reduce((s, p) => s + p.amountRupees, 0);
  const refundRange = rangeRefunds.reduce((s, r) => s + r.amountRupees, 0);

  const rows: LedgerRow[] = rangePayments
    .map((p): LedgerRow | null => {
      const bill = billById.get(p.billId);
      const summary = bill ? summaries.get(bill.id) : undefined;
      const own = refunds.filter((r) => r.paymentId === p.id);
      const refunded = own.reduce((s, r) => s + r.amountRupees, 0);
      const rowStatus: LedgerStatus =
        refunded > 0 ? "refunded" : ((summary?.status as LedgerStatus | undefined) ?? "unpaid");
      const row: LedgerRow = {
        id: p.id,
        billId: p.billId,
        paidAt: fmtDateTime(p.paidAt),
        table: tableLabel(p.tableId),
        orderNo: formatOrderNo(bill?.orderNo),
        billNo: formatBillNo(bill?.billNo),
        method: p.method,
        transactionId: p.transactionId ?? null,
        amountRupees: p.amountRupees,
        refundedRupees: refunded,
        refundableRupees: p.amountRupees - refunded,
        status: rowStatus,
        billTotalRupees: summary?.totalRupees ?? 0,
        billPaidRupees: summary?.paidRupees ?? 0,
        refunds: own.map((r) => ({
          id: r.id,
          at: fmtDateTime(r.refundedAt),
          amountRupees: r.amountRupees,
          reason: r.reason,
        })),
      };
      if (status !== "all" && row.status !== status) return null;
      if (method !== "all" && row.method !== method) return null;
      if (q && ![row.transactionId, row.billNo, row.orderNo, row.table].some((v) => v?.toLowerCase().includes(q))) {
        return null;
      }
      return row;
    })
    .filter((r): r is LedgerRow => r !== null)
    .reverse();

  // Link builder keeps the other filters when one pill changes.
  const href = (patch: Partial<SP>) => {
    const next: Record<string, string | undefined> = {
      status: status === "all" ? undefined : status,
      method: method === "all" ? undefined : method,
      q: sp.q || undefined,
      from: sp.from,
      to: sp.to,
      range: sp.range,
      ...patch,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const s = params.toString();
    return `/owner/payments${s ? `?${s}` : ""}`;
  };

  const rangePills = [
    { label: "Today", active: !allTime && from === today && to === today, patch: { from: undefined, to: undefined, range: undefined } },
    { label: "Yesterday", active: !allTime && from === yesterday && to === yesterday, patch: { from: yesterday, to: yesterday, range: undefined } },
    { label: "7 days", active: !allTime && from === weekStart && to === today, patch: { from: weekStart, to: today, range: undefined } },
    { label: "All time", active: allTime, patch: { from: undefined, to: undefined, range: "all" } },
  ];

  const pillCls = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-[#d7fe3b] bg-[#d7fe3b] font-medium text-[#0a0a0a]"
        : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
    }`;

  return (
    <div className="space-y-8 text-zinc-100">
      <LiveRefresh intervalMs={10000} />

      <header>
        <h1 className="text-2xl font-semibold text-zinc-50">Payments</h1>
        {!canManage && (
          <p className="mt-1 text-xs text-zinc-500">View only. Only the restaurant owner can record payments or refunds.</p>
        )}
      </header>

      {notice && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
            notice[0] === "success"
              ? "border-[#d7fe3b]/40 bg-[#d7fe3b]/10 text-[#d7fe3b]"
              : "border-amber-400/40 bg-amber-400/10 text-amber-300"
          }`}
        >
          <p className="text-sm">{notice[1]}</p>
          <div className="flex items-center gap-2">
            {sp.bill && billById.has(sp.bill) && (
              <Link href={`/owner/billing/${sp.bill}`} className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium">
                View bill
              </Link>
            )}
            <Link href="/owner/payments" className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium">
              Dismiss
            </Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <Kpi
          accent
          label="Total collected"
          value={inr(grossRange - refundRange)}
          hint={`${rangePayments.length} payment${rangePayments.length === 1 ? "" : "s"} · gross ${inr(grossRange)}`}
        />
        <Kpi
          label="Pending"
          value={inr(pendingRupees)}
          hint={`${outstanding.length} open bill${outstanding.length === 1 ? "" : "s"}`}
        />
        <Kpi
          label="Refunds"
          value={inr(refundRange)}
          hint={`${rangeRefunds.length} refund${rangeRefunds.length === 1 ? "" : "s"} in range`}
        />
        <Kpi
          label="Today's volume"
          value={inr(collection.netRupees)}
          hint={`${collection.paymentCount} payments · cash ${inr(collection.byMethod.cash ?? 0)}`}
        />
      </section>

      {/* Outstanding bills */}
      <section>
        <h2 className="text-sm font-medium text-zinc-300">Outstanding bills</h2>
        {outstanding.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No unpaid bills. Generate a bill from Billing once an order is served.</p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {outstanding
              .slice()
              .reverse()
              .map((bill) => {
                const s = summaries.get(bill.id)!;
                return (
                  <div key={bill.id} id={`bill-${bill.id}`} className={`${card} scroll-mt-6 p-4 target:border-[#d7fe3b] sm:p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base text-zinc-50">{tableLabel(bill.tableId)}</p>
                        <Link
                          href={`/owner/billing/${bill.id}`}
                          className="text-xs text-zinc-400 tabular-nums underline-offset-2 hover:text-[#d7fe3b] hover:underline"
                        >
                          {formatOrderNo(bill.orderNo)} · {formatBillNo(bill.billNo)}
                        </Link>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          s.status === "partial"
                            ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                            : "border-zinc-600 bg-zinc-800/60 text-zinc-300"
                        }`}
                      >
                        {s.status === "partial" ? "Partial" : "Unpaid"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm tabular-nums">
                      <div><p className="text-xs text-zinc-500">Total</p><p>{inr(s.totalRupees)}</p></div>
                      <div><p className="text-xs text-zinc-500">Paid</p><p>{inr(s.paidRupees)}</p></div>
                      <div><p className="text-xs text-zinc-500">Remaining</p><p className="text-[#d7fe3b]">{inr(s.remainingRupees)}</p></div>
                    </div>

                    {canManage && (
                      <div className="mt-4 grid gap-4 border-t border-zinc-800 pt-4 sm:grid-cols-2">
                        <form action={recordPaymentAction} className="space-y-3">
                          <input type="hidden" name="billId" value={bill.id} />
                          <input type="hidden" name="method" value="cash" />
                          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                          <label className="block text-xs text-zinc-400">
                            Cash amount ₹
                            <input type="number" name="amountRupees" defaultValue={s.remainingRupees} min={1} max={s.remainingRupees} step={1} required className={input} />
                          </label>
                          <SubmitOnceButton className={primaryBtn} pendingLabel="Recording payment…">Pay by cash</SubmitOnceButton>
                        </form>

                        <form action={recordPaymentAction} className="space-y-3">
                          <input type="hidden" name="billId" value={bill.id} />
                          <input type="hidden" name="method" value="qr" />
                          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                          <label className="block text-xs text-zinc-400">
                            QR amount ₹
                            <input type="number" name="amountRupees" defaultValue={s.remainingRupees} min={1} max={s.remainingRupees} step={1} required className={input} />
                          </label>
                          <label className="block text-xs text-zinc-400">
                            Transaction ID / UTR
                            <input type="text" name="transactionId" minLength={6} maxLength={40} required autoComplete="off" className={input} />
                          </label>
                          <SubmitOnceButton className={primaryBtn} pendingLabel="Recording payment…">Record QR payment</SubmitOnceButton>
                        </form>

                        <p className="text-xs text-zinc-500 sm:col-span-2">
                          Enter less than the remaining amount for a part payment. The table is released only when the bill is fully paid. Each transaction ID can be used once.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Transactions */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-300">Transactions</h2>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {rangePills.map((p) => (
              <Link key={p.label} href={href(p.patch)} className={pillCls(p.active)}>{p.label}</Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {[["all", "All statuses"], ["paid", "Paid"], ["partial", "Partial"], ["refunded", "Refunded"]].map(([v, l]) => (
              <Link key={v} href={href({ status: v === "all" ? undefined : v })} className={pillCls(status === v)}>{l}</Link>
            ))}
            <span className="mx-1 hidden w-px bg-zinc-800 sm:block" />
            {[["all", "All methods"], ["cash", "Cash"], ["qr", "QR"]].map(([v, l]) => (
              <Link key={v} href={href({ method: v === "all" ? undefined : v })} className={pillCls(method === v)}>{l}</Link>
            ))}
          </div>

          <form action="/owner/payments" method="get" className="flex flex-wrap items-end gap-3">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            {method !== "all" && <input type="hidden" name="method" value={method} />}
            <label className="min-w-48 flex-1 text-xs text-zinc-500">
              Search
              <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Transaction ID, bill, order or table" className={input} />
            </label>
            <label className="text-xs text-zinc-500">
              From
              <input type="date" name="from" defaultValue={from} max={today} className={input} />
            </label>
            <label className="text-xs text-zinc-500">
              To
              <input type="date" name="to" defaultValue={to} max={today} className={input} />
            </label>
            <button type="submit" className={primaryBtn}>Apply</button>
          </form>
        </div>

        <PaymentsLedger rows={rows} canManage={canManage} />
        <p className="text-xs text-zinc-500">
          {rows.length} transaction{rows.length === 1 ? "" : "s"} shown. Refunds are recorded against the original payment and do not send money through a payment gateway.
        </p>
      </section>

      {/* Refund history */}
      <section>
        <h2 className="text-sm font-medium text-zinc-300">Refund history</h2>
        <div className={`${card} mt-3 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <tr>
                {["Refunded at", "Bill", "Amount", "Reason", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rangeRefunds.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-zinc-500">No refunds in this date range.</td></tr>
              )}
              {rangeRefunds
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/70 last:border-0">
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{fmtDateTime(r.refundedAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/owner/billing/${r.billId}`} className="text-zinc-200 tabular-nums hover:text-[#d7fe3b]">
                        {formatBillNo(billById.get(r.billId)?.billNo)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-50 tabular-nums">{inr(r.amountRupees)}</td>
                    <td className="px-4 py-3 text-zinc-400">{r.reason}</td>
                    <td className="px-4 py-3 capitalize text-zinc-300">{r.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}