"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Coins,
  CreditCard,
  Info,
  Layers,
  Receipt,
  Star,
  Store,
  TrendingUp,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import "./reports.css";
import type { SalesReport } from "@/server/modules/reports/reports";

/**
 * Presentation-only view of an already-computed SalesReport.
 * No business figures are calculated here — only sorting, selection
 * state and chart geometry. Styles live in ./reports.css.
 */

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function CardHead({
  icon: Icon,
  title,
  right,
}: {
  icon: LucideIcon;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="rp-card-head">
      <h2>
        <Icon aria-hidden strokeWidth={1.75} />
        <span>{title}</span>
      </h2>
      {right}
    </div>
  );
}

/* ----------------------------- KPI row ----------------------------- */

function Kpi({
  icon: Icon,
  value,
  label,
  hint,
  href,
  target,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  hint?: string;
  href?: string;
  target?: string;
}) {
  const inner = (
    <>
      <span className="rp-kpi-ico">
        <Icon aria-hidden strokeWidth={1.75} />
      </span>
      <span className="rp-kpi-txt">
        <p className="rp-kpi-val">{value}</p>
        <p className="rp-kpi-lbl">{label}</p>
        {hint && <p className="rp-kpi-hint">{hint}</p>}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="rp-kpi" title={`Open ${label}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="rp-kpi"
      title={`Jump to ${label}`}
      onClick={() =>
        document.getElementById(target ?? "")?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    >
      {inner}
    </button>
  );
}

/* ------------------------- Peak ordering time ------------------------ */

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

function PeakHours({ report }: { report: SalesReport }) {
  const [selected, setSelected] = useState<number | null>(null);
  const { hourly, busiestHour } = report;

  const withData = hourly.filter((h) => h.orders > 0);
  // Always show a business-hours window; widen only if orders fall outside it.
  const startHour = Math.min(9, ...withData.map((h) => h.hour));
  const endHour = Math.max(21, ...withData.map((h) => h.hour));
  const slots = hourly.filter((h) => h.hour >= startHour && h.hour <= endHour);

  const maxOrders = Math.max(1, ...slots.map((h) => h.orders));
  const step = maxOrders <= 5 ? 1 : Math.ceil(maxOrders / 25) * 5;
  const top = Math.ceil(maxOrders / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  const sel = selected === null ? null : hourly[selected];

  return (
    <div className="rp-card" id="rp-peak">
      <CardHead icon={Clock} title="Peak Ordering Time" />
      <p className="rp-sub">
        {sel ? (
          <>
            <b>{sel.label}</b> — {plural(sel.orders, "order")} · click the bar again to clear
          </>
        ) : busiestHour ? (
          `Busiest hour: ${busiestHour.label} (${plural(busiestHour.orders, "order")})`
        ) : (
          "No orders in this period."
        )}
      </p>

      <div className="rp-bars" role="img" aria-label="Orders per hour">
        <div className="rp-yaxis">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="rp-plot">
          {ticks.map((t) => (
            <div key={t} className="rp-grid" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className={`rp-cols${selected !== null ? " dim" : ""}`}>
            {slots.map((h) => {
              const has = h.orders > 0;
              return (
                <button
                  key={h.hour}
                  type="button"
                  disabled={!has}
                  className={`rp-col${has ? " has" : ""}${selected === h.hour ? " sel" : ""}`}
                  title={`${h.label}: ${plural(h.orders, "order")}`}
                  aria-pressed={selected === h.hour}
                  aria-label={`${h.label}: ${plural(h.orders, "order")}`}
                  onClick={() => setSelected((s) => (s === h.hour ? null : h.hour))}
                >
                  {has && <span className="bar" style={{ height: `${(h.orders / top) * 100}%` }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="rp-xlabels">
        {slots.map((h) => (
          <span key={h.hour}>{hourLabel(h.hour)}</span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Payment donut --------------------------- */

const METHODS = [
  { key: "cash", label: "Cash", color: "#b6ff00" },
  { key: "qr", label: "QR", color: "#4f8f12" },
] as const;

const SIZE = 170;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function PaymentDonut({ report }: { report: SalesReport }) {
  const [active, setActive] = useState<string | null>(null);
  const by = report.overview.collectedByMethod;
  const total = by.cash + by.qr;

  let acc = 0;
  const slices = METHODS.map((m) => {
    const amount = by[m.key];
    const frac = total > 0 ? amount / total : 0;
    const s = { ...m, amount, dash: frac * C, offset: acc, percent: Math.round(frac * 100) };
    acc += frac * C;
    return s;
  });
  const focus = slices.find((s) => s.key === active);
  const toggle = (k: string) => setActive((a) => (a === k ? null : k));

  return (
    <div className="rp-card" id="rp-payments">
      <CardHead icon={CreditCard} title="Collected by Payment Method" />
      <div className="rp-donut-wrap">
        <div className="rp-donut">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Collected by payment method">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={STROKE} />
            {slices
              .filter((s) => s.amount > 0)
              .map((s) => (
                <circle
                  key={s.key}
                  className="seg"
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.key ? STROKE + 4 : STROKE}
                  strokeDasharray={`${s.dash} ${C - s.dash}`}
                  strokeDashoffset={-s.offset}
                  opacity={active && active !== s.key ? 0.4 : 1}
                  onClick={() => toggle(s.key)}
                >
                  <title>{`${s.label}: ${rupees(s.amount)} (${s.percent}%)`}</title>
                </circle>
              ))}
          </svg>
          <div className="rp-donut-mid">
            <strong>{rupees(focus ? focus.amount : total)}</strong>
            <span>{focus ? `${focus.label} (${focus.percent}%)` : "Total Collected"}</span>
          </div>
        </div>
        <ul className="rp-legend">
          {slices.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                className={active === s.key ? "is-on" : ""}
                aria-pressed={active === s.key}
                onClick={() => toggle(s.key)}
              >
                <span>
                  <i style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="amt">
                  {rupees(s.amount)} ({s.percent}%)
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* --------------------------- Sortable tables -------------------------- */

type Col<T> = {
  key: string;
  label: string;
  get: (row: T) => number | string;
  render?: (row: T) => React.ReactNode;
};

function DataTable<T>({
  id,
  cols,
  rows,
  rowKey,
  initialSort,
  limit,
  title,
  icon,
  empty,
  detail,
}: {
  id: string;
  cols: Col<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSort: { key: string; dir: "asc" | "desc" };
  limit: number;
  title: string;
  icon: LucideIcon;
  empty: string;
  detail: (row: T, rank: number, total: number) => string;
}) {
  const [sort, setSort] = useState(initialSort);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key) ?? cols[0];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, cols, sort]);

  const visible = expanded ? sorted : sorted.slice(0, limit);
  const selRow = selected === null ? undefined : sorted.find((r) => rowKey(r) === selected);

  return (
    <div className="rp-card" id={id}>
      <CardHead
        icon={icon}
        title={title}
        right={
          rows.length > limit ? (
            <button type="button" className="rp-link" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show Less" : "View All"}
              <ArrowRight aria-hidden />
            </button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <div className="rp-empty">{empty}</div>
      ) : (
        <>
          <div className="rp-tablewrap">
            <table className="rp-table">
              <thead>
                <tr>
                  {cols.map((c, i) => {
                    const on = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      >
                        <button
                          type="button"
                          className={on ? "is-on" : ""}
                          onClick={() =>
                            setSort((s) =>
                              s.key === c.key
                                ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
                                : { key: c.key, dir: i === 0 ? "asc" : "desc" },
                            )
                          }
                        >
                          {c.label}
                          <i aria-hidden>{on ? (sort.dir === "asc" ? "▲" : "▼") : ""}</i>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const k = rowKey(row);
                  return (
                    <tr
                      key={k}
                      className={selected === k ? "is-sel" : ""}
                      aria-selected={selected === k}
                      onClick={() => setSelected((s) => (s === k ? null : k))}
                    >
                      {cols.map((c) => (
                        <td key={c.key}>{c.render ? c.render(row) : c.get(row)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selRow && (
            <p className="rp-detail">
              <span>{detail(selRow, sorted.indexOf(selRow) + 1, sorted.length)}</span>
              <button type="button" aria-label="Clear selection" onClick={() => setSelected(null)}>
                ×
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

type PopularRow = SalesReport["popularItems"][number];
const popularCols: Col<PopularRow>[] = [
  { key: "name", label: "Item", get: (r) => r.name, render: (r) => <span className="rp-ellip">{r.name}</span> },
  { key: "qty", label: "Qty Sold", get: (r) => r.qtySold },
  { key: "rev", label: "Revenue", get: (r) => r.revenueRupees, render: (r) => rupees(r.revenueRupees) },
];

type CategoryRow = SalesReport["categories"][number];
const categoryCols: Col<CategoryRow>[] = [
  { key: "cat", label: "Category", get: (r) => r.category },
  { key: "orders", label: "Orders", get: (r) => r.orders },
  { key: "qty", label: "Items Sold", get: (r) => r.qtySold },
  { key: "rev", label: "Revenue", get: (r) => r.revenueRupees, render: (r) => rupees(r.revenueRupees) },
  {
    key: "share",
    label: "Share",
    get: (r) => r.sharePercent,
    render: (r) => (
      <span className="rp-share">
        <span className="track">
          <span className="fill" style={{ width: `${Math.min(100, r.sharePercent)}%` }} />
        </span>
        {r.sharePercent}%
      </span>
    ),
  },
];

type TableRow = SalesReport["tables"][number];
const tableCols: Col<TableRow>[] = [
  { key: "table", label: "Table", get: (r) => r.label },
  { key: "orders", label: "Orders", get: (r) => r.orders },
  { key: "rev", label: "Revenue", get: (r) => r.revenueRupees, render: (r) => rupees(r.revenueRupees) },
  { key: "aov", label: "Avg. Order Value", get: (r) => r.averageOrderValueRupees, render: (r) => rupees(r.averageOrderValueRupees) },
];

/* ---------------------------- Info cards ----------------------------- */

function InfoCard({
  id,
  icon,
  title,
  info,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  info: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rp-card" id={id}>
      <CardHead
        icon={icon}
        title={title}
        right={
          <button
            type="button"
            className="rp-icon-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`About ${title}`}
            title="More info"
          >
            <Info aria-hidden />
          </button>
        }
      />
      {children}
      {open && <p className="rp-body" style={{ marginTop: 8, fontSize: 12 }}>{info}</p>}
    </div>
  );
}

/* ------------------------------ Page view ----------------------------- */

export function ReportsView({
  report: r,
  tableTimeNote,
}: {
  report: SalesReport;
  tableTimeNote: string;
}) {
  const o = r.overview;

  return (
    <div className="rp-stack">
      <div className="rp-kpis">
        <Kpi icon={Coins} value={rupees(o.totalSalesRupees)} label="Total Sales" hint="(Billed, incl. tax)" href="/owner/billing" />
        <Kpi
          icon={Wallet}
          value={rupees(o.netCollectedRupees)}
          label="Total Collected"
          hint={o.refundedRupees > 0 ? `(Net, ${rupees(o.refundedRupees)} refunded)` : "(Net)"}
          target="rp-payments"
        />
        <Kpi icon={Receipt} value={String(o.orderCount)} label="Orders" href="/owner/orders" />
        <Kpi icon={TrendingUp} value={rupees(o.averageOrderValueRupees)} label="Avg. Order Value" hint="(Before tax & charges)" target="rp-category" />
        <Kpi icon={XCircle} value="N/A" label="Cancelled Orders" hint="(Not tracked yet)" target="rp-cancelled" />
      </div>

      <div className="rp-row analytics">
        <PeakHours report={r} />
        <PaymentDonut report={r} />
      </div>

      <div className="rp-row middle">
        <DataTable
          id="rp-popular"
          title="Popular Items"
          icon={Star}
          cols={popularCols}
          rows={r.popularItems}
          rowKey={(x) => x.key}
          initialSort={{ key: "qty", dir: "desc" }}
          limit={4}
          empty="No orders in this period."
          detail={(x, rank, n) => `#${rank} of ${n} — ${x.name}: ${x.qtySold} sold · ${rupees(x.revenueRupees)}`}
        />
        <DataTable
          id="rp-category"
          title="Sales by Category"
          icon={Layers}
          cols={categoryCols}
          rows={r.categories}
          rowKey={(x) => x.category}
          initialSort={{ key: "rev", dir: "desc" }}
          limit={4}
          empty="No orders in this period."
          detail={(x, rank, n) =>
            `#${rank} of ${n} — ${x.category}: ${plural(x.orders, "order")} · ${x.qtySold} items · ${rupees(x.revenueRupees)} (${x.sharePercent}%)`
          }
        />
      </div>

      <div className="rp-row bottom">
        <DataTable
          id="rp-tables"
          title="Sales by Table"
          icon={Store}
          cols={tableCols}
          rows={r.tables}
          rowKey={(x) => x.tableId}
          initialSort={{ key: "rev", dir: "desc" }}
          limit={4}
          empty="No orders in this period."
          detail={(x, rank, n) =>
            `#${rank} of ${n} — ${x.label}: ${plural(x.orders, "order")} · ${rupees(x.revenueRupees)} · avg ${rupees(x.averageOrderValueRupees)}`
          }
        />
        <div className="rp-infos">
          <InfoCard id="rp-tabletime" icon={Clock} title="Average Table Time" info={tableTimeNote}>
            {r.tableTime.available ? (
              <>
                <p className="rp-big">
                  {r.tableTime.averageMinutes} <small>min</small>
                </p>
                <p className="rp-body">
                  {plural(r.tableTime.sampleSize, "settled bill")}. {tableTimeNote}
                </p>
              </>
            ) : (
              <p className="rp-body">{r.tableTime.reason}</p>
            )}
          </InfoCard>
          <InfoCard
            id="rp-cancelled"
            icon={XCircle}
            title="Cancelled Orders"
            info="Cancelled orders can be reported once orders record a cancelled status."
          >
            <p className="rp-body">{r.cancelled.reason}</p>
          </InfoCard>
        </div>
      </div>
    </div>
  );
}
