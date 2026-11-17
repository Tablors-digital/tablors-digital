"use client";

import type { CartLine } from "@/components/customer/cart-context";

/** Item being picked on the keypad right now (not yet added to the order). */
export type OrderPanelSelection = {
  code: string;
  name: string;
  qty: number;
  unitRupees: number;
};

export function OrderPanel({
  tableLabel,
  lines,
  itemCount,
  totalRupees,
  selection = null,
  codeDraft = "",
  confirmedLines = [],
  confirmedOrderNumber = null,
  activeCode = null,
  panelActive = false,
  onSelectLine,
}: {
  tableLabel: string;
  lines: CartLine[];
  itemCount: number;
  totalRupees: number;
  /** Live selection: shown the moment an item code is accepted. */
  selection?: OrderPanelSelection | null;
  /** Code digits typed so far (shown while no item is selected yet). */
  codeDraft?: string;
  /** Lines of the last placed order — kept on screen after confirming. */
  confirmedLines?: CartLine[];
  /** Human-readable, e.g. ORD-00125 (never the internal id). */
  confirmedOrderNumber?: string | null;
  /** Cart line the keyboard cursor is on. */
  activeCode?: string | null;
  /** True while the arrow keys are controlling this panel. */
  panelActive?: boolean;
  /** Mouse / touch: make a line the active one. */
  onSelectLine?: (code: string) => void;
}) {
  const roundNumbers = Array.from(new Set(confirmedLines.map((l) => l.round ?? 1))).sort((a, b) => a - b);
  const confirmedCount = confirmedLines.reduce((sum, l) => sum + l.qty, 0);
  const confirmedTotal = confirmedLines.reduce(
    (sum, l) => sum + l.qty * l.priceRupees,
    0
  );

  return (
    <div
      className="flex h-full flex-col rounded-lg border px-2.5 py-2 sm:px-4 sm:py-3"
      style={{
        background: "var(--device-lcd-bg)",
        borderColor: panelActive ? "var(--device-gold)" : "var(--device-lcd-border)",
      }}
      data-order-panel
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-bold uppercase tracking-wide sm:text-sm"
          style={{ color: "var(--device-lcd-cyan)" }}
        >
          Your Order
        </h2>
        <span
          className="rounded px-2 py-0.5 text-[11px] font-bold"
          style={{ background: "var(--device-gold)", color: "#171a10" }}
        >
          Table No: {tableLabel}
        </span>
      </div>

      {/* Live selection strip — updates on every code digit and every qty change */}
      {(selection || codeDraft) && (
        <div
          className="mt-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12px]"
          style={{
            borderColor: "var(--device-gold)",
            background: "rgba(212,175,55,0.1)",
            color: "var(--device-lcd-text)",
          }}
          aria-live="polite"
        >
          {selection ? (
            <>
              <span className="min-w-0 truncate">
                <span className="font-mono text-[11px]" style={{ color: "var(--device-gold)" }}>
                  {selection.code}
                </span>{" "}
                <span className="font-semibold">{selection.name}</span>
              </span>
              <span className="shrink-0 font-mono font-bold" style={{ color: "var(--device-lcd-cyan)" }}>
                × {selection.qty}
                <span className="ml-2 font-normal opacity-70">
                  ₹{selection.unitRupees * selection.qty}
                </span>
              </span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--device-lcd-muted)" }}>Item code</span>
              <span className="font-mono font-bold" style={{ color: "var(--device-lcd-cyan)" }}>
                {codeDraft.padEnd(3, "_")}
              </span>
            </>
          )}
        </div>
      )}

      {/* The list is its own scroll area: arrow keys scroll only this box. */}
      <div data-order-scroll className="mt-2 min-h-0 max-h-[min(55vh,26rem)] flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="py-4 text-center text-xs" style={{ color: "var(--device-lcd-muted)" }}>
            No items added yet. Select from the menu above.
          </p>
        ) : (
          <table className="w-full text-[12px]" style={{ color: "var(--device-lcd-text)" }}>
            <thead>
              <tr style={{ color: "var(--device-lcd-muted)" }}>
                <th className="w-6 pb-1 text-left font-normal">Sno</th>
                <th className="pb-1 text-left font-normal">Code</th>
                <th className="pb-1 text-left font-normal">Item name</th>
                <th className="pb-1 text-right font-normal">Qty</th>
                <th className="pb-1 text-right font-normal">Price</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const active = line.code === activeCode;
                return (
                  <tr
                    key={line.code}
                    data-cart-code={line.code}
                    aria-current={active ? "true" : undefined}
                    onClick={onSelectLine ? () => onSelectLine(line.code) : undefined}
                    className="border-t"
                    style={{
                      borderColor: "var(--device-lcd-border)",
                      background: active
                        ? panelActive
                          ? "rgba(212,175,55,0.28)"
                          : "rgba(212,175,55,0.12)"
                        : undefined,
                      outline: active && panelActive ? "2px solid var(--device-gold)" : undefined,
                      outlineOffset: "-2px",
                    }}
                  >
                    <td className="py-1 pl-1">{index + 1}.</td>
                    <td className="py-1">{line.code}</td>
                    <td className="break-words py-1">{line.name}</td>
                    <td className="py-1 text-right">{line.qty}</td>
                    <td className="py-1 text-right">{line.priceRupees * line.qty}/-</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Last confirmed order — stays visible; CLEAR ALL never touches it */}
        {confirmedLines.length > 0 && (
          <div
            className="mt-3 rounded-md border px-2.5 py-2"
            style={{ borderColor: "#1f6b3a", background: "rgba(31,107,58,0.12)" }}
          >
            <p
              className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide"
              style={{ color: "#5fe08a" }}
            >
              <span>Confirmed order</span>
              {confirmedOrderNumber && (
                <span className="font-mono font-normal opacity-80">{confirmedOrderNumber}</span>
              )}
            </p>
            <table className="mt-1 w-full text-[12px]" style={{ color: "var(--device-lcd-text)" }}>
              <tbody>
                {roundNumbers.flatMap((round) => [
                  roundNumbers.length > 1 ? (
                    <tr key={`r-${round}`}>
                      <td colSpan={3} className="pt-1 text-[10px] uppercase tracking-wide opacity-70">
                        Round {round}
                      </td>
                    </tr>
                  ) : null,
                  ...confirmedLines
                    .filter((l) => (l.round ?? 1) === round)
                    .map((line, i) => (
                      <tr key={`c-${round}-${line.code}-${i}`}>
                        <td className="py-0.5 pr-2">{line.name}</td>
                        <td className="py-0.5 text-right">× {line.qty}</td>
                        <td className="py-0.5 pl-2 text-right">{line.priceRupees * line.qty}/-</td>
                      </tr>
                    )),
                ])}
              </tbody>
            </table>
            <p className="mt-1 text-right text-[11px]" style={{ color: "#5fe08a" }}>
              {confirmedCount} items · ₹ {confirmedTotal}/-
            </p>
          </div>
        )}
      </div>

      <div
        className="mt-2 flex items-center justify-between border-t pt-2 text-[12px] sm:text-sm"
        style={{ borderColor: "var(--device-lcd-border)" }}
      >
        <span style={{ color: "var(--device-lcd-cyan)" }} className="font-semibold">
          Total Items : {itemCount}
        </span>
        <span style={{ color: "var(--device-lcd-cyan)" }} className="font-semibold">
          Total : ₹ {totalRupees}/-
        </span>
      </div>

      <p
        className="mt-1.5 hidden text-center text-[10px] leading-snug sm:block"
        style={{ color: "var(--device-lcd-muted)" }}
      >
        ▲▼ move in order · X remove one
      </p>

      <p
        className="mt-1 text-center text-[10px] uppercase tracking-widest sm:mt-1.5"
        style={{ color: "var(--device-lcd-muted)" }}
      >
        TFT LCD Display
      </p>
    </div>
  );
}