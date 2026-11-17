"use client";

import type { CustomerOffer } from "@/server/modules/customer/snapshot";

function endsLabel(ms: number) {
  return new Date(ms).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
}

/**
 * Live offers (Offers & Promotions) shown on the table device, in the same
 * paper style as the menu. Item offers are tappable and add that item.
 */
export function OffersStrip({
  offers,
  onPickItem,
}: {
  offers: CustomerOffer[];
  /** Adds the offer's menu item (item offers only). */
  onPickItem?: (itemId: string) => void;
}) {
  if (offers.length === 0) return null;

  return (
    <div
      className="border-b px-3 py-2 sm:px-6"
      style={{ background: "var(--device-paper)", borderColor: "var(--device-paper-border)" }}
      data-testid="device-offers"
      aria-label="Offers running now"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: "var(--device-tag-red)" }}
        >
          Offers
        </span>
        <span className="text-[11px]" style={{ color: "var(--device-paper-muted)" }}>
          Applied automatically on your bill
        </span>
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1">
        {offers.map((offer) => {
          const tappable = offer.targetType === "item" && Boolean(offer.targetItemId) && onPickItem;
          const inner = (
            <>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-extrabold text-white"
                style={{ background: "var(--device-badge)" }}
              >
                {offer.valueLabel}
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--device-paper-text)" }}>
                  {offer.name}
                </span>
                <span className="block truncate text-[10px]" style={{ color: "var(--device-paper-muted)" }}>
                  {offer.targetLabel}
                  {offer.minimumOrderRupees ? ` · min ₹${offer.minimumOrderRupees}` : ""}
                  {` · till ${endsLabel(offer.endsAt)}`}
                </span>
              </span>
            </>
          );
          const className =
            "flex min-w-[200px] max-w-[260px] shrink-0 items-center gap-2 rounded-md border px-2 py-1.5";
          const style = { borderColor: "var(--device-paper-border)", background: "rgba(255,255,255,0.35)" };
          return (
            <li key={offer.id} className="shrink-0">
              {tappable ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onPickItem?.(offer.targetItemId as string);
                  }}
                  className={`${className} cursor-pointer transition-colors hover:brightness-95`}
                  style={style}
                  title={offer.description || offer.name}
                >
                  {inner}
                </button>
              ) : (
                <div className={className} style={style} title={offer.description || offer.name}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
