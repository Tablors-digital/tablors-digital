import { NextResponse } from "next/server";

import { getCustomerSnapshot } from "@/server/modules/customer/snapshot";

export const dynamic = "force-dynamic";

/**
 * Lightweight state for the table device: one small JSON read instead of a
 * full server-rendered page refresh. The device polls it (visible tab only).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await ctx.params;
  try {
    const snapshot = await getCustomerSnapshot(tableId);
    if (!snapshot) return new NextResponse("Table not found", { status: 404 });
    return NextResponse.json(snapshot, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[customer:state] failed", error);
    return new NextResponse("Unavailable", { status: 503 });
  }
}
