"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Camera, CalendarOff, Check, Clock3, Eye, Lock, LogIn, LogOut, Pencil, Plus, Search, Trash2,
  UserCheck, UserCog, Users, UserX, Wallet, X,
} from "lucide-react";
import { lockStaffPage } from "@/server/modules/auth/staff-pin-actions";
import { DESIGNATIONS, type Designation } from "@/lib/staff-designations";
import type { DayStatus } from "@/lib/staff-shifts";
import {
  addLeaveAction, addStaffAction, cancelLeaveAction, changeDesignationAction, checkInAction, checkOutAction,
  decideLeaveAction, deleteStaffAction, editStaffAction, setStaffStatusAction, type StaffActionResult,
} from "./actions";
import { Avatar, KpiCard, MiniBars, PctBar, Section, StatusBadge } from "./staff-ui";

type LeaveType = "casual" | "sick" | "unpaid";
type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRow {
  id: string;
  type: LeaveType;
  status: LeaveStatus;
  fromLabel: string;
  toLabel: string;
  days: number;
  reason: string;
  when: "past" | "current" | "upcoming";
}

export interface StaffRow {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  photo: string | null;
  employeeCode: string;
  designation: Designation;
  customDesignation: string;
  /** What to show everywhere: the custom title when "Other" was chosen. */
  designationText: string;
  /** Rupees as typed in the form, "" when not set. */
  monthlySalary: string;
  monthlySalaryLabel: string;
  salaryNum: number;
  standardDailyHours: number;
  overtimeEnabled: boolean;
  overtimeAfterHours: number;
  overtimeRate: string;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  shiftText: string;
  status: "active" | "inactive";
  lastActiveLabel: string;
  joinedOn: string; // yyyy-mm-dd, "" when not set
  joinedLabel: string;
  onLeave: boolean;
  leaves: LeaveRow[];
  pendingLeaves: number;
  editable: boolean;
  // Today
  day: DayStatus;
  checkInLabel: string;
  checkOutLabel: string;
  todayLabel: string;
  lateBy: number;
  earlyBy: number;
  // This month (same numbers as Pots -> Salary)
  month: {
    present: number;
    absent: number;
    leaveDays: number;
    pct: number | null;
    minutes: number;
    minutesLabel: string;
    overtimeLabel: string;
    lateCount: number;
    earlyCount: number;
  };
}

export interface StaffKpi {
  total: number;
  active: number;
  present: number;
  absent: number;
  onLeave: number;
  hours: string;
  salary: string;
  payable: string | null;
}

const LEAVE_LABEL: Record<LeaveType, string> = { casual: "Casual", sick: "Sick", unpaid: "Unpaid" };

type FormDialogState = { mode: "add" } | { mode: "edit"; member: StaffRow } | { mode: "role"; member: StaffRow };
type DialogState = FormDialogState | { mode: "delete"; member: StaffRow } | { mode: "leaves"; memberId: string };

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#d7fe3b] focus:outline-none";
const rowButton =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-[#d7fe3b] disabled:opacity-50";
const dangerButton =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50";
const punchButton =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50";
const dialogShell = "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4";
const dialogCard = "max-h-[92vh] w-full overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6";
const ghostBtn = "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100";
const primaryBtn = "rounded-lg bg-[#d7fe3b] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Date input that opens the calendar on click, with a light icon on dark. */
function DateField({ name, value, onChange, defaultValue, required, min }: {
  name: string; value?: string; onChange?: (v: string) => void; defaultValue?: string; required?: boolean; min?: string;
}) {
  const controlled = value !== undefined;
  return (
    <input
      name={name}
      type="date"
      required={required}
      min={min}
      {...(controlled
        ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) }
        : { defaultValue })}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker();
        } catch {
          // Older browsers: the native icon still works.
        }
      }}
      className={`${inputClass} cursor-pointer [color-scheme:dark]`}
    />
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

/** Square-crops and shrinks a photo to ~160px JPEG so it stays small enough to store with the record. */
async function toAvatarDataUrl(file: File, size = 160): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.8);
}

type SortKey = "name" | "id" | "salary" | "joined" | "hours" | "attendance";
const SORTERS: Record<SortKey, (a: StaffRow, b: StaffRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  id: (a, b) => a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true }),
  salary: (a, b) => b.salaryNum - a.salaryNum,
  joined: (a, b) => b.joinedOn.localeCompare(a.joinedOn),
  hours: (a, b) => b.month.minutes - a.month.minutes,
  attendance: (a, b) => (b.month.pct ?? -1) - (a.month.pct ?? -1),
};

export function StaffManager({
  members,
  assignableDesignations,
  daily,
  periodLabel,
  kpi,
}: {
  members: StaffRow[];
  assignableDesignations: Designation[];
  daily: { label: string; present: number; hours: number }[];
  periodLabel: string;
  kpi: StaffKpi;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<"all" | "active" | "inactive">("all");
  const [fDay, setFDay] = useState<"all" | "present" | DayStatus>("all");
  const [fRole, setFRole] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");

  const roles = useMemo(() => [...new Set(members.map((m) => m.designationText))].sort(), [members]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => {
        if (fStatus !== "all" && m.status !== fStatus) return false;
        if (fDay === "present" ? m.day !== "working" && m.day !== "checked_out" : fDay !== "all" && m.day !== fDay) return false;
        if (fRole !== "all" && m.designationText !== fRole) return false;
        if (!q) return true;
        return [m.name, m.employeeCode, m.phone, m.email, m.designationText].some((v) => v.toLowerCase().includes(q));
      })
      .sort(SORTERS[sort]);
  }, [members, query, fStatus, fDay, fRole, sort]);

  /** KPI card click: set the list filters/sort, then scroll to the list. */
  function focusList(f: { status?: "all" | "active" | "inactive"; day?: "all" | "present" | DayStatus; sort?: SortKey }) {
    setQuery("");
    setFRole("all");
    setFStatus(f.status ?? "all");
    setFDay(f.day ?? "all");
    if (f.sort) setSort(f.sort);
    document.getElementById("staff-employees")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const noFilters = query === "" && fStatus === "all" && fDay === "all" && fRole === "all";

  const filtersOn = query !== "" || fStatus !== "all" || fDay !== "all" || fRole !== "all";

  function run(fn: () => Promise<StaffActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      setNotice(res.ok ? null : res.error);
    });
  }
  const toggleStatus = (m: StaffRow) => run(() => setStaffStatusAction(m.id, m.status === "active" ? "inactive" : "active"));
  const punch = (m: StaffRow, kind: "in" | "out") => run(() => (kind === "in" ? checkInAction(m.id) : checkOutAction(m.id)));
  const open = (d: DialogState) => {
    setNotice(null);
    setDialog(d);
  };

  const leavesMember = dialog?.mode === "leaves" ? (members.find((m) => m.id === dialog.memberId) ?? null) : null;

  /** Today's status, times and the check-in / check-out button. */
  const todayCell = (m: StaffRow) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={m.day} />
        {m.lateBy > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300">Late {m.lateBy}m</span>}
        {m.earlyBy > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300">Left {m.earlyBy}m early</span>}
      </div>
      {(m.day === "working" || m.day === "checked_out") && (
        <p className="text-[11px] tabular-nums text-zinc-500">
          {m.checkInLabel} → {m.checkOutLabel} · {m.todayLabel}
        </p>
      )}
      {m.editable && m.status === "active" && m.day !== "checked_out" && m.day !== "on_leave" && (
        m.day === "working" ? (
          <button type="button" disabled={pending} onClick={() => punch(m, "out")} className={`${punchButton} border-zinc-700 text-zinc-200`}>
            <LogOut className="h-3.5 w-3.5" /> Check out
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => punch(m, "in")} className={`${punchButton} border-[#d7fe3b]/40 bg-[#d7fe3b]/10 text-[#d7fe3b]`}>
            <LogIn className="h-3.5 w-3.5" /> Check in
          </button>
        )
      )}
    </div>
  );

  const actions = (m: StaffRow, iconOnly: boolean) => {
    const label = (t: string) => <span className={iconOnly ? "sr-only" : ""}>{t}</span>;
    if (!m.editable) return <span className="text-xs text-zinc-600">Owner only</span>;
    return (
      <div className="flex flex-wrap items-center gap-0.5">
        <Link href={`/owner/staff/${m.id}`} className={rowButton} title="View profile" aria-label={`View ${m.name}`}>
          <Eye className="h-3.5 w-3.5" /> {label("View")}
        </Link>
        <button type="button" className={rowButton} disabled={pending} title="Edit" aria-label={`Edit ${m.name}`} onClick={() => open({ mode: "edit", member: m })}>
          <Pencil className="h-3.5 w-3.5" /> {label("Edit")}
        </button>
        <button type="button" className={`${rowButton} relative`} disabled={pending} title="Leaves" aria-label={`Leaves for ${m.name}`} onClick={() => open({ mode: "leaves", memberId: m.id })}>
          <CalendarOff className="h-3.5 w-3.5" /> {label("Leaves")}
          {m.pendingLeaves > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />}
        </button>
        <button type="button" className={rowButton} disabled={pending} title="Change role" aria-label={`Change role for ${m.name}`} onClick={() => open({ mode: "role", member: m })}>
          <UserCog className="h-3.5 w-3.5" /> {label("Change Role")}
        </button>
        <button type="button" className={rowButton} disabled={pending} title={m.status === "active" ? "Deactivate" : "Reactivate"} aria-label={`${m.status === "active" ? "Deactivate" : "Reactivate"} ${m.name}`} onClick={() => toggleStatus(m)}>
          {m.status === "active" ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
          {label(m.status === "active" ? "Deactivate" : "Reactivate")}
        </button>
        <button type="button" className={dangerButton} disabled={pending} title="Delete" aria-label={`Delete ${m.name}`} onClick={() => open({ mode: "delete", member: m })}>
          <Trash2 className="h-3.5 w-3.5" /> {label("Delete")}
        </button>
      </div>
    );
  };

  const statusPill = (m: StaffRow) => (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${m.status === "active" ? "bg-[#d7fe3b]/10 text-[#d7fe3b]" : "bg-zinc-800 text-zinc-400"}`}>
      {m.status === "active" ? "Active" : "Inactive"}
    </span>
  );

  const monthStats = (m: StaffRow) => (
    <div className="space-y-1">
      <PctBar pct={m.month.pct} />
      <p className="text-[11px] tabular-nums text-zinc-500">
        P {m.month.present} · A {m.month.absent} · L {m.month.leaveDays} · {m.month.minutesLabel}
        {m.month.overtimeLabel !== "—" ? ` · OT ${m.month.overtimeLabel}` : ""}
      </p>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Staff Management</h1>
          <p className="mt-1 text-sm text-zinc-400">People, attendance and leave for {periodLabel}. Payroll reads from here.</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={lockStaffPage}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100">
              <Lock className="h-4 w-4" /> Lock
            </button>
          </form>
          <button type="button" onClick={() => open({ mode: "add" })} className="inline-flex items-center gap-2 rounded-lg bg-[#d7fe3b] px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90">
            <Plus className="h-4 w-4" /> Add Staff
          </button>
        </div>
      </div>

      {notice && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{notice}</p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Total employees" value={String(kpi.total)} icon={Users} tone="blue" hint="Show everyone" onClick={() => focusList({})} active={noFilters} />
        <KpiCard label="Active" value={String(kpi.active)} hint={`${kpi.total - kpi.active} inactive`} icon={UserCheck} tone="lime" onClick={() => focusList({ status: "active" })} active={fStatus === "active" && fDay === "all" && fRole === "all" && query === ""} />
        <KpiCard label="Present today" value={String(kpi.present)} hint="Checked in" icon={LogIn} tone="lime" onClick={() => focusList({ day: "present" })} active={fDay === "present"} />
        <KpiCard label="Absent today" value={String(kpi.absent)} hint="Past shift start, no check-in" icon={UserX} tone="red" onClick={() => focusList({ day: "absent" })} active={fDay === "absent"} />
        <KpiCard label="On leave" value={String(kpi.onLeave)} hint="Approved leave today" icon={CalendarOff} tone="gold" onClick={() => focusList({ day: "on_leave" })} active={fDay === "on_leave"} />
        <KpiCard label="Working hours" value={kpi.hours} hint="Click to sort by hours" icon={Clock3} tone="neutral" onClick={() => focusList({ sort: "hours" })} active={sort === "hours"} />
        <KpiCard label="Salary expense" value={kpi.salary} hint={kpi.payable ? `${kpi.payable} payable after deductions` : "Click to sort by salary"} icon={Wallet} tone="gold" onClick={() => focusList({ sort: "salary" })} active={sort === "salary"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Daily attendance" subtitle={`Employees checked in each day · ${periodLabel}`}>
          <MiniBars data={daily.map((d) => ({ label: d.label, value: d.present }))} unit="present" />
        </Section>
        <Section title="Working hours per day" subtitle="Total hours across all staff">
          <MiniBars data={daily.map((d) => ({ label: d.label, value: d.hours }))} unit="h" color="#fbbf24" />
        </Section>
      </div>

      <div id="staff-employees" className="scroll-mt-4">
        <Section title="Employees" subtitle={`${shown.length} of ${members.length} shown · attendance = days present ÷ working days so far (P present, A absent, L leave)`}>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID, phone, email" aria-label="Search employees" className={`${inputClass} pl-9`} />
            </div>
            <select aria-label="Employment status" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className={inputClass}>
              <option value="all">All employment</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select aria-label="Attendance today" value={fDay} onChange={(e) => setFDay(e.target.value as typeof fDay)} className={inputClass}>
              <option value="all">Any status today</option>
              <option value="present">Present (checked in)</option>
              <option value="working">Working</option>
              <option value="checked_out">Checked out</option>
              <option value="on_leave">On leave</option>
              <option value="absent">Absent</option>
              <option value="not_in_yet">Not in yet</option>
            </select>
            <select aria-label="Role" value={fRole} onChange={(e) => setFRole(e.target.value)} className={inputClass}>
              <option value="all">All roles</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={inputClass}>
              <option value="name">Sort: Name</option>
              <option value="id">Sort: Employee ID</option>
              <option value="salary">Sort: Salary (high first)</option>
              <option value="joined">Sort: Newest joined</option>
              <option value="hours">Sort: Hours (most first)</option>
              <option value="attendance">Sort: Attendance %</option>
            </select>
            {filtersOn && (
              <button type="button" onClick={() => { setQuery(""); setFStatus("all"); setFDay("all"); setFRole("all"); }} className="inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
              {members.length === 0 ? "No staff yet. Use Add Staff to create the first member." : "No one matches these filters."}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      {["Employee", "Contact", "Role", "Joined", "Salary / month", "Today", "This month", "Status", "Actions"].map((h) => (
                        <th key={h} className="px-3 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {shown.map((m) => (
                      <tr key={m.id} className={`align-top ${m.status === "inactive" ? "opacity-60" : ""}`}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.name} photo={m.photo} />
                            <div className="min-w-0">
                              <Link href={`/owner/staff/${m.id}`} className="block truncate font-medium text-zinc-100 hover:text-[#d7fe3b] hover:underline">{m.name}</Link>
                              <span className="text-xs text-zinc-500">{m.employeeCode}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-zinc-400">
                          {m.phone && <p>{m.phone}</p>}
                          {m.email && <p className="max-w-[170px] truncate">{m.email}</p>}
                        </td>
                        <td className="px-3 py-3 text-zinc-300">{m.designationText}<span className="block text-[11px] text-zinc-500">{m.shiftText}</span></td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-400">{m.joinedLabel}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-300">{m.monthlySalaryLabel}</td>
                        <td className="px-3 py-3">{todayCell(m)}</td>
                        <td className="px-3 py-3">{monthStats(m)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1">
                            {statusPill(m)}
                            <span className="text-[11px] text-zinc-600">Last active {m.lastActiveLabel}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">{actions(m, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {shown.map((m) => (
                  <div key={m.id} className={`space-y-3 rounded-xl border border-zinc-800 bg-black/30 p-3 ${m.status === "inactive" ? "opacity-70" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={m.name} photo={m.photo} size={44} />
                        <div className="min-w-0">
                          <Link href={`/owner/staff/${m.id}`} className="block truncate font-semibold text-zinc-100">{m.name}</Link>
                          <p className="text-xs text-zinc-500">{m.employeeCode} · {m.designationText}</p>
                        </div>
                      </div>
                      {statusPill(m)}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div><dt className="text-zinc-500">Phone</dt><dd className="truncate text-zinc-300">{m.phone || "—"}</dd></div>
                      <div><dt className="text-zinc-500">Email</dt><dd className="truncate text-zinc-300">{m.email || "—"}</dd></div>
                      <div><dt className="text-zinc-500">Joined</dt><dd className="text-zinc-300">{m.joinedLabel}</dd></div>
                      <div><dt className="text-zinc-500">Salary / month</dt><dd className="text-zinc-300">{m.monthlySalaryLabel}</dd></div>
                    </dl>
                    {todayCell(m)}
                    {monthStats(m)}
                    <div className="border-t border-zinc-900 pt-2">{actions(m, false)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      </div>

      {dialog?.mode === "delete" && <DeleteDialog key={`delete-${dialog.member.id}`} member={dialog.member} onClose={() => setDialog(null)} />}
      {leavesMember && <LeavesDialog key={`leaves-${leavesMember.id}`} member={leavesMember} onClose={() => setDialog(null)} />}
      {dialog && (dialog.mode === "add" || dialog.mode === "edit" || dialog.mode === "role") && (
        <StaffDialog
          key={dialog.mode === "add" ? "add" : `${dialog.mode}-${dialog.member.id}`}
          state={dialog}
          assignableDesignations={assignableDesignations}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function StaffDialog({ state, assignableDesignations, onClose }: { state: FormDialogState; assignableDesignations: Designation[]; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const member = state.mode === "add" ? null : state.member;
  const defaultDesignation = member?.designation ?? assignableDesignations[0] ?? "other";
  const [designation, setDesignation] = useState<Designation>(defaultDesignation);
  const [overtimeOn, setOvertimeOn] = useState(member?.overtimeEnabled ?? false);
  // undefined = keep the saved photo, null = remove it, string = new photo
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const shownPhoto = photo === undefined ? (member?.photo ?? null) : photo;
  const noRolesAvailable = assignableDesignations.length === 0;
  useEscape(onClose);

  const title = state.mode === "add" ? "Add Staff" : state.mode === "edit" ? "Edit Staff" : "Change Role";

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await toAvatarDataUrl(file));
      setError(null);
    } catch {
      setError("That file could not be read as an image.");
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (noRolesAvailable) {
      setError("You do not have permission to assign any staff roles.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "");
    const customDesignation = str("customDesignation");
    const status = str("status") || member?.status || "active";
    const profile = {
      name: str("name"),
      email: str("email"),
      phone: str("phone"),
      address: str("address"),
      photo,
      designation,
      customDesignation,
      joinedOn: str("joinedOn"),
      monthlySalary: str("monthlySalary"),
      shiftStart: str("shiftStart"),
      shiftEnd: str("shiftEnd"),
      graceMinutes: Number(str("graceMinutes") || 0),
      overtimeEnabled: overtimeOn,
      overtimeAfterHours: Number(str("overtimeAfterHours")) || undefined,
      overtimeRate: str("overtimeRate"),
    };
    setError(null);
    startTransition(async () => {
      let res: StaffActionResult;
      if (state.mode === "add") {
        res = await addStaffAction({ ...profile, status });
      } else if (state.mode === "edit") {
        res = await editStaffAction(state.member.id, { ...profile, status });
      } else {
        res = await changeDesignationAction(state.member.id, designation, customDesignation);
      }
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  const roleFields = (
    <>
      <Field label="Role">
        <select
          name="designation"
          value={designation}
          disabled={noRolesAvailable}
          onChange={(e) => setDesignation(e.target.value as Designation)}
          className={inputClass}
        >
          {DESIGNATIONS.filter((d) => assignableDesignations.includes(d.key)).map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
      </Field>
      {designation === "other" && !noRolesAvailable && (
        <Field label="Custom role">
          <input name="customDesignation" required minLength={2} maxLength={40} defaultValue={member?.customDesignation ?? ""} className={inputClass} placeholder="e.g. Dishwasher, Security" autoFocus />
        </Field>
      )}
    </>
  );

  return (
    <div className={dialogShell} role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
      <form onSubmit={onSubmit} className={`${dialogCard} ${state.mode === "role" ? "max-w-md" : "max-w-2xl"} space-y-5`}>
        <h2 id="staff-dialog-title" className="text-lg font-semibold text-zinc-50">{title}</h2>

        {state.mode === "role" && member ? (
          <>
            <p className="text-sm text-zinc-400">Choose a new role for <span className="text-zinc-100">{member.name}</span>.</p>
            {roleFields}
          </>
        ) : (
          <>
            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-semibold text-zinc-300">Personal details</legend>
              <div className="flex items-center gap-4">
                <Avatar name={member?.name || "New"} photo={shownPhoto} size={64} />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                    <Camera className="h-3.5 w-3.5" /> {shownPhoto ? "Change photo" : "Add photo"}
                    <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} />
                  </label>
                  {shownPhoto && <button type="button" onClick={() => setPhoto(null)} className="text-xs text-zinc-500 hover:text-red-400">Remove</button>}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name"><input name="name" required minLength={2} maxLength={80} defaultValue={member?.name ?? ""} className={inputClass} placeholder="Full name" /></Field>
                <Field label="Employee ID"><input readOnly value={member?.employeeCode ?? "Assigned automatically on save"} className={`${inputClass} cursor-not-allowed text-zinc-500`} /></Field>
                <Field label="Phone number"><input name="phone" type="tel" maxLength={20} defaultValue={member?.phone ?? ""} className={inputClass} placeholder="+91 98765 43210" /></Field>
                <Field label="Email"><input name="email" type="email" maxLength={120} defaultValue={member?.email ?? ""} className={inputClass} placeholder="name@example.com" /></Field>
              </div>
              <Field label="Address"><textarea name="address" rows={2} maxLength={200} defaultValue={member?.address ?? ""} className={inputClass} placeholder="Street, area, city" /></Field>
              <p className="text-[11px] text-zinc-500">Phone or email is required (at least one). Each must be unique.</p>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-semibold text-zinc-300">Job</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {roleFields}
                <Field label="Joining date"><DateField name="joinedOn" defaultValue={member?.joinedOn ?? ""} /></Field>
                <Field label="Employment status">
                  <select name="status" defaultValue={member?.status ?? "active"} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-semibold text-zinc-300">Pay and shift</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Monthly salary (₹)"><input name="monthlySalary" inputMode="decimal" defaultValue={member?.monthlySalary ?? ""} className={inputClass} placeholder="e.g. 26000" /></Field>
                <Field label="Late / early grace (minutes)"><input name="graceMinutes" type="number" min={0} max={120} required defaultValue={member?.graceMinutes ?? 10} className={inputClass} /></Field>
                <Field label="Shift starts"><input name="shiftStart" type="time" required defaultValue={member?.shiftStart ?? "09:00"} className={`${inputClass} [color-scheme:dark]`} /></Field>
                <Field label="Shift ends"><input name="shiftEnd" type="time" required defaultValue={member?.shiftEnd ?? "17:00"} className={`${inputClass} [color-scheme:dark]`} /></Field>
              </div>
              <p className="text-[11px] text-zinc-500">Working hours per day are taken from the shift length. Check-ins after start + grace count as late.</p>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={overtimeOn} onChange={(e) => setOvertimeOn(e.target.checked)} className="h-4 w-4 accent-[#d7fe3b]" />
                Track overtime
              </label>
              {overtimeOn && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Overtime after (hours)"><input name="overtimeAfterHours" type="number" min={1} max={16} step="0.5" defaultValue={member?.overtimeAfterHours ?? ""} className={inputClass} placeholder="Default: shift length" /></Field>
                  <Field label="Overtime ₹ / hour"><input name="overtimeRate" inputMode="decimal" defaultValue={member?.overtimeRate ?? ""} className={inputClass} placeholder="0 = tracked, not paid" /></Field>
                </div>
              )}
            </fieldset>
          </>
        )}

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={pending || noRolesAvailable} className={primaryBtn}>{pending ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-amber-400/10 text-amber-300",
  approved: "bg-[#d7fe3b]/10 text-[#d7fe3b]",
  rejected: "bg-zinc-800 text-zinc-400",
};

function LeavesDialog({ member, onClose }: { member: StaffRow; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEscape(onClose);

  function isoDay(offsetDays: number): string {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function pickFrom(v: string) {
    setFrom(v);
    // Keep "To" valid: empty or earlier than From becomes the same day.
    if (!to || to < v) setTo(v);
  }
  function quick(offsetDays: number) {
    const day = isoDay(offsetDays);
    setFrom(day);
    setTo(day);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      type: String(fd.get("type") ?? ""),
      status: String(fd.get("status") ?? "approved"),
      from,
      to,
      reason: String(fd.get("reason") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const res = await addLeaveAction(member.id, input);
      if (res.ok) {
        form.reset();
        setFrom("");
        setTo("");
      } else {
        setError(res.error);
      }
    });
  }

  const act = (fn: () => Promise<StaffActionResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
    });
  };

  const WHEN_STYLE = { current: "bg-amber-400/10 text-amber-300", upcoming: "bg-[#d7fe3b]/10 text-[#d7fe3b]", past: "bg-zinc-800 text-zinc-400" } as const;
  const WHEN_LABEL = { current: "On leave now", upcoming: "Upcoming", past: "Past" } as const;
  const chip = "rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-[#d7fe3b] hover:text-[#d7fe3b]";

  return (
    <div className={dialogShell} role="dialog" aria-modal="true" aria-labelledby="leaves-dialog-title">
      <div className={`${dialogCard} max-w-lg space-y-5`}>
        <div>
          <h2 id="leaves-dialog-title" className="text-lg font-semibold text-zinc-50">Leaves: {member.name}</h2>
          <p className="mt-1 text-xs text-zinc-500">Joined {member.joinedLabel}. Only approved leave counts for attendance and pay.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-zinc-800 p-4">
          <p className="text-xs font-semibold text-zinc-300">Add leave</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Quick pick:</span>
            <button type="button" className={chip} onClick={() => quick(0)}>Today</button>
            <button type="button" className={chip} onClick={() => quick(1)}>Tomorrow</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select name="type" defaultValue="casual" className={inputClass}>
                {(Object.keys(LEAVE_LABEL) as LeaveType[]).map((t) => <option key={t} value={t}>{LEAVE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Record as">
              <select name="status" defaultValue="approved" className={inputClass}>
                <option value="approved">Approved</option>
                <option value="pending">Request (needs approval)</option>
              </select>
            </Field>
            <Field label="From"><DateField name="from" value={from} onChange={pickFrom} required /></Field>
            <Field label="To"><DateField name="to" value={to} onChange={setTo} min={from || undefined} required /></Field>
          </div>
          <Field label="Reason (optional)"><input name="reason" maxLength={200} className={inputClass} placeholder="e.g. family function" /></Field>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Saving..." : "Add leave"}</button>
        </form>

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-300">History</p>
          {member.leaves.length === 0 ? (
            <p className="text-sm text-zinc-500">No leaves recorded.</p>
          ) : (
            member.leaves.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100">
                    {l.fromLabel === l.toLabel ? l.fromLabel : `${l.fromLabel} – ${l.toLabel}`}{" "}
                    <span className="text-zinc-500">· {l.days} day{l.days === 1 ? "" : "s"} · {LEAVE_LABEL[l.type]}</span>
                  </p>
                  {l.reason && <p className="mt-0.5 truncate text-xs text-zinc-400">{l.reason}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${LEAVE_STATUS_STYLE[l.status]}`}>
                      {l.status === "pending" ? "Awaiting approval" : l.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                    {l.status === "approved" && (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${WHEN_STYLE[l.when]}`}>{WHEN_LABEL[l.when]}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {l.status === "pending" && (
                    <div className="flex gap-1">
                      <button type="button" disabled={pending} onClick={() => act(() => decideLeaveAction(l.id, "approved"))} className={`${rowButton} text-[#d7fe3b]`}><Check className="h-3.5 w-3.5" /> Approve</button>
                      <button type="button" disabled={pending} onClick={() => act(() => decideLeaveAction(l.id, "rejected"))} className={dangerButton}><X className="h-3.5 w-3.5" /> Reject</button>
                    </div>
                  )}
                  {(l.status !== "approved" || l.when !== "past") && (
                    <button type="button" disabled={pending} onClick={() => act(() => cancelLeaveAction(l.id))} className={dangerButton}>
                      {l.status === "approved" ? "Cancel leave" : "Remove"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button type="button" onClick={onClose} className={ghostBtn}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ member, onClose }: { member: StaffRow; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEscape(onClose);

  function confirmDelete() {
    startTransition(async () => {
      const res = await deleteStaffAction(member.id);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div className={dialogShell} role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-desc">
      <div className={`${dialogCard} max-w-md space-y-4`}>
        <h2 id="delete-dialog-title" className="text-lg font-semibold text-zinc-50">Delete staff member?</h2>
        <p id="delete-dialog-desc" className="text-sm text-zinc-400">
          <span className="text-zinc-100">{member.name}</span> ({member.designationText}), their attendance and their leave records will be permanently removed. This cannot be undone. To keep the record and only block access, use Deactivate instead.
        </p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="button" onClick={confirmDelete} disabled={pending} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60">
            {pending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}