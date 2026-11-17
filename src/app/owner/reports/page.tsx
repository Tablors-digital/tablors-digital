import { BarChart3 } from "lucide-react";

import "@/components/reports/reports.css";
import { PeriodControls, type PeriodOption } from "@/components/reports/period-controls";
import { ReportsView } from "@/components/reports/reports-view";
import { getDemoRole } from "@/server/modules/auth/session";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import {
  listBillsDb,
  listPaymentsDb,
  listRefundsDb,
} from "@/server/modules/billing/db-billing";
import { getTablesDb } from "@/server/modules/data/tables-db";
import { listAllOrders } from "@/server/modules/orders/db-orders";
import {
  PERIOD_LABELS,
  REPORT_PERIODS,
  TABLE_TIME_NOTE,
  buildSalesReport,
  getPeriodRange,
  parseReportPeriod,
} from "@/server/modules/reports/reports";

export const dynamic = "force-dynamic";

function formatRange(start: number, end: number, period: string): string {
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
      .format(ms)
      .replaceAll("/", "-");
  if (period === "today" || period === "yesterday") return fmt(start);
  return `${fmt(start)} – ${fmt(end - 1)}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  // Financial data: enforce on the server, not just by hiding the nav link.
  const role = await getDemoRole();
  if (role !== "owner") {
    return (
      <div>
        <h1 className="text-2xl text-[var(--color-text-primary)]">Reports</h1>
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          Reports are available to the restaurant owner only.
        </p>
      </div>
    );
  }

  const period = parseReportPeriod((await searchParams).period);
  const [orders, bills, payments, refunds, tables] = await Promise.all([
    listAllOrders(DEMO_RESTAURANT_ID),
    listBillsDb(DEMO_RESTAURANT_ID),
    listPaymentsDb(DEMO_RESTAURANT_ID),
    listRefundsDb(DEMO_RESTAURANT_ID),
    getTablesDb(DEMO_RESTAURANT_ID),
  ]);
  const report = buildSalesReport({ orders, bills, payments, refunds, tables }, period);

  const now = Date.now();
  const options: PeriodOption[] = REPORT_PERIODS.map((p) => {
    const range = getPeriodRange(p, now);
    return { value: p, label: PERIOD_LABELS[p], dates: formatRange(range.start, range.end, p) };
  });

  return (
    <div className="rp">
      <div className="rp-head">
        <div className="rp-title">
          <BarChart3 aria-hidden strokeWidth={1.75} />
          <div>
            <h1>Reports</h1>
            <p>Sales, orders and performance insights for your restaurant.</p>
          </div>
        </div>
        <PeriodControls options={options} current={period} />
      </div>

      <ReportsView key={period} report={report} tableTimeNote={TABLE_TIME_NOTE} />
    </div>
  );
}
