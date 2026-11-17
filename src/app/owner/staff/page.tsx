import { redirect } from "next/navigation";
import { accessRoleFor, DESIGNATIONS, designationLabel } from "@/lib/staff-designations";
import { formatDuration } from "@/lib/staff-hours";
import { dayStatus, earlyByMinutes, lateByMinutes, formatClock, nowMinuteIST, shiftLabel } from "@/lib/staff-shifts";
import { canActOnStaffRole } from "@/server/modules/auth/permissions";
import { requirePermission } from "@/server/modules/auth/session";
import { getStaffPinVerified } from "@/server/modules/auth/staff-session";
import { listAllLeaves, listAttendanceForPeriod, listStaff, todayInIndia } from "@/server/modules/demo-store/staff";
import { StaffManager, type LeaveRow, type StaffRow } from "./staff-manager";
import { dayCount, entryMinutes, leaveDaysInMonth, payrollFacts, summarizeEntries } from "./staff-data";

export const dynamic = "force-dynamic";

// Formatted on the server in a fixed time zone so server and client render the same text.
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", dateStyle: "medium" });
const fmtDay = (d: string) => dayFormat.format(new Date(`${d}T00:00:00Z`));
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export default async function StaffPage() {
  // Unauthenticated -> /login. Cashier / Kitchen / Waiter -> their own home.
  const session = await requirePermission("staff");

  // PIN gate: no valid PIN session, no staff list.
  if (!(await getStaffPinVerified())) redirect("/owner/staff-pin");

  const today = todayInIndia();
  const period = today.slice(0, 7);
  const nowMinute = nowMinuteIST();
  const [allLeaves, staffList, entries, facts] = await Promise.all([
    listAllLeaves(session.restaurantId),
    listStaff(session.restaurantId),
    listAttendanceForPeriod(session.restaurantId, period),
    payrollFacts(session.restaurantId, period),
  ]);

  const rows: StaffRow[] = staffList.map((m) => {
    const mine = allLeaves.filter((l) => l.staffId === m.id);
    const leaves: LeaveRow[] = mine.map((l) => ({
      id: l.id,
      type: l.type,
      status: l.status,
      fromLabel: fmtDay(l.from),
      toLabel: fmtDay(l.to),
      days: dayCount(l.from, l.to),
      reason: l.reason,
      when: l.to < today ? "past" : l.from <= today ? "current" : "upcoming",
    }));
    const onLeave = mine.some((l) => l.status === "approved" && l.from <= today && today <= l.to);

    const myEntries = entries.filter((e) => e.staffId === m.id);
    const todayEntry = myEntries.find((e) => e.date === today);
    const day = dayStatus({
      active: m.status === "active",
      onLeave,
      checkIn: todayEntry?.checkIn ?? null,
      checkOut: todayEntry?.checkOut ?? null,
      shift: m.shift,
      nowMinute,
    });

    // Payroll's own numbers when available, so this screen always matches Pots -> Salary.
    const f = facts.get(m.id);
    const own = summarizeEntries(myEntries, today);
    const minutes = f?.summary?.totalMinutes ?? own.minutes;
    const present = f?.summary?.presentDays ?? own.present;
    const absent = f?.summary?.absentDays ?? 0;
    const pct = f?.attendancePct ?? (present + absent > 0 ? Math.round((present / (present + absent)) * 100) : null);

    const todayMinutes = todayEntry ? entryMinutes(todayEntry, today) : 0;
    const overtime = f?.summary?.overtimeMinutes ?? 0;

    return {
      id: m.id,
      name: m.name,
      contact: m.contact,
      email: m.email ?? "",
      phone: m.phone ?? "",
      address: m.address,
      photo: m.photo,
      employeeCode: m.employeeCode,
      designation: m.designation,
      customDesignation: m.customDesignation ?? "",
      designationText: designationLabel(m.designation, m.customDesignation),
      monthlySalary: m.monthlySalaryPaise === null ? "" : String(m.monthlySalaryPaise / 100),
      monthlySalaryLabel: m.monthlySalaryPaise === null ? "Not set" : rupees(m.monthlySalaryPaise),
      salaryNum: m.monthlySalaryPaise ?? 0,
      standardDailyHours: m.hours.standardDailyHours,
      overtimeEnabled: m.hours.overtimeEnabled,
      overtimeAfterHours: m.hours.overtimeAfterHours,
      overtimeRate: m.overtimeRatePerHourPaise ? String(m.overtimeRatePerHourPaise / 100) : "",
      shiftStart: m.shift.start,
      shiftEnd: m.shift.end,
      graceMinutes: m.shift.graceMinutes,
      shiftText: shiftLabel(m.shift),
      status: m.status,
      lastActiveLabel: m.lastActiveAt ? dateFormat.format(new Date(m.lastActiveAt)) : "Never",
      joinedOn: m.joinedOn ?? "",
      joinedLabel: m.joinedOn ? fmtDay(m.joinedOn) : "Not set",
      onLeave,
      leaves,
      pendingLeaves: mine.filter((l) => l.status === "pending").length,
      // UI hint only. Every action re-checks this on the server.
      editable: canActOnStaffRole(session.role, m.role),
      day,
      checkInLabel: formatClock(todayEntry?.checkIn ?? null),
      checkOutLabel: formatClock(todayEntry?.checkOut ?? null),
      todayLabel: todayEntry?.checkIn ? formatDuration(todayMinutes) : "—",
      lateBy: todayEntry?.checkIn ? lateByMinutes(todayEntry.checkIn, m.shift) : 0,
      earlyBy: todayEntry?.checkOut ? earlyByMinutes(todayEntry.checkOut, m.shift) : 0,
      month: {
        present,
        absent,
        leaveDays: leaveDaysInMonth(mine, period),
        pct,
        minutes,
        minutesLabel: formatDuration(minutes),
        overtimeLabel: overtime ? formatDuration(overtime) : "—",
        lateCount: myEntries.filter((e) => e.checkIn && lateByMinutes(e.checkIn, m.shift) > 0).length,
        earlyCount: myEntries.filter((e) => e.checkOut && earlyByMinutes(e.checkOut, m.shift) > 0).length,
      },
    };
  });

  // Totals are derived from the finished rows (no variables reassigned inside the map).
  const counts = {
    present: rows.filter((r) => r.day === "working" || r.day === "checked_out").length,
    absent: rows.filter((r) => r.day === "absent").length,
    onLeave: rows.filter((r) => r.day === "on_leave").length,
  };
  const totalMinutes = rows.reduce((sum, r) => sum + r.month.minutes, 0);
  const salaryPaise = rows.reduce((sum, r) => (r.status === "active" ? sum + r.salaryNum : sum), 0);

  // Day-by-day series for the two charts (1st of the month up to today).
  const daysSoFar = Number(today.slice(8, 10));
  const daily = Array.from({ length: daysSoFar }, (_, i) => {
    const date = `${period}-${String(i + 1).padStart(2, "0")}`;
    const ofDay = entries.filter((e) => e.date === date);
    return {
      label: String(i + 1),
      present: ofDay.filter((e) => e.checkIn).length,
      hours: Math.round((ofDay.reduce((s, e) => s + entryMinutes(e, today), 0) / 60) * 10) / 10,
    };
  });

  const activeCount = rows.filter((r) => r.status === "active").length;
  const payable = [...facts.values()].reduce((s, f) => s + (f.payablePaise ?? 0), 0);

  // Only designations whose access role this person is allowed to hand out.
  const assignableDesignations = DESIGNATIONS.filter((d) => canActOnStaffRole(session.role, accessRoleFor(d.key))).map((d) => d.key);

  return (
    <StaffManager
      members={rows}
      assignableDesignations={assignableDesignations}
      daily={daily}
      periodLabel={new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
      kpi={{
        total: rows.length,
        active: activeCount,
        present: counts.present,
        absent: counts.absent,
        onLeave: counts.onLeave,
        hours: formatDuration(totalMinutes),
        salary: rupees(salaryPaise),
        payable: payable ? rupees(payable) : null,
      }}
    />
  );
}