import type { ReactNode } from "react";
import { LayoutGrid, List, Search, Star, X } from "lucide-react";
import { DietMark, fieldClass } from "./menu-ui";
import type { StatusFilter } from "./menu-summary";

export type DietFilter = "all" | "veg" | "non-veg";
export type ViewMode = "list" | "grid";

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  tone?: "green" | "danger";
};

/** Segmented single-choice control (radio semantics). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[var(--color-border)] p-0.5"
    >
      {options.map((o) => {
        const active = value === o.value;
        const activeClass =
          o.tone === "danger"
            ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
            : "bg-[var(--color-radium-500)]/15 text-[var(--color-radium-500)]";
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? activeClass
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function MenuToolbar({
  search,
  onSearch,
  status,
  onStatus,
  diet,
  onDiet,
  specialOnly,
  onSpecialOnly,
  view,
  onView,
  filtersActive,
  onClear,
  shown,
  total,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  diet: DietFilter;
  onDiet: (v: DietFilter) => void;
  specialOnly: boolean;
  onSpecialOnly: (v: boolean) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  filtersActive: boolean;
  onClear: () => void;
  shown: number;
  total: number;
}) {
  return (
    <section aria-label="Search and filters" className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by item name, code or category"
            aria-label="Search menu items"
            className={`${fieldClass} w-full py-2 pl-9`}
          />
        </div>

        <div
          role="radiogroup"
          aria-label="View mode"
          className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5"
        >
          {(
            [
              ["list", "List view", List],
              ["grid", "Grid view", LayoutGrid],
            ] as const
          ).map(([mode, label, Icon]) => {
            const active = view === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                title={label}
                onClick={() => onView(mode)}
                className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
                  active
                    ? "bg-[var(--color-radium-500)]/15 text-[var(--color-radium-500)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<StatusFilter>
          label="Filter by availability"
          value={status}
          onChange={onStatus}
          options={[
            { value: "all", label: "Any status" },
            { value: "available", label: "Available" },
            { value: "unavailable", label: "Unavailable", tone: "danger" },
          ]}
        />

        <Segmented<DietFilter>
          label="Filter by Veg or Non-Veg"
          value={diet}
          onChange={onDiet}
          options={[
            { value: "all", label: "Veg & Non-Veg" },
            { value: "veg", label: "Veg", icon: <DietMark veg /> },
            { value: "non-veg", label: "Non-Veg", icon: <DietMark veg={false} />, tone: "danger" },
          ]}
        />

        <button
          type="button"
          aria-pressed={specialOnly}
          onClick={() => onSpecialOnly(!specialOnly)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            specialOnly
              ? "border-[var(--color-gold-500)]/60 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-400)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold-500)]/50"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${specialOnly ? "fill-current" : ""}`} />
          Today&apos;s special
        </button>

        {filtersActive && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-1 py-1.5 text-xs text-[var(--color-gold-500)] underline underline-offset-2"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}

        <span
          className="ml-auto text-xs tabular-nums text-[var(--color-text-muted)]"
          aria-live="polite"
        >
          {shown} of {total} items
        </span>
      </div>
    </section>
  );
}