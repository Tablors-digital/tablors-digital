"use client";

import { useMemo } from "react";
import type { MenuItem } from "@/server/modules/demo-store/store";
import { getEffectivePrice } from "@/lib/menu-shared";

/**
 * Top "pages" section of the Tablor's device, styled after the PDF's cream
 * paper menu pages (red tag, black numbered code badges). The whole menu is
 * always shown — every category stacked, nothing clipped. Items are chosen by
 * typing their code on the keypad, so the rows are display-only.
 */

function MenuRow({
  item,
  selected,
  qty,
  offerTag,
  onSelect,
}: {
  item: MenuItem;
  selected: boolean;
  qty: number;
  /** Short label of a live offer on this item, e.g. "20% OFF". */
  offerTag?: string;
  onSelect?: (code: string) => void;
}) {
  const highlighted = selected;
  return (
    <button
      type="button"
      tabIndex={-1}
      data-menu-code={item.code}
      aria-disabled={!item.available}
      // Keep keyboard focus off the row so Enter always goes to the device handler.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.currentTarget.blur();
        if (item.available) onSelect?.(item.code);
      }}
      className={`mb-1 flex min-h-9 w-full break-inside-avoid items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors ${
        item.available ? "cursor-pointer" : "cursor-not-allowed opacity-50"
      }`}
      style={{
        background: highlighted ? "rgba(212,175,55,0.18)" : "transparent",
        outline: highlighted ? "1px solid var(--device-gold)" : "none",
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

      {item.available && offerTag && (
        <span
          title="Offer running"
          className="shrink-0 rounded px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white"
          style={{ background: "var(--device-tag-red)" }}
        >
          {offerTag}
        </span>
      )}

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

export function MenuPane({
  items,
  selectedCode,
  getQty,
  onSelectRow,
  offerTags,
}: {
  /** Item code -> live offer label (badge on the row). */
  offerTags?: Record<string, string>;
  items: MenuItem[];
  selectedCode: string | null;
  getQty: (code: string) => number;
  /** Mouse / touch: tap a row to add one. */
  onSelectRow?: (code: string) => void;
}) {
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))),
    [items]
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
      <div className="flex items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-6 sm:pt-4">
        <span
          className="shrink-0 rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: "var(--device-tag-red)" }}
        >
          {`All ${Math.max(categories.length, 1)} pages`}
        </span>
        <h2
          className="truncate text-sm font-bold uppercase tracking-wide"
          style={{ color: "var(--device-paper-text)" }}
        >
          Full menu
        </h2>
        <span
          className="ml-auto hidden text-[10px] sm:inline"
          style={{ color: "var(--device-paper-muted)" }}
        >
          Type item code · ✓ add
        </span>
      </div>

      <div className="px-3 py-2 sm:px-6 sm:py-3" data-testid="menu-expanded">
        {byCategory.length === 0 ? (
          <p className="py-3 text-sm sm:py-6" style={{ color: "var(--device-paper-muted)" }}>
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
              <div className="sm:columns-2 sm:gap-x-6">
                {group.items.map((item) => (
                  <MenuRow
                    key={item.code}
                    item={item}
                    selected={item.code === selectedCode}
                    qty={getQty(item.code)}
                    offerTag={offerTags?.[item.code]}
                    onSelect={onSelectRow}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
