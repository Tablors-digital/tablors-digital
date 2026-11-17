import { Clock3, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { MenuItem } from "@/server/modules/demo-store/store";
import {
  ActionButton,
  DietBadge,
  DietMark,
  FoodThumb,
  PriceCell,
  SpecialBadge,
  StatusPill,
} from "./menu-ui";

export type ItemHandlers = {
  onToggle: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDuplicate: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  /** id of the item whose availability change is in flight */
  togglingId: string | null;
};

type ActionsVariant = "icons" | "labels" | "card";

/**
 * Edit / Duplicate / Delete / Mark available–unavailable for one item.
 *  - icons:  compact icon buttons (table rows)
 *  - labels: every button labelled (stacked list on small screens)
 *  - card:   labelled availability button on top, icon buttons beneath (grid cards)
 */
function ItemActions({
  item,
  handlers,
  variant = "icons",
}: {
  item: MenuItem;
  handlers: ItemHandlers;
  variant?: ActionsVariant;
}) {
  const labelled = variant !== "icons";
  const toggleLabel = item.available ? "Mark unavailable" : "Mark available";

  const toggle = (
    <ActionButton
      label={toggleLabel}
      ariaLabel={labelled ? undefined : `${toggleLabel}: ${item.name}`}
      tone={item.available ? "danger" : "green"}
      showLabel={labelled}
      block={variant === "card"}
      busy={handlers.togglingId === item.id}
      onClick={() => handlers.onToggle(item)}
      icon={item.available ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    />
  );
  const edit = (
    <ActionButton
      label="Edit"
      ariaLabel={`Edit ${item.name}`}
      showLabel={variant === "labels"}
      block={variant === "card"}
      onClick={() => handlers.onEdit(item)}
      icon={<Pencil className="h-3.5 w-3.5" />}
    />
  );
  const duplicate = (
    <ActionButton
      label="Duplicate"
      ariaLabel={`Duplicate ${item.name}`}
      showLabel={variant === "labels"}
      block={variant === "card"}
      onClick={() => handlers.onDuplicate(item)}
      icon={<Copy className="h-3.5 w-3.5" />}
    />
  );
  const remove = (
    <ActionButton
      label="Delete"
      ariaLabel={`Delete ${item.name}`}
      tone="danger"
      showLabel={variant === "labels"}
      block={variant === "card"}
      onClick={() => handlers.onDelete(item)}
      icon={<Trash2 className="h-3.5 w-3.5" />}
    />
  );

  if (variant === "card") {
    return (
      <div className="space-y-1.5">
        {toggle}
        <div className="grid grid-cols-3 gap-1.5">
          {edit}
          {duplicate}
          {remove}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1.5 ${variant === "labels" ? "flex-wrap" : "justify-end"}`}>
      {toggle}
      {edit}
      {duplicate}
      {remove}
    </div>
  );
}

const th = "px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider";

/** Desktop table (xl and up). */
export function ItemsTable({ items, handlers }: { items: MenuItem[]; handlers: ItemHandlers }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[var(--color-border)] xl:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-sm">
          <thead className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
            <tr>
              <th className={th}>Code</th>
              <th className={th}>
                <span className="sr-only">Image</span>
              </th>
              <th className={th}>Item name</th>
              <th className={th}>Category</th>
              <th className={th}>Type</th>
              <th className={th}>Price</th>
              <th className={th}>Prep time</th>
              <th className={th}>Status</th>
              <th className={th}>Special</th>
              <th className={`${th} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                id={item.code}
                className="scroll-mt-6 border-b border-[var(--color-border)]/70 transition-colors last:border-0 hover:bg-white/[0.025] target:bg-[var(--color-gold-500)]/10"
              >
                <td className="px-3 py-3 align-middle">
                  <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-gold-400)]">
                    {item.code}
                  </span>
                </td>
                <td className="px-3 py-3 align-middle">
                  <FoodThumb src={item.imageUrl} className="h-11 w-11" dimmed={!item.available} />
                </td>
                <td className="px-3 py-3 align-middle">
                  <p
                    className={`max-w-[15rem] truncate font-medium ${
                      item.available
                        ? "text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 max-w-[15rem] truncate text-xs text-[var(--color-text-muted)]">
                      {item.description}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 align-middle">
                  <span className="whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-2.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                    {item.category}
                  </span>
                </td>
                <td className="px-3 py-3 align-middle">
                  <DietBadge veg={item.veg} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-middle">
                  <PriceCell item={item} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-middle text-[var(--color-text-secondary)]">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Clock3 className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                    {item.prepMinutes} min
                  </span>
                </td>
                <td className="px-3 py-3 align-middle">
                  <StatusPill available={item.available} />
                </td>
                <td className="px-3 py-3 align-middle">
                  {item.isSpecial ? (
                    <SpecialBadge />
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-3 align-middle">
                  <ItemActions item={item} handlers={handlers} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Compact stacked rows for tablet / mobile. No horizontal overflow. */
/** Flat, divided rows for tablet / mobile. No horizontal overflow. */
export function ItemsList({ items, handlers }: { items: MenuItem[]; handlers: ItemHandlers }) {
  return (
    <ul className="divide-y divide-[var(--color-border)]/70 overflow-hidden rounded-xl border border-[var(--color-border)] xl:hidden">
      {items.map((item) => (
        <li
          key={item.id}
          id={`m-${item.code}`}
          className="scroll-mt-6 px-3 py-2.5 target:bg-[var(--color-gold-500)]/10"
        >
          <div className="flex items-start gap-3">
            <FoodThumb
              src={item.imageUrl}
              className="h-12 w-12"
              iconClass="h-5 w-5"
              dimmed={!item.available}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] font-semibold tabular-nums text-[var(--color-gold-400)]">
                  {item.code}
                </span>
                <DietMark veg={item.veg} />
                <p className="min-w-0 break-words text-sm font-medium text-[var(--color-text-primary)]">
                  {item.name}
                </p>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-text-muted)]">
                <span>{item.category}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock3 className="h-3 w-3" />
                  {item.prepMinutes} min
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right text-sm">
              <PriceCell item={item} />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill available={item.available} />
              {item.isSpecial && <SpecialBadge />}
            </div>
            <ItemActions item={item} handlers={handlers} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Visual grid of food cards. */
/** Compact grid of food cards. */
export function ItemsGrid({ items, handlers }: { items: MenuItem[]; handlers: ItemHandlers }) {
  return (
    <ul className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <li
          key={item.id}
          id={item.code}
          className="scroll-mt-6 flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] target:border-[var(--color-gold-500)]"
        >
          <div className="relative aspect-[16/10] w-full bg-[var(--color-surface-2)]">
            <FoodThumb
              src={item.imageUrl}
              bare
              iconClass="h-8 w-8"
              dimmed={!item.available}
            />
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-gold-400)] backdrop-blur">
              {item.code}
            </span>
            <span className="absolute right-2 top-2 inline-flex items-center rounded-md bg-black/60 p-1 backdrop-blur">
              <DietMark veg={item.veg} />
              <span className="sr-only">{item.veg ? "Veg" : "Non-Veg"}</span>
            </span>
            {item.isSpecial && (
              <span className="absolute bottom-2 left-2">
                <SpecialBadge />
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                  {item.name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-text-muted)]">
                  <span>{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock3 className="h-3 w-3" />
                    {item.prepMinutes} min
                  </span>
                </p>
              </div>
              <div className="shrink-0 text-sm">
                <PriceCell item={item} />
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <StatusPill available={item.available} />
              <ItemActions item={item} handlers={handlers} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
