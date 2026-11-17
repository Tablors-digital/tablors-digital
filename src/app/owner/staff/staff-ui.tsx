import type { LucideIcon } from "lucide-react";
import type { DayStatus } from "@/lib/staff-shifts";

/** Shared, hook-free pieces for the Staff list and the Employee profile. */

export const STATUS_META: Record<DayStatus, { label: string; cls: string }> = {
  working: { label: "Working", cls: "bg-[#d7fe3b]/10 text-[#d7fe3b]" },
  checked_out: { label: "Checked out", cls: "bg-sky-400/10 text-sky-300" },
  on_leave: { label: "On leave", cls: "bg-amber-400/10 text-amber-300" },
  absent: { label: "Absent", cls: "bg-red-500/10 text-red-400" },
  not_in_yet: { label: "Not in yet", cls: "bg-zinc-800 text-zinc-400" },
  inactive: { label: "Inactive", cls: "bg-zinc-800 text-zinc-500" },
};

export function StatusBadge({ status }: { status: DayStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      {status === "working" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d7fe3b]" />}
      {m.label}
    </span>
  );
}

export function Avatar({ name, photo, size = 36 }: { name: string; photo: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const style = { width: size, height: size, fontSize: Math.max(11, size / 2.8) };
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={photo} alt="" style={style} className="shrink-0 rounded-full border border-zinc-700 object-cover" />;
  return (
    <span style={style} className="grid shrink-0 place-items-center rounded-full border border-zinc-700 bg-zinc-900 font-semibold text-[#d7fe3b]">
      {initials || "?"}
    </span>
  );
}

const TONES = {
  lime: "bg-[#d7fe3b]/10 text-[#d7fe3b]",
  gold: "bg-amber-400/10 text-amber-300",
  red: "bg-red-500/10 text-red-400",
  blue: "bg-sky-400/10 text-sky-300",
  neutral: "bg-zinc-800 text-zinc-300",
} as const;
export type Tone = keyof typeof TONES;

export function KpiCard({ label, value, hint, icon: Icon, tone, onClick, active }: { label: string; value: string; hint?: string; icon: LucideIcon; tone: Tone; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-400">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-50">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</p>}
    </>
  );
  const base = "rounded-xl border bg-zinc-950 p-3.5 sm:p-4";
  if (!onClick) return <div className={`${base} border-zinc-800`}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      title="Click to filter the list below"
      className={`${base} w-full cursor-pointer text-left transition-colors hover:border-[#d7fe3b]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d7fe3b] ${active ? "border-[#d7fe3b] bg-[#d7fe3b]/5" : "border-zinc-800"}`}
    >
      {body}
    </button>
  );
}

export function PctBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-zinc-600">No data yet</span>;
  const color = pct >= 90 ? "#d7fe3b" : pct >= 75 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-zinc-200">{pct}%</span>
    </div>
  );
}

export function Section({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Dependency-free bar chart. One bar per label; hover/focus shows the value. */
export function MiniBars({ data, unit, color = "#d7fe3b", height = 120 }: { data: { label: string; value: number }[]; unit: string; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-8 text-center text-xs text-zinc-600">Nothing recorded yet.</p>;
  const every = data.length > 16 ? 5 : 1;
  return (
    <div role="img" aria-label={`Bar chart in ${unit}`}>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} title={`${d.label}: ${d.value} ${unit}`} className="flex h-full flex-1 items-end">
            <div className="w-full rounded-t-sm" style={{ height: `${d.value === 0 ? 2 : Math.max(4, (d.value / max) * 100)}%`, background: d.value === 0 ? "#27272a" : color }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[10px] text-zinc-600">
        {data.map((d, i) => (
          <span key={d.label} className="flex-1 text-center">{i % every === 0 ? d.label : ""}</span>
        ))}
      </div>
    </div>
  );
}