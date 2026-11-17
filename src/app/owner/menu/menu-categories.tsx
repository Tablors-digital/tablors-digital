import type { MenuStats } from "@/lib/menu-shared";

function CategoryChip({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--color-radium-500)]/60 bg-[var(--color-radium-500)]/15 text-[var(--color-radium-500)]"
          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold-500)]/50 hover:text-[var(--color-text-primary)]"
      }`}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function CategoryChips({
  stats,
  active,
  onSelect,
}: {
  stats: MenuStats;
  /** "all" or a category name */
  active: string;
  onSelect: (category: string) => void;
}) {
  const known = stats.categories.some((c) => c.name === active);

  return (
    <nav
      aria-label="Categories"
      className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      <CategoryChip
        label="All"
        count={stats.total}
        active={active === "all"}
        onSelect={() => onSelect("all")}
      />
      {stats.categories.map((c) => (
        <CategoryChip
          key={c.name}
          label={c.name}
          count={c.count}
          active={active === c.name}
          onSelect={() => onSelect(active === c.name ? "all" : c.name)}
        />
      ))}
      {/* keeps a ?category= deep link visible even if it has no items */}
      {active !== "all" && !known && (
        <CategoryChip label={active} count={0} active onSelect={() => onSelect("all")} />
      )}
    </nav>
  );
}