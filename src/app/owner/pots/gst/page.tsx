import Link from "next/link";
import { ArrowLeft, Banknote, CalendarClock, Download, FileText, Landmark, ListChecks, Minus, PiggyBank, Plus, Send, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { DEMO_BUSINESS_ID as B, ensurePotsRuntime } from "@/server/modules/pots/runtime";
import { buildGstView } from "@/server/modules/pots/reports";
import { buildGstAnalytics, parseRange } from "@/server/modules/pots/analytics";
import { gstAdjustAction, taxTransferAction } from "@/server/modules/pots/money-actions";
import { formatINR } from "@/server/modules/pots/money";
import { AreaChart } from "@/components/pots/charts";
import { SandTimer } from "@/components/pots/sand-timer";
import { gstCycle, growthDirection } from "@/components/pots/cycles";
import { TONE, fmtRange } from "@/components/pots/tones";
import { Notice, Field, inputCls, statusCls, when } from "../_components/ui";
import { ActivityTimeline, HistoryNotice, KpiCard, PageHero, Panel, QuickAction, RangeTabs, TrendBadge, TrendCaption } from "../_components/premium";

export const dynamic = "force-dynamic";

const currentTimestamp = () => Date.now();
const submitCls = "w-full rounded-xl px-4 py-2.5 text-sm font-bold text-black transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_0_22px_rgba(212,175,55,0.45)]";

export default async function GstPage({ searchParams }: { searchParams: Promise<{ notice?: string; m?: string; range?: string }> }) {
  const { notice, m, range: r } = await searchParams;
  const range = parseRange(r);
  const rt = await ensurePotsRuntime(B);
  const v = buildGstView(rt, m);
  const a = buildGstAnalytics(rt, range);
  if (!v || !a) return <div className="space-y-4"><Link href="/owner/pots" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft className="h-4 w-4" /> Back to Pots</Link><p className="text-sm text-zinc-400">No GST Pot configured.</p></div>;

  const tr = a.trend;
  const tone = tr.direction === "none" ? "gold" : growthDirection(tr.direction);
  const nowMs = currentTimestamp();
  const gc = gstCycle(nowMs);
  // Running balance for every ledger row, so the selected month's table can show balance-after.
  // Running balance for every ledger row, so the selected month's table can show balance-after.
  const { balanceAfter } = rt.ledger.potEntries(B, v.pot.id).reduce(
    (acc, e) => {
      const next = acc.run + e.amount;
      acc.balanceAfter.set(e.id, next);
      acc.run = next;
      return acc;
    },
    { run: 0, balanceAfter: new Map<string, number>() },
  );
  const csvHref = `/owner/pots/gst/export${v.month ? `?m=${v.month}` : ""}`;
  const monthHref = (x: string) => `/owner/pots/gst?m=${x}&range=${range}`;

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/owner/pots" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"><ArrowLeft className="h-4 w-4" /> Back to Pots</Link>
      <PageHero eyebrow="Tax reserve" title="GST / Tax Reserve" sub="An accounting reserve, not a promise of direct government payment. The tax rate comes from your allocation rules, never a hard-coded percentage.">
        <RangeTabs base="/owner/pots/gst" current={range} extra={{ m: v.month }} />
        <a href={csvHref} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:border-[var(--color-gold-500)] hover:text-[var(--color-gold-500)]"><Download className="h-3.5 w-3.5" /> Export CSV</a>
      </PageHero>
      <Notice code={notice} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Reserved amount" value={formatINR(a.balance)} icon={Landmark} accent="gold" delta={<span className="mb-1 block"><TrendBadge direction={tr.direction} pct={tr.pct} note={tr.pctNote} compact /></span>} hint={a.reservedForPayouts > 0 ? `${formatINR(a.reservedForPayouts)} held for pending transfers` : "Current ledger balance"} />
        <KpiCard label="Available to transfer" value={formatINR(a.available)} icon={Banknote} accent="green" hint="Reserve minus pending transfers" />
        <KpiCard label="Total allocated" value={formatINR(a.totalAllocated)} icon={PiggyBank} accent="blue" hint="From payments, net of refund reversals" />
        <KpiCard label="Next due date" value={a.nextDue.label} icon={CalendarClock} accent="neutral" hint={<span title={a.nextDue.basis}>Indicative · GSTR-3B (20th)</span>} />
      </div>

      <SandTimer
        title="Next GST filing"
        startMs={gc.startMs}
        endMs={gc.endMs}
        nowMs={nowMs}
        caption={`GSTR-3B for ${gc.period} · due on the 20th (indicative)`}
      />

      <div className="grid gap-4 lg:grid-cols-5 sm:gap-5">
        <Panel className="lg:col-span-3" title="GST reserve trend" subtitle={`Running balance · ${fmtRange(tr.from, tr.to)}`}
          action={<div className="text-right text-[11px] text-zinc-500"><p className="text-lg font-extrabold tabular-nums" style={{ color: TONE[tr.direction] }}>{tr.change > 0 ? "+" : ""}{formatINR(tr.change)}</p><TrendCaption t={tr} /></div>}>
          <AreaChart points={tr.points.map((p) => ({ t: p.t, v: p.v }))} tone={tone} mode="datetime" step valueLabel="Reserve balance" height={270}
            emptyTitle="No GST history to chart yet" emptyHint="The graph starts as soon as GST is reserved from a payment or you add to the reserve." />
        </Panel>
        <Panel className="lg:col-span-2" title="Quick actions">
          <div className="grid gap-2.5">
            <QuickAction href="#adjust" icon={Plus} title="Add / deduct reserve" desc="Owner adjustment with a reason" accent="green" />
            <QuickAction href="#transfer" icon={Send} title="Transfer for tax payment" desc="Request a payout to your account" accent="gold" />
            <QuickAction href={csvHref} icon={Download} title="Export CSV for accountant" desc={v.month ? `Period ${v.month}` : "Latest period"} accent="blue" download />
            <QuickAction href="/owner/pots/approvals" icon={ShieldCheck} title="Approvals" desc="Approve pending tax transfers" accent="green" />
            <QuickAction href="/owner/pots/rules" icon={SlidersHorizontal} title="Change GST rule" desc="Set how much is reserved" accent="neutral" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-5 sm:gap-5">
        <Panel className="lg:col-span-2" title="GST activity" subtitle="Reserves, reversals, adjustments and tax transfers">
          <ActivityTimeline events={a.timeline} empty="No GST activity yet. Entries appear here the moment money is reserved or moved." />
        </Panel>

        <div className="space-y-4 lg:col-span-3 sm:space-y-5">
          <Panel title="Add / deduct reserve" subtitle="Owner only · a reason is mandatory and saved in the audit log">
            <form id="adjust" action={gstAdjustAction} className="scroll-mt-24 space-y-3">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
                <label className="cursor-pointer"><input type="radio" name="direction" value="reserve" defaultChecked className="peer sr-only" />
                  <span className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors peer-checked:border-[var(--color-radium-500)] peer-checked:bg-[var(--color-radium-500)]/10 peer-checked:text-[var(--color-radium-500)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-radium-500)]"><Plus className="h-4 w-4" /> Add to reserve</span></label>
                <label className="cursor-pointer"><input type="radio" name="direction" value="release" className="peer sr-only" />
                  <span className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors peer-checked:border-[var(--color-danger)] peer-checked:bg-[var(--color-danger)]/10 peer-checked:text-[var(--color-danger)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-danger)]"><Minus className="h-4 w-4" /> Deduct (release)</span></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Amount (₹)"><input name="amount" required inputMode="decimal" placeholder="0.00" className={inputCls} /></Field>
                <div className="sm:col-span-2"><Field label="Reason (required)"><input name="reason" required minLength={3} placeholder="e.g. Quarterly true-up after accountant review" className={inputCls} /></Field></div>
              </div>
              <button className={submitCls} style={{ background: "var(--color-gold-500)" }}>Save adjustment</button>
              <p className="text-[11px] text-zinc-500">Adding moves money from Unallocated into this reserve; deducting releases it back to Unallocated.</p>
            </form>
          </Panel>

          <Panel title="Withdraw / transfer for tax payment" subtitle="No compliant tax-payment integration is connected — this moves money to your account and you pay the tax externally">
            <form id="transfer" action={taxTransferAction} className="scroll-mt-24 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Destination account (token)"><input name="destination" required minLength={4} autoComplete="off" className={inputCls} /></Field>
                <Field label="Amount (₹)"><input name="amount" required inputMode="decimal" placeholder="0.00" className={inputCls} /></Field>
                <Field label="Tax reference / period"><input name="invoice" placeholder="e.g. GSTR-3B Oct-2026" className={inputCls} /></Field>
              </div>
              <button className={submitCls} style={{ background: "var(--color-radium-500)" }}>Request transfer</button>
              <p className="text-[11px] text-zinc-500">Available now: <span className="tabular-nums text-zinc-300">{formatINR(a.available)}</span>. The request needs approval before money moves.</p>
            </form>
            {a.taxPayouts.length > 0 ? (
              <ul className="mt-4 space-y-1.5 border-t border-zinc-800/80 pt-3">
                {a.taxPayouts.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>{when(p.createdAt)} · {p.maskedRef}{p.invoiceRef ? ` · ${p.invoiceRef}` : ""}</span>
                    <span><span className="tabular-nums text-zinc-200">{formatINR(p.amount)}</span> · <span className={statusCls(p.status)}>{p.status.replace("_", " ")}</span></span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </div>
      </div>

      <Panel title="Recent transactions" subtitle={v.month ? `Period ${v.month} · ${v.rows.length} entr${v.rows.length === 1 ? "y" : "ies"} · reserved in period ${formatINR(v.reservedInMonth)}` : "No periods yet"}
        action={<a href={csvHref} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:border-[var(--color-gold-500)] hover:text-[var(--color-gold-500)]"><Download className="h-3.5 w-3.5" /> CSV</a>}>
        {v.months.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {v.months.map((x) => <Link key={x} href={monthHref(x)} scroll={false} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${x === v.month ? "border-[var(--color-gold-500)] text-[var(--color-gold-500)] bg-[var(--color-gold-500)]/10" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>{x}</Link>)}
          </div>
        ) : null}
        {v.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 py-10 text-center"><FileText className="h-6 w-6 text-zinc-700" /><p className="text-sm text-zinc-400">No GST transactions in this period.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-zinc-500"><tr><th className="pb-2 font-medium">Date (IST)</th><th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Reference</th><th className="pb-2 font-medium">Reason</th><th className="pb-2 text-right font-medium">Amount</th><th className="pb-2 text-right font-medium">Balance</th></tr></thead>
              <tbody className="text-zinc-400">
                {v.rows.slice().reverse().map((x) => (
                  <tr key={x.id} className="border-t border-zinc-900 transition-colors hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 whitespace-nowrap">{when(x.at)}</td>
                    <td className="pr-3"><span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">{x.sourceType.replace(/_/g, " ").toLowerCase()}</span></td>
                    <td className="pr-3 max-w-[180px] truncate">{x.sourceId}</td>
                    <td className="pr-3 max-w-[220px] truncate">{x.reason || "—"}</td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: x.amount < 0 ? TONE.down : TONE.up }}>{x.amount > 0 ? "+" : ""}{formatINR(x.amount)}</td>
                    <td className="text-right tabular-nums text-zinc-200">{formatINR(balanceAfter.get(x.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-right text-xs"><Link href="/owner/pots/transactions" className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200"><ListChecks className="h-3.5 w-3.5" /> Full ledger</Link></p>
      </Panel>

      <HistoryNotice note={a.history} />
    </div>
  );
}