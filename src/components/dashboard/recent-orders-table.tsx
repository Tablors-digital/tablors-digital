import Link from "next/link";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import {
  getTablesCached,
  listAllOrdersCached,
  listBillsCached,
} from "@/server/modules/data/request-reads";
import { StatusPill } from "./status-pill";
import { SectionHeader } from "./section-header";
import { formatOrderNo } from "@/lib/order-number";

const LIMIT = 8;

function PaymentPill({ state }: { state: "paid" | "pending" | "unbilled" }) {
  const cfg = {
    paid: { label: "Paid", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
    pending: { label: "Payment due", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400", dot: "bg-amber-400" },
    unbilled: { label: "Not billed", cls: "border-[var(--ov-border)] bg-white/[0.03] text-[var(--ov-muted)]", dot: "bg-[var(--ov-muted)]" },
  }[state];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/**
 * Latest orders, newest first. Sorted on the real order creation timestamp
 * (ties broken by the order number), never on id. The owner overview mounts
 * LiveRefresh, so a new order appears at the top without a manual refresh.
 */
export async function RecentOrdersTable() {
  const [tables, allOrders, bills] = await Promise.all([
    getTablesCached(DEMO_RESTAURANT_ID),
    listAllOrdersCached(DEMO_RESTAURANT_ID),
    listBillsCached(DEMO_RESTAURANT_ID),
  ]);
  const billByOrder = new Map(bills.map((b) => [b.orderId, b]));
  const orders = [...allOrders]
    .sort((a, b) => b.createdAt - a.createdAt || (b.orderNo ?? 0) - (a.orderNo ?? 0))
    .slice(0, LIMIT);

  return (
    <div className="rounded-xl border border-[var(--ov-border)] bg-[var(--ov-surface)] p-3 sm:p-5">
      <SectionHeader title="Latest Orders" subtitle="Newest first · updates automatically" href="/owner/orders" />

      <div className="mt-3 overflow-x-auto sm:mt-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--ov-muted)]">
              <th className="pb-2 pr-2 font-medium">Order</th>
              <th className="pb-2 pr-2 font-medium">Table</th>
              <th className="pb-2 pr-2 font-medium">Items</th>
              <th className="pb-2 pr-2 text-right font-medium">Qty</th>
              <th className="pb-2 pr-2 text-right font-medium">Total</th>
              <th className="pb-2 pr-2 font-medium">Payment</th>
              <th className="pb-2 pr-2 font-medium">Status</th>
              <th className="pb-2 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => {
              const table = tables.find((t) => t.id === order.tableId);
              const total = order.lines.reduce((sum, l) => sum + l.qty * l.priceRupees, 0);
              const qty = order.lines.reduce((sum, l) => sum + l.qty, 0);
              const itemsText = order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ");
              const bill = billByOrder.get(order.id);
              const payment = !bill ? "unbilled" : bill.paidAt ? "paid" : "pending";
              // Billed orders no longer show on the live Orders list; send those to Billing.
              const href = order.status === "billed" ? "/owner/billing" : `/owner/orders#${order.id}`;
              const cell = "py-2.5 pr-2 align-middle";

              return (
                <tr
                  key={order.id}
                  className={`border-t border-[var(--ov-border)] transition-colors hover:bg-[var(--ov-icon-surface)] ${
                    index === 0 ? "bg-[var(--ov-icon-surface)]/60" : ""
                  }`}
                >
                  <td className={`${cell} whitespace-nowrap font-medium text-[var(--ov-text)]`}>
                    <Link href={href} className="hover:underline">
                      {formatOrderNo(order.orderNo)}
                    </Link>
                  </td>
                  <td className={`${cell} whitespace-nowrap text-[var(--ov-text)]`}>{table?.label ?? order.tableId}</td>
                  <td className={`${cell} max-w-[14rem] truncate text-[var(--ov-text-secondary)]`} title={itemsText}>
                    {itemsText || "—"}
                  </td>
                  <td className={`${cell} text-right text-[var(--ov-text-secondary)]`}>{qty}</td>
                  <td className={`${cell} whitespace-nowrap text-right text-[var(--ov-text)]`}>₹{total}</td>
                  <td className={cell}>
                    <PaymentPill state={payment} />
                  </td>
                  <td className={cell}>
                    <StatusPill status={order.status} pulse={order.status === "new"} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right align-middle text-[var(--ov-text-secondary)]">
                    {new Date(order.createdAt).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-[var(--ov-muted)]">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
