"use client";

import { useMemo } from "react";
import type { MenuItem } from "@/server/modules/demo-store/store";
import { getEffectivePrice } from "@/lib/menu-shared";

/**
 * Top "pages" section of the Tablor's device: one category per page,
 * styled after the PDF's cream paper menu pages (red PAGE tag, black
 * numbered code badges, prev/next page nav).
 *
 * Two layouts, same rows:
 *  - paged   (default)  one category per page, driven by the ▲ ▼ keys
 *  - expanded           every category stacked, nothing clipped — used when a
 *                       table is opened so the whole menu is visible at once
 */

function MenuRow({
  item,
  selected,
  qty,
  onSelectItem,
}: {
  item: MenuItem;
  selected: boolean;
  qty: number;
  onSelectItem: (item: MenuItem) => void;
}) {
  return (
    <button
      type="button"
      disabled={!item.available}
      onClick={() => onSelectItem(item)}
      className={`flex min-h-9 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors ${
        item.available ? "" : "cursor-not-allowed opacity-50"
      }`}
      style={{
        background: selected ? "rgba(212,175,55,0.18)" : "transparent",
        outline: selected ? "1px solid var(--device-gold)" : "none",
      }}
    >
      <span
        className="flex h-6 w-8 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
        style={{ background: "var(--device-badge)" }}
      >
        {item.code}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[13px]"
        style={{ color: "var(--device-paper-text)" }}
      >
        {item.name}
        {item.isSpecial && (
          <span
            title="Today's special"
            aria-label="Today's special"
            className="ml-1.5 text-[11px] font-bold"
            style={{ color: "var(--device-tag-red)" }}
          >
            ★
          </span>
        )}
      </span>

      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: item.veg ? "#2e8b3d" : "#b3261e" }}
      />

      {item.available ? (
        <span
          className="shrink-0 text-[12px] font-medium"
          style={{ color: "var(--device-paper-muted)" }}
        >
          {item.discountPercent > 0 && (
            <s className="mr-1 text-[10px] opacity-60">₹{item.priceRupees}</s>
          )}
          ₹{getEffectivePrice(item)}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] font-medium text-[#b3261e]">N/A</span>
      )}

      {qty > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ background: "var(--device-gold-soft)" }}
        >
          ×{qty}
        </span>
      )}
    </button>
  );
}

function ExpandToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={expanded}
      className="ml-auto shrink-0 rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-transform active:scale-95"
      style={{
        borderColor: "var(--device-paper-border)",
        color: "var(--device-paper-text)",
        background: expanded ? "rgba(36,31,20,0.08)" : "transparent",
      }}
    >
      {expanded ? "Collapse" : "Expand menu"}
    </button>
  );
}

export function MenuPane({
  items,
  selectedCode,
  onSelectItem,
  getQty,
  pageIndex,
  expanded = false,
  onToggleExpanded,
}: {
  items: MenuItem[];
  selectedCode: string | null;
  onSelectItem: (item: MenuItem) => void;
  getQty: (code: string) => number;
  /** Current page, controlled by the device (keypad ▲ ▼ arrows / keyboard). */
  pageIndex: number;
  /** Show every category at once, with no inner scroll clipping. */
  expanded?: boolean;
  /** When given, an Expand / Collapse button is shown in the header. */
  onToggleExpanded?: () => void;
}) {
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))),
    [items]
  );

  const safePageIndex = Math.min(pageIndex, Math.max(categories.length - 1, 0));
  const activeCategory = categories[safePageIndex];

  const pageItems = useMemo(
    () => items.filter((item) => item.category === activeCategory),
    [items, activeCategory]
  );

  const byCategory = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: items.filter((item) => item.category === category),
      })),
    [categories, items]
  );

  return (
    <div
      className="rounded-t-xl border-b border-[var(--device-paper-border)]"
      style={{ background: "var(--device-paper)" }}
    >
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-6">
        <span
          className="shrink-0 rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: "var(--device-tag-red)" }}
        >
          {expanded
            ? `All ${Math.max(categories.length, 1)} pages`
            : `Page ${safePageIndex + 1} / ${Math.max(categories.length, 1)}`}
        </span>
        <h2
          className="truncate text-sm font-bold uppercase tracking-wide"
          style={{ color: "var(--device-paper-text)" }}
        >
          {expanded ? "Full menu" : (activeCategory ?? "Menu")}
        </h2>

        {onToggleExpanded && (
          <ExpandToggle expanded={expanded} onToggle={onToggleExpanded} />
        )}
      </div>

      {expanded ? (
        <div className="px-4 py-3 sm:px-6" data-testid="menu-expanded">
          {byCategory.length === 0 ? (
            <p className="py-6 text-sm" style={{ color: "var(--device-paper-muted)" }}>
              No items on the menu.
            </p>
          ) : (
            byCategory.map((group, groupIndex) => (
              <section key={group.category} className={groupIndex === 0 ? "" : "mt-4"}>
                <h3
                  className="mb-1 border-b pb-1 text-[11px] font-bold uppercase tracking-widest"
                  style={{
                    color: "var(--device-tag-red)",
                    borderColor: "var(--device-paper-border)",
                  }}
                >
                  {group.category}
                </h3>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <MenuRow
                      key={item.code}
                      item={item}
                      selected={item.code === selectedCode}
                      qty={getQty(item.code)}
                      onSelectItem={onSelectItem}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="max-h-[46vh] overflow-y-auto px-4 py-3 sm:px-6">
          {pageItems.length === 0 ? (
            <p className="py-6 text-sm" style={{ color: "var(--device-paper-muted)" }}>
              No items in this category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {pageItems.map((item) => (
                <MenuRow
                  key={item.code}
                  item={item}
                  selected={item.code === selectedCode}
                  qty={getQty(item.code)}
                  onSelectItem={onSelectItem}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
