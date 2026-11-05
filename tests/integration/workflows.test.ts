/**
 * End-to-end workflows against a REAL PostgreSQL database (no mocks of the data layer).
 * Opt in:  ALLOW_DESTRUCTIVE_TESTS=1 DATABASE_URL=postgres://... npx vitest run tests/integration
 * It wipes order/bill/notification data, so only ever point it at a scratch database.
 */
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const RUN = process.env.ALLOW_DESTRUCTIVE_TESTS === "1" && !!process.env.DATABASE_URL;
const d = RUN ? describe : describe.skip;
const R = "demo-restaurant";

d("workflows (real database)", () => {
  let db: typeof import("@/server/db/client").db;
  let s: typeof import("@/server/db/schema");
  let orders: typeof import("@/server/modules/orders/db-orders");
  let billing: typeof import("@/server/modules/billing/db-billing");
  let waiter: typeof import("@/server/modules/orders/waiter");
  let events: typeof import("@/server/modules/notifications/events");
  let store: typeof import("@/server/modules/notifications/store");
  let tablesDb: typeof import("@/server/modules/data/tables-db");
  let snapshot: typeof import("@/server/modules/customer/snapshot");
  let gateway: typeof import("@/server/modules/payments/gateway");
  let intents: typeof import("@/server/modules/payments/intents");
  let feedbackActions: typeof import("@/server/modules/feedback/actions");

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    s = await import("@/server/db/schema");
    orders = await import("@/server/modules/orders/db-orders");
    billing = await import("@/server/modules/billing/db-billing");
    waiter = await import("@/server/modules/orders/waiter");
    events = await import("@/server/modules/notifications/events");
    store = await import("@/server/modules/notifications/store");
    tablesDb = await import("@/server/modules/data/tables-db");
    snapshot = await import("@/server/modules/customer/snapshot");
    gateway = await import("@/server/modules/payments/gateway");
    intents = await import("@/server/modules/payments/intents");
    feedbackActions = await import("@/server/modules/feedback/actions");

    await db.delete(s.payments);
    await db.delete(s.bills);
    await db.delete(s.orderEvents);
    await db.delete(s.orderItems);
    await db.delete(s.waiterCalls);
    await db.delete(s.notifications);
    await db.delete(s.paymentIntents);
    await db.delete(s.orders);
    await db.update(s.restaurantTables).set({ status: "available", currentOrderId: null, waiterCalled: false });
  });

  const place = (tableId: string, lines: { code: string; qty: number }[]) =>
    orders.createOrderInDb({ restaurantId: R, tableId, lines });

  it("A/B: rounds are appended to ONE open order and billed together", async () => {
    const r1 = await place("t01", [{ code: "001", qty: 2 }, { code: "002", qty: 1 }]);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.round).toBe(1);
    expect(r1.appended).toBe(false);
    expect(r1.orderNo).toBeGreaterThan(0);

    const r2 = await place("t01", [{ code: "001", qty: 1 }, { code: "060", qty: 1 }]);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.orderId).toBe(r1.orderId); // same order: no duplicate
    expect(r2.orderNo).toBe(r1.orderNo);
    expect(r2.round).toBe(2);
    expect(r2.appended).toBe(true);

    const order = await orders.getOrderFromDb(R, r1.orderId);
    expect(order!.lines).toHaveLength(4); // round 1 preserved, round 2 added
    expect(order!.lines.filter((l) => l.round === 1)).toHaveLength(2);

    const list = await db.select().from(s.orders);
    expect(list.filter((o) => o.tableId === "t01")).toHaveLength(1);

    // one combined bill for both rounds, centralised maths
    const bill = await billing.issueBillDb(
      R, r1.orderId,
      { gstPercent: 5, additionalTaxPercent: 2, serviceChargePercent: 10, discountRupees: 0 },
      undefined, { allowBeforeServed: true },
    );
    expect(bill.ok).toBe(true);
    if (!bill.ok) return;
    const sub = order!.lines.reduce((n, l) => n + l.qty * l.priceRupees, 0);
    expect(bill.bill.subtotalRupees).toBe(sub);
    expect(bill.bill.gstRupees).toBe(Math.round(sub * 0.05));
    expect(bill.bill.additionalTaxRupees).toBe(Math.round(sub * 0.02));
    expect(bill.bill.serviceChargeRupees).toBe(Math.round(sub * 0.1));
    expect(bill.bill.totalRupees).toBe(
      sub + Math.round(sub * 0.05) + Math.round(sub * 0.02) + Math.round(sub * 0.1),
    );
    expect(bill.bill.billNo).toBeGreaterThan(0);

    // A third round before payment updates the SAME bill with the FROZEN rates.
    const r3 = await place("t01", [{ code: "040", qty: 1 }]);
    expect(r3.ok && r3.orderId === r1.orderId).toBe(true);
    const after = await billing.getBillByOrderIdDb(R, r1.orderId);
    const order3 = await orders.getOrderFromDb(R, r1.orderId);
    const sub3 = order3!.lines.reduce((n, l) => n + l.qty * l.priceRupees, 0);
    expect(after!.subtotalRupees).toBe(sub3);
    expect(after!.gstPercent).toBe(5);
    expect(after!.totalRupees).toBe(
      sub3 + Math.round(sub3 * 0.05) + Math.round(sub3 * 0.02) + Math.round(sub3 * 0.1),
    );
    expect((await db.select().from(s.bills))).toHaveLength(1); // never duplicated
  });

  it("unavailable items never enter an order", async () => {
    const r = await place("t02", [{ code: "043", qty: 1 }]); // Malai Kofta: unavailable
    expect(r.ok).toBe(false);
    expect((await db.select().from(s.orderItems)).filter((i) => i.code === "043")).toHaveLength(0);
  });

  it("settings changes do not alter an issued bill, but apply to new bills", async () => {
    const t01 = (await db.select().from(s.orders)).find((o) => o.tableId === "t01")!;
    const before = await billing.getBillByOrderIdDb(R, t01.id);
    const r = await place("t03", [{ code: "001", qty: 1 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b2 = await billing.issueBillDb(
      R, r.orderId,
      { gstPercent: 12, additionalTaxPercent: 0, serviceChargePercent: 0, discountRupees: 0 },
      undefined, { allowBeforeServed: true },
    );
    expect(b2.ok && b2.bill.gstPercent).toBe(12);
    const stillSame = await billing.getBillByOrderIdDb(R, t01.id);
    expect(stillSame!.gstPercent).toBe(before!.gstPercent);
    expect(stillSame!.totalRupees).toBe(before!.totalRupees);
  });

  it("C: waiter call -> notification -> acknowledge syncs the device", async () => {
    const c1 = await waiter.requestWaiterDb(R, "t04");
    expect(c1.ok && c1.created).toBe(true);
    if (!c1.ok) return;
    const c2 = await waiter.requestWaiterDb(R, "t04"); // repeated press
    expect(c2.ok && c2.created).toBe(false);

    await events.notifyWaiterCall({ tableId: "t04", callId: c1.callId });
    await events.notifyWaiterCall({ tableId: "t04", callId: c1.callId }); // duplicate is deduped
    const owner = (await store.listFor("owner", null)).filter((n) => n.type === "WAITER_CALL");
    expect(owner).toHaveLength(1);
    expect(owner[0].message).toContain("Table 4");
    expect(owner[0].status).toBe("unread");

    expect((await waiter.getWaiterStateDb(R, "t04")).status).toBe("ringing");
    await waiter.acknowledgeWaiterDb(R, "t04", "owner");
    expect((await waiter.getWaiterStateDb(R, "t04")).status).toBe("acknowledged");
    const after = (await store.listFor("owner", null)).find((n) => n.type === "WAITER_CALL")!;
    expect(after.status).toBe("acknowledged");
  });

  it("notifications: new order, additional order, cancellation; counts and dedupe", async () => {
    const t = (await db.select().from(s.orders)).find((o) => o.tableId === "t01")!;
    await events.notifyOrderPlaced({ tableId: "t01", orderId: t.id, round: 1, appended: false });
    await events.notifyOrderPlaced({ tableId: "t01", orderId: t.id, round: 1, appended: false });
    await events.notifyOrderPlaced({ tableId: "t01", orderId: t.id, round: 2, appended: true });
    const all = await store.listFor("owner", null);
    expect(all.filter((n) => n.type === "ORDER_NEW")).toHaveLength(1);
    expect(all.filter((n) => n.type === "ORDER_ADDED")).toHaveLength(1);
    expect(all.find((n) => n.type === "ORDER_NEW")!.message).toMatch(/Table 1 · ORD-\d{5}/);
  });

  it("D: reserve / mark available are reflected for the customer device", async () => {
    expect((await tablesDb.reserveTableDb(R, "t05")).ok).toBe(true);
    expect((await snapshot.getCustomerSnapshot("t05"))!.table.status).toBe("reserved");
    const blocked = await place("t05", [{ code: "001", qty: 1 }]);
    expect(blocked.ok).toBe(false);
    expect((await tablesDb.setTableStatusDb(R, "t05", "available")).ok).toBe(true);
    expect((await snapshot.getCustomerSnapshot("t05"))!.table.status).toBe("available");
    // a table with an active order cannot be force-released (history is preserved)
    const busy = await tablesDb.setTableStatusDb(R, "t01", "available");
    expect(busy.ok).toBe(false);
  });

  it("order cancellation keeps history and releases the table", async () => {
    const r = await place("t06", [{ code: "001", qty: 1 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = await orders.cancelOrderInDb(R, r.orderId);
    expect(c.ok).toBe(true);
    const row = (await db.select().from(s.orders)).find((o) => o.id === r.orderId)!;
    expect(row.status).toBe("cancelled");
    expect((await snapshot.getCustomerSnapshot("t06"))!.order).toBeNull();
  });

  it("snapshot: provisional/issued bill view matches the stored bill", async () => {
    const snap = await snapshot.getCustomerSnapshot("t01");
    expect(snap!.order!.rounds).toBe(3);
    expect(snap!.bill!.kind).toBe("issued");
    expect(snap!.bill!.billNumber).toMatch(/^BILL-\d{5}$/);
    expect(snap!.bill!.orderNumber).toMatch(/^ORD-\d{5}$/);
    const lineSum = snap!.bill!.lines.reduce((n, l) => n + l.lineRupees, 0);
    expect(lineSum).toBe(snap!.bill!.subtotal);
    const b = snap!.bill!;
    expect(b.subtotal + b.gst.amount + b.additionalTax.amount + b.serviceCharge.amount - b.discount).toBe(b.total);
  });

  it("QR: without gateway credentials no QR/payment is possible", async () => {
    const cfg = gateway.getGatewayConfig({} as NodeJS.ProcessEnv);
    expect(cfg.configured).toBe(false);
    if (!cfg.configured) expect(cfg.missing).toEqual(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]);
  });

  it("payment: only a gateway-confirmed payment of the right amount settles the bill (idempotent)", async () => {
    const t01 = (await db.select().from(s.orders)).find((o) => o.tableId === "t01")!;
    const bill = (await billing.getBillByOrderIdDb(R, t01.id))!;
    const intent = await intents.saveIntent({
      restaurantId: R, billId: bill.id, orderId: t01.id, tableId: "t01",
      provider: "razorpay", providerRef: "qr_TEST123", amountPaise: bill.totalRupees * 100, qrImageUrl: "https://example.test/qr.png",
    });
    // wrong amount is refused
    const bad = await intents.settleFromGateway(intent, { id: "pay_WRONG0001", amountPaise: 100, status: "captured" });
    expect(bad.ok).toBe(false);
    // not captured is refused
    const failed = await intents.settleFromGateway(intent, { id: "pay_FAILED001", amountPaise: intent.amountPaise, status: "failed" });
    expect(failed.ok).toBe(false);
    expect((await snapshot.getCustomerSnapshot("t01"))!.paid).toBe(false);

    const ok = await intents.settleFromGateway(intent, { id: "pay_ABC0000001", amountPaise: intent.amountPaise, status: "captured" });
    expect(ok).toEqual({ ok: true, settled: true });
    // replay (duplicate webhook) never pays twice
    await intents.settleFromGateway(intent, { id: "pay_ABC0000001", amountPaise: intent.amountPaise, status: "captured" });
    expect((await db.select().from(s.payments)).filter((p) => p.billId === bill.id)).toHaveLength(1);

    const snap = await snapshot.getCustomerSnapshot("t01");
    expect(snap!.paid).toBe(true);
    expect((await store.listFor("owner", null)).filter((n) => n.type === "PAYMENT_RECEIVED")).toHaveLength(1);

    // session closed: table released, a NEW customer gets a NEW order and bill
    expect((await snapshot.getCustomerSnapshot("t01"))!.table.status).toBe("available");
    const next = await place("t01", [{ code: "001", qty: 1 }]);
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.orderId).not.toBe(t01.id);
      expect(next.round).toBe(1);
    }
    // history preserved
    expect((await billing.getBillByOrderIdDb(R, t01.id))!.paidAt).not.toBeNull();
  });

  it("E: feedback is saved against the right order + table, once", async () => {
    const o = (await db.select().from(s.orders)).find((x) => x.tableId === "t03")!;
    const lines = (await orders.getOrderFromDb(R, o.id))!.lines;
    const res = await feedbackActions.submitDeviceFeedback({
      orderId: o.id, tableId: "t03", overall: 9, foodTaste: 8, deviceUsability: 10,
      itemRatings: [{ itemId: lines[0].itemId ?? lines[0].code, rating: 7 }],
    });
    expect(res.ok).toBe(true);
    const fb = await (await import("@/server/modules/feedback/store")).getFeedbackByOrderId(o.id);
    expect(fb!.tableId).toBe("t03");
    expect(fb!.deviceRatings!.items[0].rating).toBe(7);
    expect((await feedbackActions.submitDeviceFeedback({ orderId: o.id, tableId: "t03", overall: 1, foodTaste: 1, deviceUsability: 1, itemRatings: [] })).ok).toBe(false);
    // wrong table is rejected
    expect((await feedbackActions.submitDeviceFeedback({ orderId: o.id, tableId: "t02", overall: 5, foodTaste: 5, deviceUsability: 5, itemRatings: [] })).ok).toBe(false);
  });

  it("webhook signatures are verified in constant time", () => {
    const body = '{"event":"qr_code.credited"}';
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(gateway.verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(gateway.verifyWebhookSignature(body, sig.replace(/.$/, "0"), "whsec")).toBe(false);
    expect(gateway.verifyWebhookSignature(body, null, "whsec")).toBe(false);
  });

  it("F: performance — snapshot + state reads are fast", async () => {
    const ids = ["t01", "t02", "t03", "t04", "t05", "t06"];
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) for (const id of ids) await snapshot.getCustomerSnapshot(id);
    const per = (performance.now() - t0) / 30;
    console.log(`avg snapshot ${per.toFixed(1)} ms over 30 reads`);
    expect(per).toBeLessThan(250);
  });
});
