
import Link from "next/link";
import type { RestaurantTable } from "@/server/modules/demo-store/store";

/**
 * Dynamically displays every restaurant table.
 * Clicking a tab opens that table's own ordering device.
 */
export function TableTabs({
  tables,
  currentTableId,
}: {
  tables: RestaurantTable[];
  currentTableId: string;
}) {
  if (tables.length === 0) return null;

  return (
    <nav aria-label="Select table" className="mb-3">
      <ul className="flex flex-wrap gap-2">
        {tables.map((table, index) => {
          const active = table.id === currentTableId;
          const number =
            table.label.replace(/[^0-9]/g, "") || String(index + 1);

          return (
            <li key={table.id}>
              <Link
                href={`/customer/${table.id}`}
                aria-current={active ? "page" : undefined}
                aria-label={`${table.label}${active ? " (current)" : ""}`}
                className={`flex h-10 min-w-[4.25rem] items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-transform active:scale-95 ${
                  active
                    ? "border-[var(--tablor-accent)] bg-[var(--tablor-accent)] text-[#0d0e0b]"
                    : "border-[var(--tablor-border)] bg-[var(--tablor-card)] text-[var(--tablor-text-primary)]"
                }`}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                  Table
                </span>
                {number}
                {table.status === "occupied" && !active && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-[var(--tablor-error)]"
                    title="Occupied"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
