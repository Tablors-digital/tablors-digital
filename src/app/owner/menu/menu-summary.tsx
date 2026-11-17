import { Ban, CircleCheck, FolderOpen, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { MenuStats } from "@/lib/menu-shared";

export type StatusFilter = "all" | "available" | "unavailable";

type Tone = "gold" | "green" | "red" | "neutral";

const TONE: Record<Tone, string> = {
  gold: "text-[var(--color-gold-500)]",
  green: "text-[var(--color-radium-500)]",
  red: "text-[var(--color-danger)]",
  neutral: "text-[var(--color-text-secondary)]",
};

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  pressed,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
  /** undefined = static; boolean = acts as a filter toggle */
  pressed?: boolean;
  onClick?: () => void;
}) {
  const className = `inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
    pressed
      ? "border-[var(--color-radium-500)]/60 bg-[var(--color-radium-500)]/10"
      : "border-[var(--color-border)]"
  } ${onClick ? "transition-colors hover:border-[var(--color-gold-500)]/50" : ""}`;

  const body = (
    <>
      <Icon className={`h-3.5 w-3.5 ${TONE[tone]}`} />
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" aria-pressed={pressed} onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

export function MenuSummary({
  stats,
  status,
  onStatusChange,
}: {
  stats: MenuStats;
  status: StatusFilter;
  onStatusChange: (next: StatusFilter) => void;
}) {
  return (
    <section aria-label="Menu summary" className="flex flex-wrap gap-2">
      <Stat label="Items" value={stats.total} icon={UtensilsCrossed} tone="gold" />
      <Stat label="Categories" value={stats.categories.length} icon={FolderOpen} tone="neutral" />
      <Stat
        label="Available"
        value={stats.available}
        icon={CircleCheck}
        tone="green"
        pressed={status === "available"}
        onClick={() => onStatusChange(status === "available" ? "all" : "available")}
      />
      <Stat
        label="Unavailable"
        value={stats.unavailable}
        icon={Ban}
        tone="red"
        pressed={status === "unavailable"}
        onClick={() => onStatusChange(status === "unavailable" ? "all" : "unavailable")}
      />
    </section>
  );
}