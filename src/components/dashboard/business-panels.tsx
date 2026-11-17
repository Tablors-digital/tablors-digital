import Link from "next/link";
import { buildInsights } from "@/lib/dashboard-insights";
import { stockState } from "@/lib/inventory-alerts";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { listAttendanceForPeriod, listLeaves, listStaff, todayInIndia } from "@/server/modules/demo-store/staff";
import { listAllOrdersCached, listBillsCached } from "@/server/modules/data/request-reads";
import { listItems } from "@/server/modules/inventory/store";
import { SectionHeader } from "./section-header";

const shell = "rounded-xl border border-[var(--ov-border)] bg-[var(--ov-surface)] p-3 sm:p-5";
const istDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function yesterdayInIndia(): string {
  return new Date(Date.parse(`${todayInIndia()}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function Row({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-[var(--ov-border)] py-2 text-sm first:border-0">
      <span className="text-[var(--ov-text-secondary)]">{label}</span>
      <span className={`font-medium ${tone ?? "text-[var(--ov-text)]"}`}>{value}</span>
    </div>
  );
}

/** Today's attendance from the Staff module. */
export async function StaffAttendancePanel() {
  const today = todayInIndia();
  const [staff, records, leaves] = await Promise.all([
    listStaff(DEMO_RESTAURANT_ID),
    listAttendanceForPeriod(DEMO_RESTAURANT_ID, today.slice(0, 7)),
    listLeaves(DEMO_RESTAURANT_ID),
  ]);
  const active = staff.filter((s) => s.status === "active");
  const todays = records.filter((r) => r.date === today);
  const onLeave = active.filter((s) => leaves.some((l) => l.staffId === s.id && l.from <= today && today <= l.to) && !todays.some((r) => r.staffId === s.id)).length;
  const inNow = todays.filter((r) => r.checkIn && !r.checkOut).length;
  const done = todays.filter((r) => r.checkIn && r.checkOut).length;
  const notIn = Math.max(0, active.length - inNow - done - onLeave);

  return (
    <div className={shell}>
      <SectionHeader title="Staff attendance" subtitle={`${active.length} active staff`} href="/owner/staff" hrefLabel="Staff" />
      <div className="mt-3">
        <Row label="Checked in now" value={inNow} tone="text-[var(--ov-accent)]" />
        <Row label="Checked out" value={done} />
        <Row label="On leave" value={onLeave} />
        <Row label="Not checked in" value={notIn} tone={notIn > 0 && todays.length > 0 ? "text-amber-400" : undefined} />
      </div>
    </div>
  );
}

/** Items at or below their alert level, from the Inventory module. */
export async function InventoryAlertsPanel() {
  const items = await listItems(DEMO_RESTAURANT_ID);
  const flagged = items
    .map((i) => ({ i, s: stockState(i.quantity, i.lowStockThreshold) }))
    .filter((x) => x.s !== "ok")
    .sort((a, b) => (a.s === "out" ? -1 : 1) - (b.s === "out" ? -1 : 1));

  return (
    <div className={shell}>
      <SectionHeader title="Inventory alerts" subtitle={items.length ? `${items.length} items tracked` : "No items tracked yet"} href="/owner/inventory" hrefLabel="Inventory" />
      <div className="mt-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ov-muted)]">Add stock items to see low-stock alerts here.</p>
        ) : flagged.length === 0 ? (
          <p className="text-sm text-[var(--ov-text-secondary)]">Everything is above its alert level.</p>
        ) : (
          flagged.slice(0, 6).map(({ i, s }) => (
            <Row key={i.id} label={i.name} value={s === "out" ? "Out of stock" : `${i.quantity} ${i.unit} left`} tone={s === "out" ? "text-red-400" : "text-amber-400"} />
          ))
        )}
      </div>
    </div>
  );
}

/** Paid bills today: method split and the latest payments. */
export async function PaymentsPanel() {
  const bills = await listBillsCached(DEMO_RESTAURANT_ID);
  const today = todayInIndia();
  const paidToday = bills.filter((b) => b.paidAt && istDay(b.paidAt) === today).sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
  const sum = (method: "cash" | "qr") => paidToday.filter((b) => b.paymentMethod === method).reduce((n, b) => n + b.totalRupees, 0);
  const total = paidToday.reduce((n, b) => n + b.totalRupees, 0);

  return (
    <div className={shell}>
      <SectionHeader title="Payments today" subtitle={`${paidToday.length} paid ${paidToday.length === 1 ? "bill" : "bills"}`} href="/owner/billing" hrefLabel="Billing" />
      <div className="mt-3">
        <Row label="Total collected" value={inr(total)} />
        <Row label="Cash" value={inr(sum("cash"))} />
        <Row label="QR / UPI" value={inr(sum("qr"))} />
      </div>
      {paidToday.length > 0 && (
        <div className="mt-3 border-t border-[var(--ov-border)] pt-2">
          <p className="mb-1 text-xs text-[var(--ov-muted)]">Latest</p>
          {paidToday.slice(0, 4).map((b) => (
            <Row key={b.id} label={`${new Date(b.paidAt!).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} · ${b.paymentMethod === "qr" ? "QR" : "Cash"}`} value={inr(b.totalRupees)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Plain-language insights, each backed by real numbers (see lib/dashboard-insights). */
export async function InsightsPanel() {
  const today = todayInIndia();
  const yesterday = yesterdayInIndia();
  const [bills, orders, items, staff, records] = await Promise.all([
    listBillsCached(DEMO_RESTAURANT_ID),
    listAllOrdersCached(DEMO_RESTAURANT_ID),
    listItems(DEMO_RESTAURANT_ID),
    listStaff(DEMO_RESTAURANT_ID),
    listAttendanceForPeriod(DEMO_RESTAURANT_ID, today.slice(0, 7)),
  ]);
  const paidOn = (day: string) => bills.filter((b) => b.paidAt && istDay(b.paidAt) === day).reduce((n, b) => n + b.totalRupees, 0);

  const qtyByItem = new Map<string, number>();
  for (const o of orders) {
    if (istDay(o.createdAt) !== today) continue;
    for (const l of o.lines) qtyByItem.set(l.name, (qtyByItem.get(l.name) ?? 0) + l.qty);
  }
  const top = [...qtyByItem.entries()].sort((a, b) => b[1] - a[1])[0];
  const states = items.map((i) => stockState(i.quantity, i.lowStockThreshold));

  const insights = buildInsights({
    salesTodayRupees: paidOn(today),
    salesYesterdayRupees: paidOn(yesterday),
    pendingOrders: orders.filter((o) => o.status === "new" || o.status === "preparing" || o.status === "ready").length,
    lowStockItems: states.filter((s) => s === "low").length,
    outOfStockItems: states.filter((s) => s === "out").length,
    activeStaff: staff.filter((s) => s.status === "active").length,
    checkedInToday: records.filter((r) => r.date === today && r.checkIn).length,
    topItemToday: top ? { name: top[0], qty: top[1] } : null,
  });

  const dot = { good: "bg-[var(--ov-accent)]", warn: "bg-amber-400", info: "bg-zinc-400" } as const;
  return (
    <div className={shell}>
      <SectionHeader title="Smart insights" subtitle="Based only on today's real data" />
      <ul className="mt-3 space-y-2 text-sm">
        {insights.length === 0 && <li className="text-[var(--ov-muted)]">Nothing notable yet. Insights appear as orders, payments and stock data come in.</li>}
        {insights.map((x) => (
          <li key={x.text} className="flex gap-2 text-[var(--ov-text-secondary)]">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[x.tone]}`} />
            {x.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--ov-muted)]">
        Expenses and net profit are not shown: no expense records exist in the system yet. <Link href="/owner/pots" className="underline">Financial pots</Link>
      </p>
    </div>
  );
}
