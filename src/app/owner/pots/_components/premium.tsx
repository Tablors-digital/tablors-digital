import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownRight, ArrowUpRight, Check, CircleDot, Clock, Minus, TriangleAlert, X, type LucideIcon,
} from "lucide-react";
import type { Direction, PayrollStage, RangeKey, TimelineEvent, Trend } from "@/server/modules/pots/analytics";
import { RANGES } from "@/server/modules/pots/analytics";
import { formatINR } from "@/server/modules/pots/money";
import { TONE, fmtDateTime } from "@/components/pots/tones";

/* Shared building blocks for the Financial Pots redesign. Server-renderable; no new colours. */

type Accent = "gold" | "green" | "blue" | "neutral";
const ACCENT: Record<Accent, { text: string; rgb: string }> = {
  gold: { text: "var(--color-gold-500)", rgb: "212,175,55" },
  green: { text: "var(--color-radium-500)", rgb: "57,255,106" },
  blue: { text: "var(--color-info)", rgb: "79,180,255" },
  neutral: { text: "#d4d4d8", rgb: "161,161,170" },
};

export function Panel({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pots-panel rounded-2xl border border-zinc-800/80 p-4 sm:p-5 ${className}`}>
      {title ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h2>{subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}</div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageHero({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 p-5 sm:p-6" style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(212,175,55,0.10) 0%, rgba(5,7,10,0) 55%), linear-gradient(180deg, #0d1015 0%, #05070a 100%)" }}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full opacity-[0.10] blur-3xl" style={{ background: "var(--color-radium-500)" }} />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-gold-500)" }}>{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-50 sm:text-3xl">{title}</h1>
          {sub ? <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">{sub}</p> : null}
        </div>
        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

export function KpiCard({ label, value, icon: Icon, accent = "gold", hint, delta }: { label: string; value: string; icon: LucideIcon; accent?: Accent; hint?: ReactNode; delta?: ReactNode }) {
  const a = ACCENT[accent];
  return (
    <div className="pots-panel pots-card-hover pots-rise relative overflow-hidden rounded-2xl border border-zinc-800/80 p-4 sm:p-5" style={{ ["--pots-glow" as string]: `rgba(${a.rgb},0.35)` }}>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl" style={{ background: `rgba(${a.rgb},0.16)` }} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl border" style={{ color: a.text, borderColor: `rgba(${a.rgb},0.35)`, background: `rgba(${a.rgb},0.10)`, boxShadow: `0 0 18px rgba(${a.rgb},0.18)` }}><Icon className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="relative mt-3 text-[26px] font-extrabold leading-none tracking-tight tabular-nums text-zinc-50">{value}</p>
      <div className="relative mt-2 min-h-[18px] text-xs text-zinc-500">{delta}{hint ? <span className="block">{hint}</span> : null}</div>
    </div>
  );
}

const DIR_UI: Record<Direction, { Icon: LucideIcon; label: string }> = {
  up: { Icon: ArrowUpRight, label: "Increasing" }, down: { Icon: ArrowDownRight, label: "Decreasing" },
  flat: { Icon: Minus, label: "Unchanged" }, none: { Icon: CircleDot, label: "No history" },
};

/** Green up-arrow / red down-arrow / grey flat chip. Shows the real % only when the trend has one. */
export function TrendBadge({ direction, pct, note, compact = false }: { direction: Direction; pct: number | null; note?: string | null; compact?: boolean }) {
  const { Icon, label } = DIR_UI[direction];
  const c = TONE[direction];
  const text = pct === null ? (direction === "none" ? "No history" : direction === "up" ? "New balance" : label) : `${pct > 0 ? "+" : ""}${pct}%`;
  return (
    <span title={note ?? label} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ color: c, borderColor: `color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` }}>
      <Icon className="h-3 w-3" />{compact ? text : <>{text}<span className="font-normal opacity-70"> · {label}</span></>}
    </span>
  );
}

export function RangeTabs({ base, current, extra = {} }: { base: string; current: RangeKey; extra?: Record<string, string | undefined> }) {
  const href = (r: RangeKey) => {
    const q = new URLSearchParams(); q.set("range", r);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `${base}?${q.toString()}`;
  };
  return (
    <div role="tablist" aria-label="Date range" className="inline-flex rounded-xl border border-zinc-800 bg-black/40 p-0.5">
      {RANGES.map((r) => (
        <Link key={r.key} href={href(r.key)} role="tab" aria-selected={r.key === current} scroll={false}
          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${r.key === current ? "text-black" : "text-zinc-400 hover:text-zinc-100"}`}
          style={r.key === current ? { background: "var(--color-gold-500)" } : undefined}>{r.label}</Link>
      ))}
    </div>
  );
}

/** Always-visible honesty note about the in-memory ledger. */
export function HistoryNotice({ note }: { note: { daysOfHistory: number; message: string } }) {
  return (
    <details className="group rounded-xl border border-amber-900/50 bg-amber-950/10 px-4 py-2.5 text-xs text-amber-300/90">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        {note.daysOfHistory === 0 ? "No ledger history yet — in-memory ledger resets on server restart." : `Graphs cover ${note.daysOfHistory} day${note.daysOfHistory === 1 ? "" : "s"} of in-memory history (resets on server restart).`}
        <span className="ml-auto text-[11px] text-amber-400/70 group-open:hidden">Details</span>
      </summary>
      <p className="mt-2 leading-relaxed text-amber-200/70">{note.message}</p>
    </details>
  );
}

export function ProgressBar({ pct, tone = "green" }: { pct: number | null; tone?: "green" | "red" | "gold" }) {
  const c = tone === "red" ? TONE.down : tone === "gold" ? TONE.gold : TONE.up;
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: c, boxShadow: `0 0 10px ${c}` }} />
    </div>
  );
}

export function QuickAction({ href, icon: Icon, title, desc, badge, accent = "gold", download = false }: { href: string; icon: LucideIcon; title: string; desc: string; badge?: string | number; accent?: Accent; download?: boolean }) {
  const a = ACCENT[accent];
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ color: a.text, borderColor: `rgba(${a.rgb},0.3)`, background: `rgba(${a.rgb},0.08)` }}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-100">{title}</span><span className="block truncate text-xs text-zinc-500">{desc}</span></span>
      {badge !== undefined && badge !== 0 ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-black" style={{ background: a.text }}>{badge}</span> : null}
    </>
  );
  const cls = "pots-card-hover group flex items-center gap-3 rounded-xl border border-zinc-800 bg-black/30 p-3 hover:border-zinc-600";
  const style = { ["--pots-glow" as string]: `rgba(${a.rgb},0.3)` };
  return download ? <a href={href} className={cls} style={style}>{inner}</a> : <Link href={href} className={cls} style={style}>{inner}</Link>;
}

// ---------- GST timeline ----------
const EVENT_UI: Record<TimelineEvent["kind"], { Icon: LucideIcon; c: string }> = {
  allocation: { Icon: ArrowUpRight, c: TONE.up }, reserve: { Icon: ArrowUpRight, c: TONE.up },
  reversal: { Icon: ArrowDownRight, c: TONE.down }, release: { Icon: ArrowDownRight, c: TONE.down },
  transfer: { Icon: ArrowUpRight, c: "var(--color-info)" },
  "payout-requested": { Icon: Clock, c: "var(--color-warning)" }, "payout-approved": { Icon: Check, c: TONE.gold },
  "payout-paid": { Icon: Check, c: TONE.up }, "payout-failed": { Icon: X, c: TONE.down }, "payout-cancelled": { Icon: X, c: TONE.flat },
};
export function ActivityTimeline({ events, empty }: { events: TimelineEvent[]; empty: string }) {
  if (events.length === 0) return <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <ol className="relative space-y-0 pl-1">
      {events.map((e, i) => {
        const { Icon, c } = EVENT_UI[e.kind];
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 ? <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-zinc-700 to-zinc-900" /> : null}
            <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border" style={{ color: c, borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 12%, #05070a)`, boxShadow: `0 0 14px color-mix(in srgb, ${c} 25%, transparent)` }}><Icon className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-zinc-100">{e.title}</p>
                {e.amount !== null ? <p className="text-sm font-semibold tabular-nums" style={{ color: e.amount < 0 ? TONE.down : TONE.up }}>{e.amount > 0 ? "+" : ""}{formatINR(e.amount)}</p> : null}
              </div>
              <p className="truncate text-xs text-zinc-500">{fmtDateTime(e.at)}{e.detail ? ` · ${e.detail}` : ""}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Payroll stepper ----------
export function PayrollStepper({ stages }: { stages: PayrollStage[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {stages.map((s, i) => {
        const c = s.state === "done" ? TONE.up : s.state === "current" ? TONE.gold : s.state === "attention" ? TONE.down : "#52525b";
        return (
          <li key={s.key} className="relative rounded-xl border p-3" style={{ borderColor: s.state === "todo" ? "#27272a" : `color-mix(in srgb, ${c} 40%, transparent)`, background: s.state === "todo" ? "transparent" : `color-mix(in srgb, ${c} 7%, transparent)` }}>
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold" style={{ color: s.state === "done" ? "#05070a" : c, background: s.state === "done" ? c : "transparent", borderColor: c, boxShadow: s.state === "current" ? `0 0 12px ${c}` : undefined }}>
                {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.state === "attention" ? <X className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <p className="text-sm font-semibold" style={{ color: s.state === "todo" ? "#71717a" : "#f4f4f5" }}>{s.label}</p>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{s.note}</p>
            {s.at ? <p className="mt-1 text-[11px] text-zinc-600">{fmtDateTime(s.at)}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function TrendCaption({ t }: { t: Trend }) {
  if (t.direction === "none") return <span>No ledger history yet</span>;
  return <span>{t.previous === null ? "All-time view" : <>Was <span className="tabular-nums text-zinc-300">{formatINR(t.previous)}</span></>}{t.pct === null && t.pctNote ? <span className="text-zinc-600"> · {t.pctNote}</span> : null}</span>;
}
