"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { MenuItem } from "@/server/modules/demo-store/store";
import { getEffectivePrice } from "@/lib/menu-shared";
import { useCart, type CartLine } from "./cart-context";
import { MenuPane } from "./device/menu-pane";
import { KeypadPanel } from "./device/keypad-panel";
import { OrderPanel } from "./device/order-panel";
import { BillPopup } from "./device/bill-popup";
import { MenuQrPopup, QrPopup, type QrState } from "./device/qr-popup";
import { WaiterBanner } from "./device/waiter-banner";
import { DeviceFeedback } from "./device/device-feedback";
import {
  ScreenNotice,
  type ScreenNoticeData,
  type ScreenNoticeKind,
} from "./device/screen-notice";
import { OrderCompletedPanel } from "./order-completed-panel";

import { callWaiter, placeCustomerOrder } from "@/server/modules/orders/actions";

import {
  createPaymentQr,
  simulateDemoPayment,
  generateCustomerBill,
  getCustomerOrderState,
  identifyLoyaltyMember,
  redeemLoyaltyReward,
  removeLoyaltyReward,
  type CustomerBillState,
} from "@/server/modules/customer/actions";
import type { CustomerSnapshot } from "@/server/modules/customer/snapshot";

const MAX_QTY = 99;
const MAX_CODE_LEN = 4;
/** One small JSON read; replaces the old 10s page refresh + 2s server-action poll. */
const SYNC_MS = 2_500;

/** How long each kind of on-screen message stays before it fades out. */
const NOTICE_MS: Record<ScreenNoticeKind, number> = {
  success: 6_000,
  error: 5_000,
  info: 4_000,
  waiter: 12_000,
};

const noop = () => {};

export function TablorDevice({
  tableId,
  tableLabel,
  items,
  initialSnapshot,
}: {
  tableId: string;
  tableLabel: string;
  items: MenuItem[];
  /** Server-rendered state, so the device is correct on first paint. */
  initialSnapshot: CustomerSnapshot;
}) {
  const cart = useCart();
  const router = useRouter();

  /*
   * Item selection works like the real device:
   *  1. Type the item code on the keypad (codeDraft)
   *  2. Press ✓  -> the item is selected (selectedCode)
   *  3. Type the quantity (or use + / -)
   *  4. Press ✓  -> the item is added to the order
   */
  const [codeDraft, setCodeDraft] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState(0);
  const [qtyTyped, setQtyTyped] = useState(false);

  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Server truth for this table: order rounds, bill, waiter call, table status.
  const [snap, setSnap] = useState<CustomerSnapshot>(initialSnapshot);
  const [offline, setOffline] = useState(false);
  // A finished (paid) session the customer has closed; hides the thank-you view.
  const [closedOrderId, setClosedOrderId] = useState<string | null>(null);
  const [waiterHidden, setWaiterHidden] = useState<string | null>(null);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [generatingBill, setGeneratingBill] = useState(false);
  const [loyaltyState, setLoyaltyState] = useState<CustomerBillState | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [menuQrOpen, setMenuQrOpen] = useState(false);
  const [qrState, setQrState] = useState<QrState>({ status: "loading" });

  // The full menu is expanded as soon as a table is opened.
  const [menuExpanded, setMenuExpanded] = useState(true);

  // Menu pages (one category per page), driven by the keypad ▲ ▼ arrows and
  // the keyboard ArrowUp/ArrowDown keys. Wraps around, so never disabled.
  const [menuPage, setMenuPage] = useState(0);
  const menuPageCount = Math.max(new Set(items.map((i) => i.category)).size, 1);

  function stepMenuPage(delta: number) {
    setMenuPage((prev) => (prev + delta + menuPageCount) % menuPageCount);
  }

  const selectedItem =
    items.find((item) => item.code === selectedCode) ?? null;

  const order = snap.order;
  const orderId = order?.id ?? null;
  const confirmedLines: CartLine[] = (order?.lines ?? []).map((l) => ({
    itemId: l.itemId ?? l.code,
    code: l.code,
    name: l.name,
    priceRupees: l.priceRupees,
    qty: l.qty,
    round: l.round,
  }));
  const confirmedCount = confirmedLines.reduce((n, l) => n + l.qty, 0);
  const tableReserved = snap.table.status === "reserved";

  /*
   * On-screen notices (bottom of the device). One at a time; repeating the
   * same message re-triggers it because every notice gets a new id.
   */
  const [notice, setNotice] = useState<ScreenNoticeData | null>(null);
  const noticeSeq = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(null);
  }, []);

  const showNotice = useCallback(
    (kind: ScreenNoticeKind, text: string, detail?: string) => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeSeq.current += 1;
      setNotice({ id: noticeSeq.current, kind, text, detail });
      noticeTimer.current = setTimeout(() => {
        noticeTimer.current = null;
        setNotice(null);
      }, NOTICE_MS[kind]);
    },
    []
  );

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  /*
   * Automatic synchronisation. One lightweight read of this table's state
   * every few seconds (only while the tab is visible), plus an immediate
   * refresh after every action. A newer response always wins; a slow, older
   * response can never overwrite fresher state.
   */
  const reqSeq = useRef(0);
  const failures = useRef(0);
  const knownMenuVersion = useRef(initialSnapshot.menuVersion);
  const mutating = useRef(false);

  const refresh = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const res = await fetch(`/api/customer/${encodeURIComponent(tableId)}/state`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as CustomerSnapshot;
      failures.current = 0;
      setOffline(false);
      if (seq !== reqSeq.current || mutating.current) return;
      setSnap(next);
      if (next.menuVersion !== knownMenuVersion.current) {
        knownMenuVersion.current = next.menuVersion;
        router.refresh(); // owner changed the menu: re-read it once
      }
    } catch {
      failures.current += 1;
      if (failures.current >= 3) setOffline(true);
    }
  }, [tableId, router]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, SYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible); // reconnect: resync at once
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const { syncWithMenu } = cart;

  /*
   * Keep the local cart synchronized with canonical menu availability.
   */
  useEffect(() => {
    syncWithMenu(items);
  }, [items, syncWithMenu]);

  // Once the server says the payment finished, the bill / QR popups close by themselves.
  /*
   * Number keys:
   *  - no item selected yet -> build the item code
   *  - item selected        -> build the quantity
   */
  function handleDigit(digit: string) {
    if (!selectedItem) {
      setCodeDraft((prev) =>
        prev.length >= MAX_CODE_LEN ? prev : prev + digit
      );
      return;
    }

    setQtyDraft((prev) => {
      // The first digit typed replaces the default quantity.
      if (!qtyTyped) {
        return Number(digit);
      }

      const next = Number(`${prev === 0 ? "" : prev}${digit}`);

      return Number.isFinite(next) ? Math.min(next, MAX_QTY) : prev;
    });

    setQtyTyped(true);
  }

  /*
   * X key: delete the last code digit, or the last quantity digit.
   */
  function handleBackspace() {
    if (!selectedItem) {
      setCodeDraft((prev) => prev.slice(0, -1));
      return;
    }

    setQtyDraft((prev) => Math.floor(prev / 10));
    setQtyTyped(true);
  }

  /*
   * ✓ key:
   *  - no item selected -> look up the typed item code and select it
   *  - item selected    -> add the item with the chosen quantity
   */
  function handleCommitQty() {
    if (!selectedItem) {
      const code = codeDraft.trim();

      if (!code) {
        showNotice("info", "Enter an item code first, then press ✓.");
        return;
      }

      const match =
        items.find((item) => item.code === code) ??
        items.find((item) => item.code === code.padStart(3, "0"));

      if (!match) {
        showNotice("error", `No item found with code ${code}.`);
        setCodeDraft("");
        return;
      }

      // Unavailable items are never selected, so they can't reach the cart or bill.
      if (!match.available) {
        showNotice("error", "ITEM NOT AVAILABLE", `${match.code} · ${match.name}`);
        setCodeDraft("");
        return;
      }

      setSelectedCode(match.code);
      setQtyDraft(cart.getQty(match.code) || 1);
      setQtyTyped(false);
      setCodeDraft("");
      dismissNotice();
      return;
    }

    cart.setQty(selectedItem, qtyDraft);
    setSelectedCode(null);
    setQtyDraft(0);
    setQtyTyped(false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      setMenuPage((prev) =>
        (prev + (event.key === "ArrowUp" ? -1 : 1) + menuPageCount) % menuPageCount
      );
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuPageCount]);

  function handleQtyPlus() {
    if (!selectedItem) {
      return;
    }

    setQtyDraft((prev) => Math.min(prev + 1, MAX_QTY));
  }

  function handleQtyMinus() {
    if (!selectedItem) {
      return;
    }

    setQtyDraft((prev) => Math.max(prev - 1, 0));
  }

  /*
   * CLEAR ALL: empties only the live, unconfirmed cart. Confirmed rounds live
   * on the server and every other table has its own cart, so neither is touched.
   */
  function handleClearAll() {
    cart.clearCart();
    setCodeDraft("");
    setSelectedCode(null);
    setQtyDraft(0);
    setQtyTyped(false);
    showNotice("success", "All items cleared.");
  }

  async function handleConfirmOrder() {
    if (confirmSubmitting) {
      return;
    }

    if (tableReserved) {
      showNotice("error", "This table is reserved. Please ask the staff for help.");
      return;
    }

    if (cart.lines.length === 0) {
      showNotice("info", "Add items first, then press CONFIRM ORDER.");
      return;
    }

    const snapshot = cart.lines.map((line) => ({ ...line }));

    setConfirmSubmitting(true);
    mutating.current = true; // don't let a poll overwrite the result mid-flight
    dismissNotice();

    let result: Awaited<ReturnType<typeof placeCustomerOrder>>;
    try {
      result = await placeCustomerOrder({
        tableId,
        lines: snapshot.map((line) => ({
          code: line.code,
          itemId: line.itemId,
          qty: line.qty,
        })),
      });
    } catch {
      result = { ok: false, error: "Couldn't reach the restaurant. Please try again." };
    }

    setConfirmSubmitting(false);
    mutating.current = false;

    if (result.ok) {
      const count = snapshot.reduce((sum, l) => sum + l.qty, 0);
      const total = snapshot.reduce((sum, l) => sum + l.qty * l.priceRupees, 0);

      cart.clearCart();
      setCodeDraft("");
      setSelectedCode(null);
      setQtyDraft(0);
      setQtyTyped(false);
      setClosedOrderId(null);

      // Show the combined order immediately; the next sync confirms it.
      setSnap((prev) => ({
        ...prev,
        table: { ...prev.table, status: "occupied" },
        paid: false,
        order: {
          id: result.orderId,
          orderNumber: result.orderNumber,
          status: prev.order?.status ?? "new",
          rounds: result.round,
          lines: result.lines,
        },
      }));

      showNotice(
        "success",
        "YOUR ORDER WAS PLACED SUCCESSFULLY!",
        `${result.orderNumber}${result.appended ? ` · round ${result.round} added` : ""} · ${snapshot
          .map((l) => `${l.qty}× ${l.name}`)
          .join(", ")} · ₹${total} (${count} item${count === 1 ? "" : "s"})`
      );

      void refresh();
    } else {
      showNotice("error", result.error);
      void refresh();
    }
  }

  async function handleCallWaiter() {
    if (snap.waiter.status === "ringing") {
      showNotice("info", "The waiter has already been called — please wait a moment.");
      return;
    }

    // Ring immediately; the request is sent in the background.
    const calledAt = Date.now();
    setWaiterHidden(null);
    setSnap((prev) => ({ ...prev, waiter: { status: "ringing", callId: "pending", calledAt } }));
    mutating.current = true;

    let ok = false;
    try {
      ok = (await callWaiter(tableId)).ok;
    } catch {
      ok = false;
    }

    mutating.current = false;

    if (!ok) {
      setSnap((prev) => ({ ...prev, waiter: { status: "none" } }));
      showNotice("error", "Couldn't reach staff right now, please try again.");
    }
    void refresh();
  }

  async function openLoyalty() {
    if (!orderId) return;
    const state = await getCustomerOrderState(tableId, orderId);
    if (state.ok && state.bill) setLoyaltyState(state.bill);
  }

  /*
   * BILL GEN: issues the ONE combined bill for every confirmed round (or
   * re-opens the existing one) and shows the full bill popup.
   */
  async function handleBillGen() {
    if (!orderId) {
      showNotice("info", "Place your order first to generate a bill.");
      return;
    }

    setGeneratingBill(true);
    const result = await generateCustomerBill(tableId, orderId).catch(
      () => ({ ok: false as const, error: "Couldn't generate the bill. Please try again." })
    );
    setGeneratingBill(false);

    if (!result.ok) {
      showNotice("error", result.error);
      return;
    }

    await refresh();
    void openLoyalty();
    setBillOpen(true);
  }

  async function loadQr() {
    if (!orderId) return;
    setQrState({ status: "loading" });
    const result = await createPaymentQr(tableId, orderId).catch(
      () => ({ ok: false as const, code: "gateway" as const, error: "Couldn't reach the server. Please try again." })
    );
    setQrState({ status: "done", result });
    void refresh();
  }

  /*
   * QR GEN / SCAN TO PAY: the only QR. It needs a bill (issued on the spot if
   * the customer hasn't pressed BILL GEN yet) and asks the gateway for a QR of
   * the exact payable amount.
   */
  async function handleQrGen() {
    // Before any order: QR GEN shows the menu QR. After ordering: the dynamic pay QR.
    if (!orderId || sessionClosed) {
      setMenuQrOpen(true);
      return;
    }

    setBillOpen(false);
    setQrOpen(true);
    setQrState({ status: "loading" });

    if (snap.bill?.kind !== "issued") {
      const made = await generateCustomerBill(tableId, orderId).catch(
        () => ({ ok: false as const, error: "Couldn't generate the bill. Please try again." })
      );
      if (!made.ok) {
        setQrState({ status: "done", result: { ok: false, code: "no-bill", error: made.error } });
        return;
      }
    }
    await loadQr();
  }

  async function handleDemoPayment() {
    if (!orderId) return;
    mutating.current = true;
    const result = await simulateDemoPayment(tableId, orderId).catch(() => ({
      ok: false as const,
      error: "Could not record the demo payment. Please try again.",
    }));
    mutating.current = false;

    if (!result.ok) {
      showNotice("error", result.error);
      return;
    }

    showNotice("success", "DEMO PAYMENT RECORDED", "No real money was transferred.");
    setQrOpen(false);
    await refresh();
  }

  function handleFeedback() {
    if (!orderId) {
      showNotice("info", "Place your order first, then you can share feedback.");
      return;
    }
    setFeedbackOpen((open) => !open);
  }

  useEffect(() => {
    if (feedbackOpen) {
      document.getElementById("device-feedback")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [feedbackOpen]);

  // Loyalty: each call returns the refreshed bill (new total after a reward).
  const loyaltyHandlers = {
    async identify(phone: string) {
      if (!orderId) return { ok: false, message: "Generate the bill first." };
      const res = await identifyLoyaltyMember(tableId, orderId, phone);
      if (res.bill) setLoyaltyState(res.bill);
      void refresh();
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    },
    async redeem(rewardId: string) {
      if (!orderId) return { ok: false, message: "Generate the bill first." };
      const res = await redeemLoyaltyReward(tableId, orderId, rewardId);
      if (res.bill) setLoyaltyState(res.bill);
      void refresh();
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    },
    async remove() {
      if (!orderId) return { ok: false, message: "Generate the bill first." };
      const res = await removeLoyaltyReward(tableId, orderId);
      if (res.bill) setLoyaltyState(res.bill);
      void refresh();
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    },
  };

  // Payment confirmed by the server: thank-you + feedback, until the customer
  // starts a new order (which closes this session on the device).
  if (snap.paid && order && closedOrderId !== order.id) {
    return (
      <div className="mt-2">
        <OrderCompletedPanel
          orderId={order.id}
          orderNumber={order.orderNumber}
          tableId={tableId}
          feedbackSubmitted={snap.feedbackSubmitted}
          onNewOrder={() => {
            setClosedOrderId(order.id);
            setFeedbackOpen(false);
            cart.clearCart();
          }}
        />
      </div>
    );
  }

  // After a closed session the old paid order is hidden; a new order replaces it.
  const sessionClosed = Boolean(order && snap.paid && closedOrderId === order.id);
  const shownLines = sessionClosed ? [] : confirmedLines;
  const shownOrderNumber = sessionClosed ? null : order?.orderNumber ?? null;
  const hasOrder = Boolean(order) && !sessionClosed;
  const waiterKey = `${snap.waiter.status}:${"calledAt" in snap.waiter ? snap.waiter.calledAt : 0}`;
  const statusLabel =
    snap.table.status === "reserved" ? "RESERVED" : snap.table.status === "occupied" ? "OCCUPIED" : "AVAILABLE";
  const statusColor =
    snap.table.status === "reserved" ? "#f5a623" : snap.table.status === "occupied" ? "#4fd6e8" : "#5fe08a";

  const uniqueRateLines = Array.from(
    new Map(shownLines.map((l) => [l.itemId || l.code, l])).values()
  );

  return (
    <div
      // overflow-clip (not hidden) keeps the rounded corners while still
      // letting the bottom notice bar stick to the viewport edge.
      className="tablor-device overflow-clip rounded-2xl border-2 p-1.5 shadow-2xl sm:p-2"
      style={{
        borderColor: "var(--device-gold)",
        background: "var(--device-shell)",
      }}
    >
      {/* Waiter popup: pinned to the TOP of the device */}
      <WaiterBanner
        waiter={waiterHidden === waiterKey ? { status: "none" } : snap.waiter}
        onDismiss={() => setWaiterHidden(waiterKey)}
      />

      <div className="flex items-center justify-center gap-2 py-1.5">
        <span
          className="text-sm font-bold tracking-wide"
          style={{ color: "var(--device-gold)" }}
        >
          {snap.restaurantName}
        </span>

        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "var(--device-lcd-muted)" }}
        >
          Table Ordering System
        </span>

        <span
          className="rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
          style={{ color: statusColor, borderColor: statusColor }}
          aria-label={`Table status: ${statusLabel}`}
        >
          {statusLabel}
        </span>
      </div>

      {offline && (
        <p className="mx-1 mb-1 rounded border px-2 py-1 text-center text-[11px]" style={{ borderColor: "#8a5d12", color: "#f5a623" }}>
          Reconnecting… your order is safe.
        </p>
      )}

      {tableReserved && (
        <p className="mx-1 mb-1 rounded border px-2 py-2 text-center text-xs font-bold tracking-wide" style={{ borderColor: "#f5a623", color: "#f5a623" }} role="status">
          THIS TABLE IS RESERVED
        </p>
      )}

      {/*
        Items are chosen by typing their code on the keypad,
        so tapping a menu row does nothing.
      */}
      <MenuPane
        items={items}
        selectedCode={selectedCode}
        onSelectItem={noop}
        getQty={cart.getQty}
        pageIndex={menuPage}
        expanded={menuExpanded}
        onToggleExpanded={() => setMenuExpanded((prev) => !prev)}
      />

      {hasOrder && cart.lines.length === 0 && shownOrderNumber && (
        <p
          className="px-4 py-2 text-center text-xs font-medium sm:px-6"
          style={{
            background: "var(--device-shell)",
            color: "var(--device-gold)",
          }}
        >
          Order placed — {shownOrderNumber}. It&apos;s on its way to the kitchen. You can still add more items.
        </p>
      )}

      {snap.bill?.kind === "issued" && !snap.paid && (
        <div
          className="mx-1 mt-2 flex items-center justify-between rounded-md border px-3 py-2 text-xs sm:mx-2"
          style={{
            borderColor: "var(--device-shell-border)",
            background: "var(--device-lcd-bg)",
          }}
        >
          <span style={{ color: "var(--device-lcd-muted)" }}>
            {snap.bill.billNumber}
          </span>

          <span
            className="font-semibold"
            style={{ color: "var(--device-gold)" }}
          >
            Balance ₹{snap.bill.remaining.toLocaleString("en-IN")}
          </span>
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <KeypadPanel
          selectedItemName={selectedItem?.name ?? null}
          codeDraft={codeDraft}
          qtyDraft={qtyDraft}
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onCommitQty={handleCommitQty}
          onQtyPlus={handleQtyPlus}
          onQtyMinus={handleQtyMinus}
          onConfirmOrder={handleConfirmOrder}
          confirmDisabled={confirmSubmitting}
          confirmSubmitting={confirmSubmitting}
          onBillGen={handleBillGen}
          onQrGen={handleQrGen}
          onClearAll={handleClearAll}
          onCallWaiter={handleCallWaiter}
          waiterCalling={snap.waiter.status === "ringing"}
          onFeedback={handleFeedback}
          onArrowUp={() => stepMenuPage(-1)}
          onArrowDown={() => stepMenuPage(1)}
        />

        <OrderPanel
          tableLabel={tableLabel}
          lines={cart.lines}
          itemCount={cart.itemCount}
          totalRupees={cart.totalRupees}
          selection={
            selectedItem
              ? {
                  code: selectedItem.code,
                  name: selectedItem.name,
                  qty: qtyDraft,
                  unitRupees: getEffectivePrice(selectedItem),
                }
              : null
          }
          codeDraft={codeDraft}
          confirmedLines={shownLines}
          confirmedOrderNumber={shownOrderNumber}
        />
      </div>

      {/* FEEDBACK appears only after an order is confirmed; the form stays hidden until pressed */}
      {hasOrder && confirmedCount > 0 && (
        <div className="mx-1 mt-3 sm:mx-2">
          <button
            type="button"
            onClick={handleFeedback}
            aria-expanded={feedbackOpen}
            aria-controls="device-feedback"
            className="w-full rounded-md border py-2.5 text-sm font-bold uppercase tracking-[0.2em] transition-transform active:scale-[0.98]"
            style={{ borderColor: "var(--device-gold)", color: "var(--device-gold)", background: "var(--device-lcd-bg)" }}
          >
            {feedbackOpen ? "Hide feedback" : "Feedback"}
          </button>
        </div>
      )}

      {hasOrder && feedbackOpen && (
        <DeviceFeedback
          key={orderId ?? "no-order"}
          tableId={tableId}
          orderId={orderId}
          orderLines={uniqueRateLines}
          alreadySubmitted={snap.feedbackSubmitted}
          onSubmitted={() => setSnap((prev) => ({ ...prev, feedbackSubmitted: true }))}
          onNotice={showNotice}
        />
      )}

      {/* Bottom-of-screen notification bar (sticks to the viewport bottom) */}
      <div className="sticky bottom-2 z-20">
        <ScreenNotice notice={notice} onDismiss={dismissNotice} />
      </div>

      {billOpen && !snap.paid && snap.bill && (
        <BillPopup
          bill={snap.bill}
          busy={generatingBill}
          loyaltyState={loyaltyState}
          loyalty={loyaltyHandlers}
          onPay={() => void handleQrGen()}
          onClose={() => setBillOpen(false)}
        />
      )}

      {menuQrOpen && (
        <MenuQrPopup
          restaurantName={snap.restaurantName}
          tableNumber={snap.table.number}
          menuUrl={typeof window === "undefined" ? "" : `${window.location.origin}/customer/${encodeURIComponent(tableId)}`}
          onClose={() => setMenuQrOpen(false)}
        />
      )}

      {qrOpen && !snap.paid && order && (
        <QrPopup
          restaurantName={snap.restaurantName}
          tableNumber={snap.table.number}
          orderNumber={order.orderNumber}
          state={qrState}
          onRetry={() => void loadQr()}
          onSimulatePayment={handleDemoPayment}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}
