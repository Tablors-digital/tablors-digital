import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarOff, ChevronLeft, ChevronRight, Clock3, Gauge, LogIn, Timer, UserCheck, UserX } from "lucide-react";
import { designationLabel } from "@/lib/staff-designations";
import { formatDuration, isValidPeriod } from "@/lib/staff-hours";
import { dayStatus, earlyByMinutes, formatClock, isoToHHMM, lateByMinutes, nowMinuteIST, shiftLabel } from "@/lib/staff-shifts";
import { canActOnStaffRole } from "@/server/modules/auth/permissions";
import { requirePermission } from "@/server/modules/auth/session";
import { getStaffPinVerified } from "@/server/modules/auth/staff-session";
import { getStaff, listAllLeaves, listAttendance, todayInIndia } from "@/server/modules/demo-store/staff";
import { formatINR } from "@/server/modules/pots/money";
import { Avatar, KpiCard, MiniBars, PctBar, Section, StatusBadge } from "../staff-ui";
import { dayCount, entryMinutes, lastDayOf, leaveDaysInMonth, payrollFacts, summarizeEntries } from "../staff-data";
import { CorrectButton, PunchButtons } from "./profile-actions";

export const dynamic = "force-dynamic";

const shiftMonth = (period: string, by: number) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthName = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });

const LEAVE_TYPE = { casual: "Casual", sick: "Sick", unpaid: "Unpaid" } as const;
const LEAVE_STATE = { pending: "Awaiting approval", approved: "Approved", rejected: "Rejected" } as const;

export default async function StaffProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requirePermission("staff");
  if (!(await getStaffPinVerified())) redirect("/owner/staff-pin");

  const { id } = await params;
  const { month } = await searchParams;
  const today = todayInIndia();
  const period = month && isValidPeriod(month) ? month : today.slice(0, 7);

  // Scoped to the session's restaurant: another restaurant's id is "not found".
  const m = await getStaff(session.restaurantId, id);
  if (!m) notFound();
  if (!canActOnStaffRole(session.role, m.role)) redirect("/owner/staff");

  const [entries, allLeaves, facts] = await Promise.all([
    listAttendance(session.restaurantId, id, period),
    listAllLeaves(session.restaurantId),
    payrollFacts(session.restaurantId, period),
  ]);
  const leaves = allLeaves.filter((l) => l.staffId === id);
  const f = facts.get(id);

  const own = summarizeEntries(entries, today);
  const present = f?.summary?.presentDays ?? own.present;
  const absent = f?.summary?.absentDays ?? 0;
  const minutes = f?.summary?.totalMinutes ?? own.minutes;
  const overtime = f?.summary?.overtimeMinutes ?? 0;
  const pct = f?.attendancePct ?? (present + absent > 0 ? Math.round((present / (present + absent)) * 100) : null);
  const lateCount = entries.filter((e) => e.checkIn && lateByMinutes(e.checkIn, m.shift) > 0).length;
  const earlyCount = entries.filter((e) => e.checkOut && earlyByMinutes(e.checkOut, m.shift) > 0).length;

  // Today's state (only meaningful when looking at the current month).
  const todayEntry = (await listAttendance(session.restaurantId, id, today.slice(0, 7))).find((e) => e.date === today);
  const onLeaveToday = leaves.some((l) => l.status === "approved" && l.from <= today && today <= l.to);
  const day = dayStatus({ active: m.status === "active", onLeave: onLeaveToday, checkIn: todayEntry?.checkIn ?? null, checkOut: todayEntry?.checkOut ?? null, shift: m.shift, nowMinute: nowMinuteIST() });
  const punchState = m.status !== "active" || onLeaveToday ? "blocked" : !todayEntry?.checkIn ? "can_in" : !todayEntry.checkOut ? "can_out" : "done";

  // Calendar strip + hours chart for the month.
  const last = lastDayOf(period);
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const strip = Array.from({ length: last }, (_, i) => {
    const date = `${period}-${String(i + 1).padStart(2, "0")}`;
    const e = byDate.get(date);
    const onLeave = leaves.some((l) => l.status === "approved" && l.from <= date && date <= l.to);
    const state = e?.checkIn ? (lateByMinutes(e.checkIn, m.shift) > 0 ? "late" : "present") : onLeave ? "leave" : date > today ? "future" : "none";
    return { n: i + 1, date, state, hours: e ? Math.round((entryMinutes(e, today) / 60) * 10) / 10 : 0 };
  });
  const STRIP_CLS: Record<string, string> = {
    present: "bg-[#d7fe3b] text-black",
    late: "bg-amber-400 text-black",
    leave: "bg-sky-400/80 text-black",
    none: "bg-zinc-900 text-zinc-500",
    future: "border border-zinc-900 text-zinc-700",
  };

  const q = (p: string) => `/owner/staff/${id}?month=${p}`;
  const detail = (label: string, value: string) => (
    <div className="min-w-0"><dt className="text-[11px] text-zinc-500">{label}</dt><dd className="truncate text-sm text-zinc-200">{value || "—"}</dd></div>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link href="/owner/staff" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft className="h-4 w-4" /> Back to staff</Link>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={m.name} photo={m.photo} size={64} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-zinc-50">{m.name}</h1>
            <p className="text-sm text-zinc-400">{m.employeeCode} · {designationLabel(m.designation, m.customDesignation)}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge status={day} />
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${m.status === "active" ? "bg-[#d7fe3b]/10 text-[#d7fe3b]" : "bg-zinc-800 text-zinc-400"}`}>{m.status === "active" ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <PunchButtons staffId={id} state={punchState} />
          <CorrectButton staffId={id} today={today} label="Correct attendance" />
        </div>
      </section>

      <Section title="Details">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {detail("Phone", m.phone ?? "")}
          {detail("Email", m.email ?? "")}
          {detail("Address", m.address)}
          {detail("Joined", m.joinedOn ? fmtDay(m.joinedOn) : "")}
          {detail("Monthly salary", m.monthlySalaryPaise === null ? "Not set" : formatINR(m.monthlySalaryPaise))}
          {detail("Shift", `${shiftLabel(m.shift)} (grace ${m.shift.graceMinutes}m)`)}
          {detail("Hours per day", `${m.hours.standardDailyHours}h`)}
          {detail("Overtime", m.hours.overtimeEnabled ? `After ${m.hours.overtimeAfterHours}h${m.overtimeRatePerHourPaise ? ` · ${formatINR(m.overtimeRatePerHourPaise)}/h` : " · tracked, not paid"}` : "Not tracked")}
        </dl>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">{monthName(period)}</h2>
        <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-black/40 text-xs">
          <Link href={q(shiftMonth(period, -1))} aria-label="Previous month" className="px-2 py-1.5 text-zinc-400 hover:text-zinc-100"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[110px] text-center font-semibold text-zinc-100">{monthName(period)}</span>
          <Link href={q(shiftMonth(period, 1))} aria-label="Next month" className="px-2 py-1.5 text-zinc-400 hover:text-zinc-100"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Present" value={String(present)} icon={UserCheck} tone="lime" hint="Days checked in" />
        <KpiCard label="Absent" value={String(absent)} icon={UserX} tone="red" hint="Days passed, no record" />
        <KpiCard label="Leave" value={String(leaveDaysInMonth(leaves, period))} icon={CalendarOff} tone="gold" hint="Approved days" />
        <KpiCard label="Attendance" value={pct === null ? "—" : `${pct}%`} icon={Gauge} tone="blue" />
        <KpiCard label="Working hours" value={formatDuration(minutes)} icon={Clock3} tone="neutral" />
        <KpiCard label="Overtime" value={overtime ? formatDuration(overtime) : "—"} icon={Timer} tone="gold" />
        <KpiCard label="Late arrivals" value={String(lateCount)} icon={LogIn} tone="red" hint={`After start + ${m.shift.graceMinutes}m`} />
        <KpiCard label="Early departures" value={String(earlyCount)} icon={LogIn} tone="red" hint="Before end − grace" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Section className="lg:col-span-3" title="Hours per day" subtitle="Time between check-in and check-out">
          <MiniBars data={strip.filter((s) => s.date <= today).map((s) => ({ label: String(s.n), value: s.hours }))} unit="h" />
        </Section>
        <Section className="lg:col-span-2" title="Month at a glance" subtitle="Green on time · amber late · blue leave · grey no record">
          <div className="grid grid-cols-7 gap-1.5">
            {strip.map((s) => (
              <span key={s.n} title={`${dayLabel(s.date)}: ${s.state === "none" ? "no record" : s.state}`} className={`grid h-8 place-items-center rounded-md text-xs font-medium ${STRIP_CLS[s.state]}`}>{s.n}</span>
            ))}
          </div>
          <div className="mt-4"><PctBar pct={pct} /></div>
        </Section>
      </div>

      {f?.payablePaise != null && (
        <Section title="Salary this month" subtitle="Same figures as Financial Pots → Salary">
          <dl className="grid grid-cols-3 gap-3">
            {detail("Monthly salary", m.monthlySalaryPaise === null ? "—" : formatINR(m.monthlySalaryPaise))}
            {detail("Deductions", f.deductionPaise ? `−${formatINR(f.deductionPaise)}` : "None")}
            {detail("Payable", formatINR(f.payablePaise))}
          </dl>
        </Section>
      )}

      <Section title="Check-in / check-out history" subtitle="Newest first. Corrections keep the old times, who changed them and why.">
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">No attendance recorded in {monthName(period)}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <tr>{["Date", "Check-in", "Check-out", "Hours", "Flags", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {entries.map((e) => {
                  const late = e.checkIn ? lateByMinutes(e.checkIn, m.shift) : 0;
                  const early = e.checkOut ? earlyByMinutes(e.checkOut, m.shift) : 0;
                  const lastFix = e.corrections.at(-1);
                  return (
                    <tr key={e.date}>
                      <td className="whitespace-nowrap px-2 py-2.5 text-zinc-200">{dayLabel(e.date)}</td>
                      <td className="px-2 py-2.5 tabular-nums text-zinc-300">{formatClock(e.checkIn)}</td>
                      <td className="px-2 py-2.5 tabular-nums text-zinc-300">{e.checkOut ? formatClock(e.checkOut) : e.date === today && e.checkIn ? "Working" : "Missing"}</td>
                      <td className="px-2 py-2.5 tabular-nums text-zinc-300">{e.checkIn ? formatDuration(entryMinutes(e, today)) : "—"}</td>
                      <td className="px-2 py-2.5 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {late > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-300">Late {late}m</span>}
                          {early > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-300">Early {early}m</span>}
                          {lastFix && <span title={`${lastFix.reason} · by ${lastFix.by}`} className="rounded-full bg-sky-400/10 px-2 py-0.5 text-sky-300">Corrected{e.corrections.length > 1 ? ` ×${e.corrections.length}` : ""}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right"><CorrectButton staffId={id} today={today} date={e.date} checkIn={isoToHHMM(e.checkIn)} checkOut={isoToHHMM(e.checkOut)} label="Correct" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Leaves" subtitle="Manage requests from the Leaves action on the staff list.">
        {leaves.length === 0 ? (
          <p className="text-sm text-zinc-500">No leaves recorded.</p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-zinc-200">{l.from === l.to ? fmtDay(l.from) : `${fmtDay(l.from)} – ${fmtDay(l.to)}`} <span className="text-zinc-500">· {dayCount(l.from, l.to)}d · {LEAVE_TYPE[l.type]}{l.reason ? ` · ${l.reason}` : ""}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === "approved" ? "bg-[#d7fe3b]/10 text-[#d7fe3b]" : l.status === "pending" ? "bg-amber-400/10 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>{LEAVE_STATE[l.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
