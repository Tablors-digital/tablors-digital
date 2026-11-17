import Link from "next/link";
import {
  Activity, Banknote, Box, Coins, Landmark, Package, Percent, PiggyBank, Receipt, RefreshCw, SlidersHorizontal,
  ShieldCheck, Truck, Users, Wallet, Wrench, ListChecks, FileText, type LucideIcon,
} from "lucide-react";
import { DEMO_BUSINESS_ID as B, getPotsRuntime } from "@/server/modules/pots/runtime";
import { formatINR } from "@/server/modules/pots/money";
import { STATUS_LABEL } from "@/server/modules/pots/views";
import { buildOverviewAnalytics, parseRange, type Direction } from "@/server/modules/pots/analytics";
import { AreaChart, DonutChart } from "@/components/pots/charts";
import { Sparkline } from "@/components/pots/sparkline";
import { SandTimer } from "@/components/pots/sand-timer";
import { gstCycle, growthDirection } from "@/components/pots/cycles";
import { TONE, fmtRange, potColour } from "@/components/pots/tones";
import { HistoryNotice, KpiCard, Panel, PageHero, ProgressBar, QuickAction, RangeTabs, TrendBadge, TrendCaption } from "./_components/premium";

export const dynamic = "force-dynamic"; // ledger is live in-memory state

const currentTimestamp = () => Date.now();

const ICON: Record<string, LucideIcon> = {
  GST: Receipt, SALARY: Users, INVENTORY: Package, MAINTENANCE: Wrench,
  SUBSCRIPTIONS: RefreshCw, SERVICE_CHARGES: Percent, OWNER_PROFIT: Wallet,
};
const STATUS_TONE = { NO_RULE: "#9ca3af", COLLECTING: "var(--color-radium-500)", TARGET_MET: "var(--color-info)" } as const;
const DIR_WORD: Record<Direction, string> = { up: "Balance increasing", down: "Balance decreasing", flat: "Balance unchanged", none: "No history yet" };

export default async function FinancialPotsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: r } = await searchParams;
  const range = parseRange(r);
  const rt = getPotsRuntime();
  const o = buildOverviewAnalytics(rt, range);
  const { dash } = o;
  const t = dash.totals;
  const todayDelta = o.todayVsYesterday;

  const slices = o.donut.slices.map((s, i) => ({ key: s.key, label: s.label, value: s.value, percent: s.percent, colour: potColour(s.key, i), href: s.slug ? `/owner/pots/${s.slug}` : undefined }));
  const coll = o.collection;
  const collPoints = coll.buckets.map((b) => ({ t: b.t0, v: b.v }));
  const collTone = coll.pct === null ? "gold" : coll.pct > 0 ? "up" : coll.pct < 0 ? "down" : "flat";
  const gst = rt.pots.find((p) => p.type === "GST");
  const salary = rt.pots.find((p) => p.type === "SALARY");
  const nowMs = currentTimestamp();
  const gc = gstCycle(nowMs);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHero eyebrow="Financial Pots" title="Business Pots" sub="Virtual ledger allocations of your settled sales — not separate bank accounts. Every figure and graph below is read from the ledger.">
        <RangeTabs base="/owner/pots" current={range} />
      </PageHero>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total settled balance" value={formatINR(t.totalSettledBalance)} icon={Landmark} accent="gold" hint="Pots + unallocated" />
        <KpiCard label="Collected today" value={formatINR(t.collectedToday)} icon={Banknote} accent="green"
          delta={todayDelta.pct !== null ? <span className="mb-1 block"><TrendBadge direction={todayDelta.pct > 0 ? "up" : todayDelta.pct < 0 ? "down" : "flat"} pct={todayDelta.pct} compact /> <span className="text-zinc-600">vs yesterday</span></span> : undefined}
          hint={todayDelta.pct === null ? "No sales yesterday to compare" : undefined} />
        <KpiCard label="Allocated to pots" value={formatINR(t.allocatedToPots)} icon={PiggyBank} accent="blue" hint={t.totalSettledBalance > 0 ? `${Math.round((t.allocatedToPots * 1000) / t.totalSettledBalance) / 10}% of settled balance` : "Nothing settled yet"} />
        <KpiCard label="Unallocated" value={formatINR(t.unallocated)} icon={Coins} accent="neutral" hint={t.unallocated > 0 ? <Link href="/owner/pots/rules" className="underline decoration-zinc-700 hover:text-zinc-300">Set a rule to allocate</Link> : "All settled money is in a pot"} />
      </div>

      <SandTimer
        title="Next GST filing"
        startMs={gc.startMs}
        endMs={gc.endMs}
        nowMs={nowMs}
        caption={`GSTR-3B for ${gc.period} · due on the 20th (indicative)`}
      />

      <p className={`text-xs ${dash.reconciliation.ok ? "text-zinc-500" : "text-red-400"}`}>
        {dash.reconciliation.ok ? "✓ Ledger reconciled: pots + unallocated = settled balance." : "Reconciliation mismatch — review the ledger before trusting these figures."}
      </p>

      {!dash.hasAnyRule && (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
          No allocation rules are configured yet, so settled payments stay <span className="text-zinc-200">unallocated</span>. Set your own rules on the{" "}
          <Link href="/owner/pots/rules" className="underline" style={{ color: "var(--color-radium-500)" }}>Rules</Link> screen.
        </div>
      )}

      {/* Donut + collection trend */}
      <div className="grid gap-4 lg:grid-cols-5 sm:gap-5">
        <Panel title="Pot allocation" subtitle="Where settled money sits right now" className="lg:col-span-2"><DonutChart slices={slices} total={o.donut.total} /></Panel>
        <Panel title="Collection trend" className="lg:col-span-3"
          subtitle={coll.hasData ? `Net sales per ${coll.granularity} · ${fmtRange(coll.from, coll.to)}` : "Net sales (payments minus refunds)"}
          action={coll.hasData ? (
            <div className="text-right">
              <p className="text-lg font-extrabold tabular-nums text-zinc-50">{formatINR(coll.total)}</p>
              <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-zinc-500">
                {coll.pct !== null ? <TrendBadge direction={coll.pct > 0 ? "up" : coll.pct < 0 ? "down" : "flat"} pct={coll.pct} compact /> : null}
                <span>{coll.pct !== null && coll.previousTotal !== null ? `vs ${formatINR(coll.previousTotal)} before` : coll.pctNote}</span>
              </div>
            </div>
          ) : undefined}>
          <AreaChart points={collPoints} tone={collTone} mode={coll.granularity} valueLabel="Net sales" height={250}
            emptyTitle="No collections to chart yet" emptyHint="Record a payment and this graph updates immediately. A trend needs at least two time buckets of sales." />
        </Panel>
      </div>

      {/* Pot cards with trend graphs */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-sm font-semibold tracking-wide text-zinc-100">Pot balances</h2><p className="text-xs text-zinc-500">Trend over the selected range · green rises, red falls · % compares with the balance at the start of the range</p></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {o.cards.map((c, i) => {
            const Icon = ICON[c.pot.type] ?? Box;
            const tr = c.trend;
            const dir = growthDirection(tr.direction);
            const tone = TONE[dir];
            const rgb = dir === "up" ? "57,255,106" : dir === "down" ? "255,92,92" : "161,161,170";
            return (
              <Link key={c.pot.id} href={`/owner/pots/${c.slug}`} className="pots-panel pots-card-hover pots-rise group relative block overflow-hidden rounded-2xl border border-zinc-800/80 p-4 hover:border-zinc-600 sm:p-5"
                style={{ ["--pots-glow" as string]: `rgba(${rgb},0.30)`, animationDelay: `${i * 40}ms` }}>
                <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-2xl" style={{ background: `rgba(${rgb},0.12)` }} />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-800 bg-black/40" style={{ color: potColour(c.pot.type === "CUSTOM" ? c.pot.id : c.pot.type, i) }}><Icon className="h-[18px] w-[18px]" /></span>
                    <p className="text-sm font-semibold text-zinc-100">{c.pot.name}</p>
                  </div>
                  <TrendBadge direction={tr.direction} pct={tr.pct} note={tr.pctNote} compact />
                </div>
                <p className="relative mt-3 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-50">{formatINR(c.balance)}</p>
                <p className="relative text-[11px]" style={{ color: tone }}>{DIR_WORD[tr.direction]}{tr.direction !== "none" && tr.direction !== "flat" ? ` · ${tr.change > 0 ? "+" : ""}${formatINR(tr.change)}` : ""}</p>
                <div className="relative mt-3"><Sparkline points={tr.points} direction={dir} label={`${c.pot.name} balance trend: ${DIR_WORD[tr.direction]}`} /></div>
                <div className="relative mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{fmtRange(tr.from, tr.to)}</span><TrendCaption t={tr} />
                </div>
                {c.targetPaise !== undefined ? (
                  <div className="relative mt-3 space-y-1.5 border-t border-zinc-800/80 pt-3">
                    <div className="flex justify-between text-[11px] text-zinc-400"><span>Monthly target {formatINR(c.targetPaise)}</span><span className="tabular-nums text-zinc-200">{c.progressPercent ?? 0}%</span></div>
                    <ProgressBar pct={c.progressPercent ?? 0} tone="gold" />
                  </div>
                ) : null}
                <span className="relative mt-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium" style={{ color: STATUS_TONE[c.status], borderColor: `color-mix(in srgb, ${STATUS_TONE[c.status]} 35%, transparent)`, background: `color-mix(in srgb, ${STATUS_TONE[c.status]} 8%, transparent)` }}>{STATUS_LABEL[c.status]}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick actions + alerts */}
      <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
        <Panel title="Quick actions" subtitle="Jump straight to the work" className="lg:col-span-2">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <QuickAction href="/owner/pots/rules" icon={SlidersHorizontal} title="Allocation rules" desc="Decide how sales are split" accent="gold" />
            <QuickAction href="/owner/pots/gst" icon={Receipt} title="GST reserve" desc={gst ? `${formatINR(rt.ledger.potBalance(B, gst.id))} reserved` : "Tax reserve"} accent="gold" />
            <QuickAction href="/owner/pots/salary" icon={Users} title="Run payroll" desc={salary ? "Draft, approve and pay salaries" : "Salaries"} accent="green" />
            <QuickAction href="/owner/pots/suppliers" icon={Truck} title="Pay a supplier" desc="Invoice-based payouts" accent="blue" />
            <QuickAction href="/owner/pots/approvals" icon={ShieldCheck} title="Approvals" desc="Review payouts waiting for you" badge={o.pendingApprovals} accent="green" />
            <QuickAction href="/owner/pots/transactions" icon={ListChecks} title="Transactions" desc="Every ledger movement" accent="neutral" />
            <QuickAction href="/owner/pots/reports" icon={FileText} title="Reports" desc="Sales, pot movement, audit" accent="neutral" />
            <QuickAction href="/owner/pots/profit" icon={Wallet} title="Owner profit" desc="Withdraw with approval" accent="gold" />
          </div>
        </Panel>
        <Panel title="Recent alerts" subtitle="Reconciliation and rule notices">
          {dash.alerts.length === 0 && dash.exceptions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center"><Activity className="h-6 w-6 text-zinc-700" /><p className="text-xs text-zinc-500">No alerts. Everything is reconciled.</p></div>
          ) : (
            <ul className="space-y-2 text-xs text-zinc-400">
              {dash.exceptions.map((e, i) => <li key={`x${i}`} className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-3 py-2 text-amber-400">Reconciliation: {e.code} — {e.detail}</li>)}
              {dash.alerts.map((a, i) => <li key={`a${i}`} className="rounded-lg border border-zinc-800 px-3 py-2">{a.message}</li>)}
            </ul>
          )}
        </Panel>
      </div>

      <HistoryNotice note={o.history} />
    </div>
  );
}