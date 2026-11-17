import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { LiveRefresh } from "@/components/live/live-refresh";
import { getEffectivePrice } from "@/lib/menu-shared";
import { getMenuDb } from "@/server/modules/data/menu-db";
import { getOfferUsage, getOffers } from "@/server/modules/offers/store";
import { getOffersPageNow } from "@/server/modules/offers/page-clock";

import { OffersManager, type OfferMenuItem } from "./offers-manager";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const [now, offers, menu, usage] = await Promise.all([
    getOffersPageNow(),
    getOffers(),
    getMenuDb(DEMO_RESTAURANT_ID),
    getOfferUsage(),
  ]);

  // Archived items are not on any menu surface, so they cannot be offered.
  const menuItems: OfferMenuItem[] = menu
    .filter((item) => item.archivedAt === null)
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      effectivePriceRupees: getEffectivePrice(item),
    }));

  return (
    <main className="min-h-screen bg-[#0D0E0B] px-4 py-4 text-[#F2F3EC] sm:py-8 md:px-8">
      <LiveRefresh intervalMs={10000} />

      <div className="mx-auto max-w-7xl">
        <div className="mb-5 sm:mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#D7FE3B]">
            Owner Portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Offers &amp; Promotions
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9DA194]">
            Create offers that show on the Tablor table device and are applied
            automatically when the customer checks out.
          </p>
        </div>

        <OffersManager
          offers={offers}
          menu={menuItems}
          usage={usage}
          serverNow={now}
        />
      </div>
    </main>
  );
}
