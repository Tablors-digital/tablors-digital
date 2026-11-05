import { DEMO_RESTAURANT_ID } from "@/server/modules/auth/session";
import { getMenuDb } from "@/server/modules/data/menu-db";
import { getTablesDb } from "@/server/modules/data/tables-db";
import { getCustomerSnapshot } from "@/server/modules/customer/snapshot";
import { TableTabs } from "@/components/customer/table-tabs";
import { TableNotFound } from "@/components/customer/table-not-found";
import { CartProvider } from "@/components/customer/cart-context";
import { TablorDevice } from "@/components/customer/tablor-device";

export const dynamic = "force-dynamic";

export default async function CustomerTableMenuPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;

  // Independent reads, fetched together. The snapshot is the same data the
  // device then keeps in sync through /api/customer/[tableId]/state.
  const [tables, menu, snapshot] = await Promise.all([
    getTablesDb(DEMO_RESTAURANT_ID),
    getMenuDb(DEMO_RESTAURANT_ID),
    getCustomerSnapshot(tableId),
  ]);

  const table = tables.find((t) => t.id === tableId);

  if (!table || !snapshot) {
    return (
      <div>
        <TableNotFound tableId={tableId} />
      </div>
    );
  }

  return (
    <CartProvider>
      <div>
        <TableTabs tables={tables} currentTableId={table.id} />

        <div className="mt-4">
          <TablorDevice
            // A fresh device per table: no state can leak between tables.
            key={table.id}
            tableId={table.id}
            tableLabel={snapshot.table.number}
            items={menu}
            initialSnapshot={snapshot}
          />
        </div>
      </div>
    </CartProvider>
  );
}
