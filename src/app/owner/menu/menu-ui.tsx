import type { ReactNode } from "react";
import { ChefHat, Loader2, Star } from "lucide-react";
import type { MenuItem } from "@/server/modules/demo-store/store";
import { formatRupees, getEffectivePrice } from "@/lib/menu-shared";

/* Shared building blocks for the Menu Management page.
   Presentational only — no data access, no new colours (brand tokens only). */

/** Input / select base style. Border colour is added separately so an error state can swap it cleanly. */
export const fieldBase =
  "rounded-xl border bg-[var(--color-surface-0)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors focus-visible:border-[var(--color-radium-500)]";

export const fieldClass = `${fieldBase} border-[var(--color-border)]`;

/** Food photo with a branded fallback when the item has no image. */
export function FoodThumb({
  src,
  className = "h-12 w-12",
  iconClass = "h-5 w-5",
  dimmed = false,
  bare = false,
}: {
  src: string | null;
  className?: string;
  iconClass?: string;
  dimmed?: boolean;
  /** Fill the parent edge to edge (no border / radius / fixed size). */
  bare?: boolean;
}) {
  return (
    <div
      className={
        bare
          ? "relative h-full w-full overflow-hidden bg-[var(--color-surface-2)]"
          : `relative shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] ${className}`
      }
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own /api/menu-image route
        <img
          src={src}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover transition-opacity ${dimmed ? "opacity-50 grayscale" : ""}`}
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, rgba(212,175,55,0.18), rgba(5,7,10,0) 70%)",
          }}
        >
          <ChefHat className={`${iconClass} text-[var(--color-gold-500)]/70`} />
        </div>
      )}
    </div>
  );
}

/** The standard Indian square-with-dot food mark: green = veg, red = non-veg. */
export function DietMark({ veg }: { veg: boolean }) {
  const color = veg ? "var(--color-radium-500)" : "var(--color-danger)";
  return (
    <span
      aria-hidden="true"
      className="inline-grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border-[1.5px]"
      style={{ borderColor: color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function DietBadge({ veg }: { veg: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-text-secondary)]">
      <DietMark veg={veg} />
      {veg ? "Veg" : "Non-Veg"}
    </span>
  );
}

export function StatusPill({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        available
          ? "border-[var(--color-radium-500)]/35 bg-[var(--color-radium-500)]/10 text-[var(--color-radium-500)]"
          : "border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: "currentColor",
          boxShadow: available ? "0 0 6px currentColor" : "none",
        }}
      />
      {available ? "Available" : "Unavailable"}
    </span>
  );
}

export function SpecialBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-gold-400)]"
      title="Today's special"
    >
      <Star className="h-3 w-3 fill-current" />
      {compact ? null : "Special"}
    </span>
  );
}

export function PriceCell({ item }: { item: MenuItem }) {
  const effective = getEffectivePrice(item);
  if (item.discountPercent > 0) {
    return (
      <span className="tabular-nums">
        <s className="mr-1.5 text-xs text-[var(--color-text-muted)]">
          {formatRupees(item.priceRupees)}
        </s>
        <span className="font-semibold text-[var(--color-text-primary)]">
          {formatRupees(effective)}
        </span>
        <span className="ml-1.5 text-xs text-[var(--color-radium-500)]">
          {item.discountPercent}% off
        </span>
      </span>
    );
  }
  return (
    <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">
      {formatRupees(item.priceRupees)}
    </span>
  );
}

type Tone = "default" | "green" | "danger";

const TONE_HOVER: Record<Tone, string> = {
  default:
    "hover:border-[var(--color-gold-500)]/60 hover:text-[var(--color-gold-400)]",
  green:
    "hover:border-[var(--color-radium-500)]/60 hover:text-[var(--color-radium-500)]",
  danger:
    "hover:border-[var(--color-danger)]/60 hover:text-[var(--color-danger)]",
};

/** Compact icon button (optionally with a text label) used for row/card actions. */
export function ActionButton({
  label,
  ariaLabel,
  icon,
  onClick,
  tone = "default",
  showLabel = false,
  block = false,
  busy = false,
  disabled = false,
}: {
  label: string;
  ariaLabel?: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: Tone;
  showLabel?: boolean;
  /** Stretch to the full width of the parent. */
  block?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-xs text-[var(--color-text-secondary)] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${TONE_HOVER[tone]} ${
        showLabel ? `px-2.5 py-1.5 ${block ? "w-full" : ""}` : block ? "h-8 w-full" : "h-8 w-8"
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

/** Accessible on/off switch (brand radium when on). */
export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked
          ? "border-[var(--color-radium-500)] bg-[var(--color-radium-500)]/90"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 rounded-full transition-all ${
          checked
            ? "left-[1.4rem] bg-[#05120a]"
            : "left-0.5 bg-[var(--color-text-muted)]"
        }`}
        style={{ height: "1.125rem", width: "1.125rem" }}
      />
    </button>
  );
}
