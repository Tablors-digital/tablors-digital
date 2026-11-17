import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  Eye,
  Receipt,
  Timer,
  UtensilsCrossed,
} from "lucide-react";

import { DayPicker } from "@/components/ui/day-picker";
import { istDay, resolveDay, todayIst, yesterdayIst } from "@/lib/day";
import { LiveRefresh } from "@/components/live/live-refresh";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import type { Bill, Order, RestaurantTable } from "@/server/modules/demo-store/store";
import {
  acknowledgeWaiter,
  advanceOrderFromForm,
  cancelOrderFromForm,
} from "@/server/modules/orders/actions";
import { formatOrderNo, tableNumberFromLabel } from "@/lib/order-number";
import { listAllOrders, listTables } from "@/server/modules/orders/db-orders";
import { listBillsDb } from "@/server/modules/billing/db-billing";
import { db } from "@/server/db/client";
import { orderEvents } from "@/server/db/schema";
import { OrdersRefreshButton } from "./orders-refresh-button";

// Orders change constantly — never prerender.
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    notice?: string;
    date?: string;
    status?: string;
    source?: string;
  }>;
};

/* ------------------------------------------------------------------ */
/* Display status: the owner sees four stages. Served + Billed both    */
/* mean the food is done, so they show as "Completed".                 */
/* ------------------------------------------------------------------ */
type DisplayStatus = "new" | "preparing" | "ready" | "completed";

const STATUS_FILTERS: { value: "all" | DisplayStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
];

// Every order today is placed from a table (QR / Tablor device) — the data
// model has no other channel yet, so "Dine-in" is the only source value.
type OrderSource = "dine-in";
const SOURCE_FILTERS: { value: "all" | OrderSource; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "dine-in", label: "Dine-in" },
];

function toDisplayStatus(status: string): DisplayStatus {
  if (status === "new" || status === "preparing" || status === "ready") {
    return status;
  }
  return "completed";
}

function getOrderSource(): OrderSource {
  return "dine-in";
}

const STATUS_STYLE: Record<DisplayStatus, { label: string; chip: string; dot: string }> = {
  new: {
    label: "New",
    chip: "border-[var(--radium-green)]/40 bg-[var(--radium-green)]/10 text-[var(--radium-green)]",
    dot: "bg-[var(--radium-green)]",
  },
  preparing: {
    label: "Preparing",
    chip: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-300",
  },
  ready: {
    label: "Ready",
    chip: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-300",
  },
  completed: {
    label: "Completed",
    chip: "border-zinc-600 bg-zinc-800/60 text-zinc-300",
    dot: "bg-zinc-400",
  },
};

function getNextActionLabel(status: string): string | null {
  switch (status) {
    // Dine-in: the owner only has two actions, Mark Ready and Mark Served.
    // Marking a new order ready passes through Preparing automatically.
    case "new":
    case "preparing":
      return "Mark Ready";
    case "ready":
      return "Mark Served";
    default:
      return null;
  }
}

function getNoticeMessage(code: string | undefined): string | null {
  switch (code) {
    case "stale":
      return "That order was already updated by someone else. Showing its latest status.";
    case "served":
      return "That order is already served. Billing is a separate step — open Billing.";
    case "billed":
      return "That order has already been billed.";
    case "missing":
      return "That order no longer exists.";
    case "forbidden":
      return "You don't have permission to update orders.";
    case "invalid":
      return "That update request was invalid.";
    case "cancelled":
      return "Order cancelled.";
    case "paid":
      return "A paid order can't be cancelled — use a refund instead.";
    default:
      return null;
  }
}

function formatElapsed(fromMs: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - fromMs) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "< 1 min";
  return `${Math.round(minutes)} min`;
}

/** Builds a link that keeps the other filters and changes one. */
function filterHref(
  current: { date?: string; status: string; source: string },
  patch: Partial<{ status: string; source: string }>,
): string {
  const next = { ...current, ...patch };
  const qs = new URLSearchParams();
  if (next.date) qs.set("date", next.date);
  if (next.status !== "all") qs.set("status", next.status);
  if (next.source !== "all") qs.set("source", next.source);
  const s = qs.toString();
  return s ? `/owner/orders?${s}` : "/owner/orders";
}

export default async function LiveOrdersPage({ searchParams }: PageProps) {
  const { notice, date, status, source } = await searchParams;
  const noticeMessage = getNoticeMessage(typeof notice === "string" ? notice : undefined);

  let orders: Order[];
  let tables: RestaurantTable[];
  let bills: Bill[] = [];
  const readyAt = new Map<string, number>();

  try {
    [orders, tables] = await Promise.all([
      listAllOrders(DEMO_RESTAURANT_ID),
      listTables(DEMO_RESTAURANT_ID),
    ]);
  } catch (err) {
    console.error("Live orders query failed", err);

    return (
      <div>
        <LiveRefresh />
        <h1 className="text-2xl font-semibold text-zinc-50">Live Orders</h1>
        <div className="mt-4 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3">
          <p className="text-sm text-amber-300">
            Couldn&apos;t load orders from the database. Check the connection and refresh the page.
          </p>
        </div>
      </div>
    );
  }

  // Read-only extras. If either fails the page still works: payment shows
  // as Pending and average preparation time shows "—".
  try {
    bills = await listBillsDb(DEMO_RESTAURANT_ID);
  } catch (err) {
    console.error("Live orders: bills read failed", err);
  }
  try {
    const events = await db
      .select({ orderId: orderEvents.orderId, to: orderEvents.toStatus, at: orderEvents.createdAt })
      .from(orderEvents)
      .where(eq(orderEvents.restaurantId, DEMO_RESTAURANT_ID));
    for (const e of events) {
      if (e.to !== "ready") continue;
      const t = e.at.getTime();
      const prev = readyAt.get(e.orderId);
      if (prev === undefined || t < prev) readyAt.set(e.orderId, t);
    }
  } catch (err) {
    console.error("Live orders: events read failed", err);
  }

  const paidOrderIds = new Set(
    bills.filter((b) => b.paymentMethod && b.paidAt).map((b) => b.orderId),
  );

  const waiterCalls = tables.filter((t) => t.waiterCalled);

  const today = todayIst();
  const selectedDay = resolveDay(date);
  const isToday = selectedDay === today;

  const statusFilter = STATUS_FILTERS.some((f) => f.value === status) ? (status as string) : "all";
  const sourceFilter = SOURCE_FILTERS.some((f) => f.value === source) ? (source as string) : "all";
  const current = {
    date: isToday ? undefined : selectedDay,
    status: statusFilter,
    source: sourceFilter,
  };

  // Cancelled orders never appear in the live flow.
  const liveOrders = orders.filter((o) => (o.status as string) !== "cancelled");

  /* ---------------- summary cards (no financial figures) ---------------- */
  const ongoingCount = liveOrders.filter((o) =>
    ["new", "preparing", "ready"].includes(o.status),
  ).length;

  const completedToday = liveOrders.filter(
    (o) => toDisplayStatus(o.status) === "completed" && istDay(o.statusUpdatedAt) === today,
  ).length;

  const prepTimes = liveOrders
    .filter((o) => istDay(o.createdAt) === selectedDay)
    .map((o) => {
      const r = readyAt.get(o.id);
      return r === undefined ? null : (r - o.createdAt) / 60000;
    })
    .filter((m): m is number => m !== null && m >= 0);
  const avgPrep = prepTimes.length
    ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length
    : null;

  /* ---------------- filtered list ---------------- */
  const dayOrders = liveOrders
    .filter((o) => istDay(o.createdAt) === selectedDay)
    .filter((o) => statusFilter === "all" || toDisplayStatus(o.status) === statusFilter)
    .filter(() => sourceFilter === "all" || getOrderSource() === sourceFilter)
    .sort((a, b) => b.createdAt - a.createdAt);

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
      active
        ? "border-[var(--radium-green)] bg-[var(--radium-green)]/10 text-[var(--radium-green)]"
        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
    }`;

  const summary = [
    { label: "Ongoing Orders", value: String(ongoingCount), hint: "New, preparing or ready", icon: ChefHat },
    { label: "Completed Today", value: String(completedToday), hint: "Served or billed", icon: CheckCircle2 },
    {
      label: "Average Preparation Time",
      value: formatMinutes(avgPrep),
      hint: isToday ? "Order placed → ready, today" : "Order placed → ready, selected day",
      icon: Timer,
    },
  ];

  return (
    <div className="space-y-6">
      <LiveRefresh intervalMs={4000} />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Live Orders</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--radium-green)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--radium-green)]" />
            </span>
            Updates automatically
          </p>
        </div>
        <OrdersRefreshButton />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map(({ label, value, hint, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--radium-green)]/10 text-[var(--radium-green)]">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="text-2xl font-semibold text-zinc-50">{value}</p>
              <p className="truncate text-xs text-zinc-500">{hint}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="-mt-4">
          <DayPicker value={selectedDay} today={today} yesterday={yesterdayIst()} />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Order status filter">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={filterHref(current, { status: f.value })}
                className={chip(statusFilter === f.value)}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Order source filter">
            {SOURCE_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={filterHref(current, { source: f.value })}
                className={chip(sourceFilter === f.value)}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {noticeMessage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3">
          <p className="text-sm text-amber-300">{noticeMessage}</p>
          <Link
            href="/owner/orders"
            className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-medium text-amber-300"
          >
            Dismiss
          </Link>
        </div>
      )}

      {waiterCalls.length > 0 && (
        <div className="space-y-2">
          {waiterCalls.map((table) => (
            <div
              key={table.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--radium-green)]/50 bg-[var(--radium-green)]/10 px-4 py-3"
            >
              <p className="text-sm font-medium text-[var(--radium-green)]">
                🔔 Waiter called — {table.label}
              </p>
              <form action={acknowledgeWaiter.bind(null, table.id)}>
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--radium-green)]/60 px-3 py-1.5 text-xs font-medium text-[var(--radium-green)]"
                >
                  Acknowledge
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Orders */}
      {dayOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <p className="mt-4 text-base font-medium text-zinc-200">No orders to show</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            {statusFilter !== "all" || sourceFilter !== "all"
              ? "No orders match these filters. Try clearing them."
              : isToday
                ? "New orders will appear here automatically as guests place them."
                : "No orders were placed on this day."}
          </p>
          {(statusFilter !== "all" || sourceFilter !== "all") && (
            <Link
              href={filterHref(current, { status: "all", source: "all" })}
              className="mt-4 rounded-lg border border-zinc-700 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-[var(--radium-green)] hover:text-[var(--radium-green)]"
            >
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {dayOrders.map((order) => {
            const table = tables.find((t) => t.id === order.tableId);
            const display = toDisplayStatus(order.status);
            const style = STATUS_STYLE[display];
            const paid = paidOrderIds.has(order.id);
            // Only today's orders can still be moved forward; past days are history.
            const action = isToday ? getNextActionLabel(order.status) : null;
            const tableLabel = table?.label ?? order.tableId;

            return (
              <article
                key={order.id}
                id={order.id}
                className="scroll-mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition target:border-[var(--radium-green)] hover:border-zinc-700 sm:p-5"
              >
                {/* top row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-zinc-50">
                        {formatOrderNo(order.orderNo)}
                      </p>
                      {table?.waiterCalled && (
                        <span className="text-xs font-medium text-[var(--radium-green)]">🔔 Waiter called</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-400">
                      Walk-in guest · Table {tableNumberFromLabel(tableLabel)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.chip}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {style.label}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                        paid
                          ? "border-[var(--radium-green)]/40 text-[var(--radium-green)]"
                          : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {paid ? "Paid" : "Pending"}
                    </span>
                  </div>
                </div>

                {/* items */}
                <ul className="mt-4 space-y-1.5 rounded-xl bg-zinc-900/60 px-3.5 py-3 text-sm text-zinc-300">
                  {order.lines.map((line, i) => (
                    <li
                      key={`${line.itemId ?? line.code}-${line.round ?? 1}-${i}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="min-w-0 truncate">
                        {line.name}
                        {(line.round ?? 1) > 1 && (
                          <span className="ml-2 text-xs text-[var(--radium-green)]">
                            added · round {line.round}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium text-zinc-100">× {line.qty}</span>
                    </li>
                  ))}
                </ul>

                {/* meta */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatClock(order.createdAt)}
                    {isToday && ` · ${formatElapsed(order.createdAt)}`}
                  </span>
                  {order.status !== "new" && (
                    <span>
                      {style.label} {formatElapsed(order.statusUpdatedAt)}
                    </span>
                  )}
                </div>

                {/* actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-900 pt-4">
                  {action && (
                    <form action={advanceOrderFromForm}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="expectedStatus" value={order.status} />
                      <button
                        type="submit"
                        className="rounded-lg border border-[#39ff6a] bg-[#39ff6a] px-5 py-2.5 text-sm font-extrabold text-black shadow-[0_0_14px_rgba(57,255,106,0.35)] transition hover:brightness-110 active:scale-95"
                      >
                        {action}
                      </button>
                    </form>
                  )}

                  {order.status === "served" && (
                    <Link
                      href={`/owner/billing?tableId=${order.tableId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--radium-green)]/60 px-3.5 py-2 text-xs font-medium text-[var(--radium-green)]"
                    >
                      <Receipt className="h-3.5 w-3.5" />
                      Go to billing
                    </Link>
                  )}

                  {table && (
                    <Link
                      href={`/owner/tables/${table.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Details
                    </Link>
                  )}

                  {isToday && ["new", "preparing", "ready", "served"].includes(order.status) && (
                    <form action={cancelOrderFromForm} className="ml-auto">
                      <input type="hidden" name="orderId" value={order.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                      >
                        Cancel order
                      </button>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
