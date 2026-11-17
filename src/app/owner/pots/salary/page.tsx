import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Coins, FilePlus2, FolderOpen, PiggyBank, SlidersHorizontal, UserCog, Users, Wallet } from "lucide-react";
import { isValidPeriod, formatDuration } from "@/lib/staff-hours";
import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { todayInIndia } from "@/server/modules/demo-store/staff";
import { getPotsRuntime, DEMO_BUSINESS_ID as B } from "@/server/modules/pots/runtime";
import { createPayrollRunAction } from "@/server/modules/pots/money-actions";
import { buildPayrollSource } from "@/server/modules/pots/payroll-source";
import { buildSalaryAnalytics, parseRange } from "@/server/modules/pots/analytics";
import { potSlug } from "@/server/modules/pots/views";
import { formatINR } from "@/server/modules/pots/money";
import { AreaChart } from "@/components/pots/charts";
import { SandTimer } from "@/components/pots/sand-timer";
import { payrollCycle, growthDirection } from "@/components/pots/cycles";
import { TONE, fmtRange } from "@/components/pots/tones";
import { Notice, Field, inputCls, btnMuted, statusCls, when, SANDBOX } from "../_components/ui";
import { HistoryNotice, KpiCard, PageHero, Panel, PayrollStepper, ProgressBar, QuickAction, RangeTabs, TrendBadge, TrendCaption } from "../_components/premium";

export const dynamic = "force-dynamic";

const currentTimestamp = () => Date.now();

/** Allocation, approval and payment are separate stages: this is the plain-language state of each run. */
const STAGE: Record<string, string> = {
  DRAFT: "Draft · waiting for owner approval",
  APPROVED: "Approved · payment not made yet",
  COMPLETED: "Paid",
  PARTIALLY_FAILED: "Partly paid · some payments failed",
};

const shiftMonth = (period: string, by: number) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthName = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const attendanceTone = (pct: number | null) => (pct === null ? "gold" : pct >= 90 ? "green" : pct >= 75 ? "gold" : "red") as "green" | "gold" | "red";

export default async function SalaryPage({ searchParams }: { searchParams: Promise<{ notice?: string; month?: string; range?: string }> }) {
  const { notice, month, range: r } = await searchParams;
  const range = parseRange(r);
  const rt = getPotsRuntime();
  const period = month && isValidPeriod(month) ? month : todayInIndia().slice(0, 7);
  const rows = await buildPayrollSource(DEMO_RESTAURANT_ID, period); // employees come ONLY from the Staff module
  const a = buildSalaryAnalytics(rt, period, rows, range);
  if (!a) return <div className="space-y-4"><Link href="/owner/pots" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft className="h-4 w-4" /> Back to Pots</Link><p className="text-sm text-zinc-400">No Salary Pot configured.</p></div>;

  const runs = rt.payroll.list(B).reverse();
  const included = rows.filter((x) => x.excluded === null && x.payable);
  const excluded = rows.filter((x) => x.excluded !== null);
  const existing = a.run;
  const count = (s: string) => runs.filter((x) => x.status === s).length;
  const tr = a.trend;
  const gap = a.payableTotal - a.available;
  const q = (m: string) => `/owner/pots/salary?month=${m}&range=${range}`;
  const empById = new Map(a.employees.map((e) => [e.staffId, e]));
  const nowMs = currentTimestamp();
  const pc = payrollCycle(period);

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/owner/pots" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"><ArrowLeft className="h-4 w-4" /> Back to Pots</Link>
      <PageHero eyebrow="Staff salary pot" title="Salary" sub="Employees, attendance, leave and salary come from the Staff module. Pick a month, review, then the owner approves; payment is a separate step.">
        <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-black/40 text-xs">
          <Link href={q(shiftMonth(period, -1))} aria-label="Previous month" className="px-2 py-1.5 text-zinc-400 hover:text-zinc-100"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[112px] text-center font-semibold text-zinc-100">{monthName(period)}</span>
          <Link href={q(shiftMonth(period, 1))} aria-label="Next month" className="px-2 py-1.5 text-zinc-400 hover:text-zinc-100"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <RangeTabs base="/owner/pots/salary" current={range} extra={{ month: period }} />
      </PageHero>
      <Notice code={notice} />

      {a.payableTotal > a.available && included.length > 0 ? (
        <p className="rounded-xl border border-amber-900 bg-amber-950/10 px-4 py-2.5 text-sm text-amber-400">
          The Salary Pot ({formatINR(a.available)}) is short of this month&apos;s payable amount by {formatINR(gap)}. The batch cannot be approved until the pot is funded.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Salary pot balance" value={formatINR(a.balance)} icon={Wallet} accent="green" delta={<span className="mb-1 block"><TrendBadge direction={tr.direction} pct={tr.pct} note={tr.pctNote} compact /></span>} hint={`${formatINR(a.available)} available to pay`} />
        <KpiCard label="Monthly allocation" value={formatINR(a.monthlyAllocation)} icon={PiggyBank} accent="gold" hint={included.length > 0 ? `Payable ${formatINR(a.payableTotal)} for ${monthName(period)}` : "Allocated into the pot this month"} />
        <KpiCard label="Total staff" value={String(a.totalStaff)} icon={Users} accent="blue" hint={`${a.includedCount} on payroll${excluded.length ? ` · ${excluded.length} not included` : ""}`} />
        <KpiCard label="Total working hours" value={formatDuration(a.totalMinutes)} icon={Clock3} accent="neutral" hint={`Recorded in ${monthName(period)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 sm:gap-5">
        <Panel className="lg:col-span-3" title="Salary pot trend" subtitle={`Running balance · ${fmtRange(tr.from, tr.to)}`}
          action={<div className="text-right text-[11px] text-zinc-500"><p className="text-lg font-extrabold tabular-nums" style={{ color: TONE[tr.direction] }}>{tr.change > 0 ? "+" : ""}{formatINR(tr.change)}</p><TrendCaption t={tr} /></div>}>
          <AreaChart points={tr.points.map((p) => ({ t: p.t, v: p.v }))} tone={tr.direction === "none" ? "gold" : growthDirection(tr.direction)} mode="datetime" step valueLabel="Salary pot balance" height={260}
            emptyTitle="No salary pot history yet" emptyHint="The graph starts when money is allocated to the Salary Pot or a salary payout is made." />
        </Panel>
        <Panel className="lg:col-span-2" title="Quick actions">
          <div className="grid gap-2.5">
            {existing ? (
              <QuickAction href={`/owner/pots/salary/${existing.id}`} icon={FolderOpen} title={`Open ${period} payroll`} desc={STAGE[existing.status] ?? existing.status} accent="green" />
            ) : (
              <form action={createPayrollRunAction}>
                <input type="hidden" name="period" value={period} />
                <button disabled={included.length === 0} className="pots-card-hover flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-black/30 p-3 text-left hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ color: "var(--color-radium-500)", borderColor: "rgba(57,255,106,0.3)", background: "rgba(57,255,106,0.08)" }}><FilePlus2 className="h-[18px] w-[18px]" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-100">Start payroll draft</span><span className="block truncate text-xs text-zinc-500">{included.length === 0 ? "No staff with a salary yet" : `${included.length} staff · ${formatINR(a.payableTotal)} for ${period}`}</span></span>
                </button>
              </form>
            )}
            <QuickAction href={`/owner/pots/${potSlug(a.pot)}`} icon={Coins} title="Fund the salary pot" desc="Move money in from Unallocated" accent="gold" />
            <QuickAction href="/owner/staff" icon={UserCog} title="Manage staff" desc="Add people, set salaries & hours" accent="blue" />
            <QuickAction href="/owner/pots/rules" icon={SlidersHorizontal} title="Salary allocation rule" desc="How much of each sale is saved" accent="neutral" />
          </div>
        </Panel>
      </div>

      <SandTimer
        title="Payroll cycle"
        startMs={pc.startMs}
        endMs={pc.endMs}
        nowMs={nowMs}
        suffix="to month end"
        done={existing?.status === "COMPLETED"}
        doneLabel="Salaries paid"
        caption={existing ? STAGE[existing.status] : "No payroll draft started yet"}
      />

      <Panel title="Payroll timeline" subtitle={`${monthName(period)} · Draft Created → Under Review → Approved → Paid`}>
        <PayrollStepper stages={a.stages} />
      </Panel>

      <Panel title="Staff overview" subtitle={`${monthName(period)} · attendance = days present ÷ working days elapsed`}
        action={<form method="get" className="flex items-end gap-2"><input type="hidden" name="range" value={range} /><Field label="Jump to month"><input type="month" name="month" defaultValue={period} className={`${inputCls} !w-auto !py-1 [color-scheme:dark]`} /></Field><button className={`${btnMuted} !py-1.5`}>Show</button></form>}>
        {included.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 py-10 text-center">
            <Users className="h-6 w-6 text-zinc-700" />
            <p className="text-sm text-zinc-400">No active staff with a monthly salary.</p>
            <Link href="/owner/staff" className="text-xs underline" style={{ color: "var(--color-radium-500)" }}>Add or edit staff</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                <tr><th className="pb-2 font-medium">Employee</th><th className="pb-2 font-medium w-[200px]">Attendance</th><th className="pb-2 text-right font-medium">Days (P / A / UL)</th><th className="pb-2 text-right font-medium">Hours</th><th className="pb-2 text-right font-medium">Monthly</th><th className="pb-2 text-right font-medium">Deductions</th><th className="pb-2 text-right font-medium">Payable</th></tr>
              </thead>
              <tbody className="text-zinc-400">
                {included.map((x) => {
                  const e = empById.get(x.staffId)!;
                  return (
                    <tr key={x.staffId} className="border-t border-zinc-900 transition-colors hover:bg-white/[0.02]">
                      <td className="py-3 pr-3">
                        <Link href={`/owner/staff/${x.staffId}?month=${period}`} className="font-medium text-zinc-100 hover:underline" style={{ textDecorationColor: "var(--color-radium-500)" }}>{x.name}</Link>
                        <span className="block text-[11px] text-zinc-500">{x.employeeCode} · {x.designation}</span>
                      </td>
                      <td className="pr-4">
                        {e.attendancePct === null ? <span className="text-zinc-600">No working days yet</span> : (
                          <div className="flex items-center gap-2"><div className="flex-1"><ProgressBar pct={e.attendancePct} tone={attendanceTone(e.attendancePct)} /></div><span className="w-12 text-right font-semibold tabular-nums text-zinc-200">{e.attendancePct}%</span></div>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{x.summary.presentDays} / {x.summary.absentDays} / {x.summary.unpaidLeaveDays}</td>
                      <td className="text-right tabular-nums">{formatDuration(x.summary.totalMinutes)}{x.summary.overtimeMinutes ? <span className="block text-[10px] text-zinc-500">+{formatDuration(x.summary.overtimeMinutes)} OT</span> : null}</td>
                      <td className="text-right tabular-nums">{formatINR(x.monthlySalaryPaise!)}</td>
                      <td className="text-right tabular-nums" style={{ color: x.payable!.deductionPaise ? TONE.down : undefined }}>{x.payable!.deductionPaise ? `−${formatINR(x.payable!.deductionPaise)}` : "—"}</td>
                      <td className="text-right font-bold tabular-nums text-zinc-50">{formatINR(x.payable!.payablePaise)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="border-t border-zinc-700 text-zinc-300"><td className="pt-3 font-semibold" colSpan={6}>Total payable</td><td className="pt-3 text-right font-extrabold tabular-nums" style={{ color: "var(--color-gold-500)" }}>{formatINR(a.payableTotal)}</td></tr></tfoot>
            </table>
          </div>
        )}
        {excluded.length > 0 ? <p className="mt-3 text-xs text-zinc-500">Not in this payroll: {excluded.map((x) => `${x.name} (${x.excluded === "inactive" ? "inactive" : "no salary set"})`).join(", ")}.</p> : null}
        <p className="mt-2 text-xs text-zinc-500">Employee records are not stored here; change them in the <Link href="/owner/staff" className="underline">Staff module</Link>. Days not yet recorded count as absent once the day has passed.</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 sm:gap-5">
        <Panel title="Recent salary allocations" subtitle="Latest movements in the Salary Pot ledger">
          {a.recent.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">No salary pot movements yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {a.recent.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0"><p className="truncate font-medium text-zinc-200">{x.label}</p><p className="truncate text-zinc-500">{when(x.at)}{x.reason ? ` · ${x.reason}` : ""}</p></div>
                  <div className="text-right"><p className="font-semibold tabular-nums" style={{ color: x.amount < 0 ? TONE.down : TONE.up }}>{x.amount > 0 ? "+" : ""}{formatINR(x.amount)}</p><p className="tabular-nums text-zinc-600">Bal {formatINR(x.balanceAfter)}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Payroll runs" subtitle={`${count("DRAFT")} draft · ${count("APPROVED")} approved, unpaid · ${count("COMPLETED")} paid`}>
          {runs.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">No payroll runs yet.</p> : (
            <ul className="divide-y divide-zinc-900">
              {runs.map((x) => (
                <li key={x.id}><Link href={`/owner/pots/salary/${x.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:text-zinc-100">
                  <span className="text-zinc-300">{x.period} · <span className="tabular-nums">{formatINR(rt.payroll.total(x).final)}</span></span>
                  <span className={`text-xs ${statusCls(x.status)}`}>{STAGE[x.status] ?? x.status}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <HistoryNotice note={a.history} />
      <p className="text-xs text-zinc-500">{SANDBOX}</p>
    </div>
  );
}