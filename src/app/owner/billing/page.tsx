import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, IndianRupee, Receipt, Wallet } from "lucide-react";

import { DayPicker } from "@/components/ui/day-picker";
import { istDay, resolveDay, todayIst, yesterdayIst } from "@/lib/day";
import { LiveRefresh } from "@/components/live/live-refresh";
import { getDemoRole, DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { getBillSummariesDb, listBillsDb } from "@/server/modules/billing/db-billing";
import { getTablesDb } from "@/server/modules/data/tables-db";
import { listAllOrders } from "@/server/modules/orders/db-orders";
import { BILL_LIMITS, DEFAULT_GST_PERCENT } from "@/server/modules/demo-store/store";
import { formatBillNo, formatOrderNo } from "@/lib/order-number";
import { ReadyToBill, type ReadyOrder } from "./ready-to-bill";
import { BillPrintButton } from "./bill-print-button";

// Orders and bills change constantly — never prerender.
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ notice?: string; bill?: string; tableId?: string; date?: string }>;
};

type Notice = { tone: "success" | "error"; text: string };

function getNotice(code: string | undefined): Notice | null {
  switch (code) {
    case "billed":
      return { tone: "success", text: "Bill generated. The table stays occupied until the bill is fully paid." };
    case "duplicate":
      return { tone: "error", text: "This order already has a bill. No second bill was created." };
    case "not-served":
      return { tone: "error", text: "Only served orders can be billed. Mark the order Served in Live Orders first." };
    case "missing":
      return { tone: "error", text: "That order no longer exists." };
    case "table-missing":
      return { tone: "error", text: "That order's table no longer exists." };
    case "empty":
      return { tone: "error", text: "This order has no billable amount." };
    case "invalid-gst":
      return { tone: "error", text: `GST must be a number from 0 to ${BILL_LIMITS.gstMaxPercent}.` };
    case "invalid-service-charge":
      return {
        tone: "error",
        text: `Service charge must be a number from 0 to ${BILL_LIMITS.serviceChargeMaxPercent}.`,
      };
    case "invalid-discount":
      return { tone: "error", text: "Discount must be a whole number of rupees, 0 or more." };
    case "discount-too-large":
      return { tone: "error", text: "Discount is larger than the bill amount." };
    case "invalid":
      return { tone: "error", text: "That request was invalid." };
    case "forbidden":
      return { tone: "error", text: "Only the restaurant owner can generate bills." };
    default:
      return null;
  }
}

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "paid":
      return { label: "Paid", className: "border-[#39ff6a]/50 bg-[#39ff6a]/10 text-[#39ff6a]" };
    case "partial":
      return { label: "Partial", className: "border-sky-400/50 bg-sky-400/10 text-sky-300" };
    case "refunded":
      return { label: "Refunded", className: "border-zinc-600 bg-zinc-800/60 text-zinc-300" };
    default:
      return { label: "Unpaid", className: "border-amber-400/50 bg-amber-400/10 text-amber-300" };
  }
}

export default async function BillingPage({ searchParams }: PageProps) {
  const role = await getDemoRole();
  if (role !== "owner" && role !== "admin") {
    redirect("/login");
  }
  // Only the owner may change anything; admin gets a read-only view.
  const canManage = role === "owner";

  const { notice, bill: noticeBillId, tableId, date } = await searchParams;

  const [tables, bills, orders] = await Promise.all([
    getTablesDb(DEMO_RESTAURANT_ID),
    listBillsDb(DEMO_RESTAURANT_ID),
    listAllOrders(DEMO_RESTAURANT_ID),
  ]);
  const summaries = await getBillSummariesDb(DEMO_RESTAURANT_ID, bills);

  const today = todayIst();
  const selectedDay = resolveDay(date);
  const isToday = selectedDay === today;

  const dayBills = bills
    .filter((b) => b.createdAt === undefined || istDay(b.createdAt) === selectedDay)
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const filterTable = tableId ? (tables.find((t) => t.id === tableId) ?? null) : null;

  // Only orders the owner has marked "Served" can be billed. Orders that
  // already have a bill are "billed", so they never appear here twice.
  const billable = orders
    .filter((o) => o.status === "served" && (filterTable ? o.tableId === filterTable.id : true))
    .sort((a, b) => a.createdAt - b.createdAt);

  const readyOrders: ReadyOrder[] = billable.map((o) => ({
    id: o.id,
    orderLabel: formatOrderNo(o.orderNo),
    tableLabel: tables.find((t) => t.id === o.tableId)?.label ?? o.tableId,
    lines: o.lines.map((l) => ({ name: l.name, qty: l.qty, priceRupees: l.priceRupees })),
  }));

  const orderById = new Map(orders.map((o) => [o.id, o]));

  // Summary cards follow the selected day.
  let collected = 0;
  let pending = 0;
  for (const b of dayBills) {
    const s = summaries.get(b.id);
    if (!s) continue;
    collected += s.paidRupees - s.refundedRupees;
    if (s.status === "unpaid" || s.status === "partial") pending += s.remainingRupees;
  }

  const cards = [
    { label: "Ready to Bill", value: String(readyOrders.length), icon: Receipt },
    { label: isToday ? "Bills Today" : "Bills", value: String(dayBills.length), icon: FileText },
    { label: "Collected", value: money(collected), icon: Wallet },
    { label: "Pending", value: money(pending), icon: IndianRupee },
  ];

  const noticeData = getNotice(typeof notice === "string" ? notice : undefined);
  const noticeBill = noticeBillId ? (bills.find((b) => b.id === noticeBillId) ?? null) : null;

  return (
    <div className="space-y-5">
      <LiveRefresh intervalMs={10000} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Billing</h1>
        {!canManage && (
          <p className="mt-1 text-xs text-zinc-500">
            View only. Only the restaurant owner can generate bills or record payments.
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#39ff6a]/10 text-[#39ff6a]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="truncate text-lg font-semibold text-zinc-50">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 pb-4">
        <DayPicker value={selectedDay} today={today} yesterday={yesterdayIst()} />
      </div>

      {noticeData && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            noticeData.tone === "success"
              ? "border-[#39ff6a]/50 bg-[#39ff6a]/10 text-[#39ff6a]"
              : "border-amber-400/50 bg-amber-400/10 text-amber-300"
          }`}
        >
          <p className="flex items-center gap-2 text-sm">
            {noticeData.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {noticeData.text}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {noticeBill && (
              <Link
                href={`/owner/billing/${noticeBill.id}`}
                className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium"
              >
                View bill →
              </Link>
            )}
            {noticeBill && canManage && (
              <Link
                href={`/owner/payments#bill-${noticeBill.id}`}
                className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium"
              >
                Take payment →
              </Link>
            )}
            <Link href="/owner/billing" className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium">
              Dismiss
            </Link>
          </div>
        </div>
      )}

      {/* Ready to bill */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-200">
            Ready to Bill{filterTable ? ` — ${filterTable.label}` : ""}
            <span className="ml-2 text-xs font-normal text-zinc-500">{readyOrders.length}</span>
          </h2>
          {filterTable && (
            <Link href="/owner/billing" className="text-xs text-[#39ff6a]">
              Show all tables
            </Link>
          )}
        </div>

        {readyOrders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-500">
            {filterTable
              ? `No served orders to bill for ${filterTable.label}.`
              : "No served orders waiting. Mark an order Served in Live Orders and it will show up here."}
          </p>
        ) : (
          <ReadyToBill
            orders={readyOrders}
            canManage={canManage}
            defaultGst={DEFAULT_GST_PERCENT}
            gstMax={BILL_LIMITS.gstMaxPercent}
            serviceMax={BILL_LIMITS.serviceChargeMaxPercent}
            initialOpenId={filterTable ? readyOrders[0]?.id : null}
          />
        )}
      </section>

      {/* Bills history */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Bills History
          <span className="ml-2 text-xs font-normal text-zinc-500">{dayBills.length}</span>
        </h2>

        {dayBills.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-500">
            {isToday ? "No bills generated yet today." : "No bills on this day."}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950 md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Order</th>
                    <th className="px-3 py-3 font-medium">Table</th>
                    <th className="px-3 py-3 font-medium">Items</th>
                    <th className="px-3 py-3 text-right font-medium">Subtotal</th>
                    <th className="px-3 py-3 text-right font-medium">GST</th>
                    <th className="px-3 py-3 text-right font-medium">Service</th>
                    <th className="px-3 py-3 text-right font-medium">Discount</th>
                    <th className="px-3 py-3 text-right font-medium">Total</th>
                    <th className="px-3 py-3 font-medium">Payment</th>
                    <th className="px-3 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {dayBills.map((bill) => {
                    const table = tables.find((t) => t.id === bill.tableId);
                    const summary = summaries.get(bill.id)!;
                    const badge = statusBadge(summary.status);
                    const outstanding = summary.status === "unpaid" || summary.status === "partial";
                    const items = (orderById.get(bill.orderId)?.lines ?? [])
                      .map((l) => `${l.name} ×${l.qty}`)
                      .join(", ");

                    return (
                      <tr key={bill.id} className="border-b border-zinc-900 last:border-0 hover:bg-zinc-900/40">
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-300">
                          {formatOrderNo(bill.orderNo)}
                          <span className="block text-[11px] text-zinc-600">{formatBillNo(bill.billNo)}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-300">{table?.label ?? bill.tableId}</td>
                        <td className="max-w-[200px] px-3 py-3 text-xs text-zinc-400">
                          <span className="line-clamp-2" title={items}>
                            {items || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-zinc-300">{money(bill.subtotalRupees)}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{money(bill.gstRupees)}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{money(bill.serviceChargeRupees)}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">
                          {bill.discountRupees > 0 ? `−${money(bill.discountRupees)}` : money(0)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-zinc-50">{money(bill.totalRupees)}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                          {outstanding && (
                            <span className="mt-1 block text-[11px] text-zinc-500">
                              Balance {money(summary.remainingRupees)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {outstanding && canManage && (
                              <Link
                                href={`/owner/payments#bill-${bill.id}`}
                                className="rounded-lg bg-[#39ff6a] px-3 py-1.5 text-xs font-bold text-black hover:brightness-110"
                              >
                                Pay
                              </Link>
                            )}
                            <Link
                              href={`/owner/billing/${bill.id}`}
                              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-600"
                            >
                              View
                            </Link>
                            <BillPrintButton billId={bill.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {dayBills.map((bill) => {
                const table = tables.find((t) => t.id === bill.tableId);
                const summary = summaries.get(bill.id)!;
                const badge = statusBadge(summary.status);
                const outstanding = summary.status === "unpaid" || summary.status === "partial";
                const items = (orderById.get(bill.orderId)?.lines ?? [])
                  .map((l) => `${l.name} ×${l.qty}`)
                  .join(", ");

                return (
                  <div key={bill.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-50">
                          {table?.label ?? bill.tableId}{" "}
                          <span className="font-normal text-zinc-500">· {formatOrderNo(bill.orderNo)}</span>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{items || "—"}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {[
                        ["Subtotal", money(bill.subtotalRupees)],
                        ["GST", money(bill.gstRupees)],
                        ["Service", money(bill.serviceChargeRupees)],
                        ["Discount", bill.discountRupees > 0 ? `−${money(bill.discountRupees)}` : money(0)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <dt className="text-zinc-500">{k}</dt>
                          <dd className="text-zinc-300">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-3 flex items-center justify-between border-t border-zinc-900 pt-3">
                      <div>
                        <p className="text-lg font-bold text-[#39ff6a]">{money(bill.totalRupees)}</p>
                        {outstanding && (
                          <p className="text-[11px] text-zinc-500">Balance {money(summary.remainingRupees)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {outstanding && canManage && (
                          <Link
                            href={`/owner/payments#bill-${bill.id}`}
                            className="rounded-lg bg-[#39ff6a] px-3 py-1.5 text-xs font-bold text-black"
                          >
                            Pay
                          </Link>
                        )}
                        <Link
                          href={`/owner/billing/${bill.id}`}
                          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200"
                        >
                          View
                        </Link>
                        <BillPrintButton billId={bill.id} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
