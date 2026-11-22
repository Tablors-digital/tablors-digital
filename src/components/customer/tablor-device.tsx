"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { MenuItem } from "@/server/modules/demo-store/store";
import { getEffectivePrice } from "@/lib/menu-shared";
import { useCart, type CartLine } from "./cart-context";
import { MenuPane } from "./device/menu-pane";
import { OffersStrip } from "./device/offers-strip";
import { KeypadPanel } from "./device/keypad-panel";
import { OrderPanel } from "./device/order-panel";
import { BillPopup } from "./device/bill-popup";
import { MenuQrPopup, QrPopup, type QrState } from "./device/qr-popup";
import { WaiterBanner } from "./device/waiter-banner";
import { DeviceFeedback, type FeedbackControls } from "./device/device-feedback";
import {
  ScreenNotice,
  type ScreenNoticeData,
  type ScreenNoticeKind,
} from "./device/screen-notice";
import { findRewardByPoints } from "./device/loyalty-box";
import { OrderCompletedPanel } from "./order-completed-panel";

import { callWaiter, placeCustomerOrder } from "@/server/modules/orders/actions";

import {
  createPaymentQr,
  simulateDemoPayment,
  generateCustomerBill,
  getCustomerOrderState,
  identifyLoyaltyMember,
  redeemCustomPointsForBill,
  redeemLoyaltyReward,
  removeLoyaltyReward,
  type CustomerBillState,
} from "@/server/modules/customer/actions";
import type { CustomerSnapshot } from "@/server/modules/customer/snapshot";

const MAX_QTY = 99;
const MAX_CODE_LEN = 4;
// Mobile numbers typed on the keypad (10 digits, or with a 91 country prefix).
const MAX_PHONE_LEN = 12;
// Points typed on the keypad to redeem a loyalty reward.
const MAX_REDEEM_LEN = 5;
/** One small JSON read; replaces the old 10s page refresh + 2s server-action poll. */
const SYNC_MS = 2_500;

/** How long each kind of on-screen message stays before it fades out. */
const NOTICE_MS: Record<ScreenNoticeKind, number> = {
  success: 6_000,
  error: 5_000,
  info: 4_000,
  waiter: 12_000,
};

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

  // Feedback opens inside the right-hand LCD screen when F / FEEDBACK is pressed.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackActive, setFeedbackActive] = useState(false);
  const feedbackRef = useRef<FeedbackControls>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [generatingBill, setGeneratingBill] = useState(false);
  const [loyaltyState, setLoyaltyState] = useState<CustomerBillState | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [menuQrOpen, setMenuQrOpen] = useState(false);
  const [qrState, setQrState] = useState<QrState>({ status: "loading" });

  // Phone number being keyed in on the keypad while the bill panel is open (loyalty).
  const [billPhone, setBillPhone] = useState("");
  // Points being keyed in to redeem once the member is identified.
  const [billRedeem, setBillRedeem] = useState("");

  /*
   * Keyboard ordering. The menu is always fully visible and items are chosen
   * by typing their code. ArrowUp / ArrowDown (and the keypad ▲ ▼ keys) only
   * move through the items already in the order list; X removes ONE quantity
   * of the highlighted line (the line disappears at zero).
   */
  const [cartCursor, setCartCursor] = useState<string | null>(null);
  const [srMessage, setSrMessage] = useState("");

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
  // Last payable total seen from the server, and a hook (set below) that runs
  // when the restaurant changes the bill while the customer is looking at it.
  const lastBillTotal = useRef<number | null>(initialSnapshot.bill?.total ?? null);
  const onBillChanged = useRef<() => void>(() => {});
  // Runs on every sync: if the bill is open but loyalty data is missing, load it.
  const ensureLoyalty = useRef<() => void>(() => {});
  const loyaltyLoading = useRef(false);

  const refresh = useCallback(async () => {
    const seq = ++reqSeq.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`/api/customer/${encodeURIComponent(tableId)}/state`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as CustomerSnapshot;
      failures.current = 0;
      setOffline(false);
      if (seq !== reqSeq.current || mutating.current) return;
      setSnap(next);
      const nextTotal = next.bill?.total ?? null;
      const prevTotal = lastBillTotal.current;
      lastBillTotal.current = nextTotal;
      if (prevTotal !== null && nextTotal !== null && prevTotal !== nextTotal) {
        onBillChanged.current();
      }
      ensureLoyalty.current();
      // Payment finished on the server: close the bill / QR panels and reset
      // loyalty entry so nothing stale reappears on the next order.
      if (next.paid) {
        setBillOpen(false);
        setQrOpen(false);
        setLoyaltyState(null);
        setBillPhone("");
        setBillRedeem("");
      }
      if (next.menuVersion !== knownMenuVersion.current) {
        knownMenuVersion.current = next.menuVersion;
        router.refresh(); // owner changed the menu: re-read it once
      }
    } catch {
      failures.current += 1;
      if (failures.current >= 3) setOffline(true);
    } finally {
      clearTimeout(timeout);
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

  /*
   * Closing the bill panel always resets what was being keyed in for it
   * (phone number and points to redeem). Done here, in the event paths,
   * instead of in an effect, so no state is set from inside an effect.
   */
  function closeBill() {
    setBillOpen(false);
    setBillPhone("");
    setBillRedeem("");
  }

  function closeFeedback() {
    setFeedbackOpen(false);
    setFeedbackActive(false);
  }

  /*
   * Number keys:
   *  - feedback open        -> rate the highlighted feedback row (0 = 10)
   *  - bill panel open      -> build the mobile number / points to redeem
   *  - no item selected yet -> build the item code
   *  - item selected        -> build the quantity
   */
  function handleDigit(digit: string) {
    // Feedback open: the keypad rates the highlighted row (1-9, 0 = 10) and moves on.
    if (feedbackOpen && feedbackRef.current) {
      setFeedbackActive(true);
      feedbackRef.current.digit(digit);
      return;
    }

    // Bill panel open: the keypad types the customer's mobile number.
    if (billOpen) {
      if (loyaltyIdentified) {
        setBillRedeem((prev) => (prev.length >= MAX_REDEEM_LEN ? prev : prev + digit));
      } else {
        setBillPhone((prev) => (prev.length >= MAX_PHONE_LEN ? prev : prev + digit));
      }
      return;
    }

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
   * X key: delete the last code digit, or the last quantity digit. With
   * nothing typed and an order line highlighted, it removes one of that item.
   * While feedback is open it clears the highlighted rating.
   */
  function handleBackspace() {
    if (feedbackOpen && feedbackRef.current) {
      setFeedbackActive(true);
      feedbackRef.current.clear();
      return;
    }

    if (billOpen) {
      if (loyaltyIdentified) setBillRedeem((prev) => prev.slice(0, -1));
      else setBillPhone((prev) => prev.slice(0, -1));
      return;
    }

    if (!selectedItem) {
      if (codeDraft === "" && activeCartCode) {
        // Nothing typed to delete: X removes ONE quantity of the active order line.
        removeOneFromCart(activeCartCode);
        return;
      }
      setCodeDraft((prev) => prev.slice(0, -1));
      return;
    }

    setQtyDraft((prev) => Math.floor(prev / 10));
    setQtyTyped(true);
  }

  /*
   * ✓ key:
   *  - feedback open    -> submit the feedback
   *  - bill panel open  -> confirm the mobile number / generate the QR
   *  - no item selected -> look up the typed item code and select it
   *  - item selected    -> add the item with the chosen quantity
   */
  function handleCommitQty() {
    // Feedback open: ✓ submits (needs the required ratings).
    if (feedbackOpen && feedbackRef.current) {
      feedbackRef.current.enter();
      return;
    }

    // Bill panel open: ✓ confirms the phone number, then generates the QR.
    if (billOpen) {
      void handleBillConfirm();
      return;
    }

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

  /* ---- keyboard ordering -------------------------------------------- */

  const cartLines = cart.lines;
  const activeCartCode =
    cartLines.find((l) => l.code === cartCursor)?.code ?? null;
  const waiterKey = `${snap.waiter.status}:${"calledAt" in snap.waiter ? snap.waiter.calledAt : 0}`;
  const waiterVisible = snap.waiter.status !== "none" && waiterHidden !== waiterKey;

  function announce(text: string) {
    setSrMessage(text);
  }

  /** Tap on a menu row: add ONE of it to the order. */
  function addMenuItemOne(code: string) {
    const item = items.find((i) => i.code === code);
    if (!item) return;
    if (!item.available) {
      showNotice("error", "ITEM NOT AVAILABLE", `${item.code} · ${item.name}`);
      return;
    }
    const current = cart.getQty(code);
    if (current >= MAX_QTY) {
      showNotice("info", `Maximum ${MAX_QTY} of one item per order.`);
      return;
    }
    cart.setQty(item, current + 1);
    announce(`Added ${item.name}. ${current + 1} in your order.`);
  }

  /** Item code -> short offer label, for the badge on each offered menu row. */
  const offerTags = useMemo(() => {
    const tags: Record<string, string> = {};
    for (const offer of snap.offers ?? []) {
      if (offer.targetType === "item") {
        const item = items.find((i) => i.id === offer.targetItemId);
        if (item && !tags[item.code]) tags[item.code] = offer.valueLabel;
      } else if (offer.targetType === "category") {
        for (const item of items) {
          if (item.category === offer.targetCategory && !tags[item.code]) tags[item.code] = offer.valueLabel;
        }
      }
    }
    return tags;
  }, [snap.offers, items]);

  function handleOfferItemPick(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (item) handleMenuRowSelect(item.code);
  }

  /** Mouse / touch on a menu row: highlight it and add one. */
  function handleMenuRowSelect(code: string) {
    if (billOpen || feedbackOpen) return;
    // Tapping the menu hands the keyboard back to typing: X must not hit an order line by accident.
    setCartCursor(null);
    addMenuItemOne(code);
  }

  /**
   * ▲ ▼ (keypad buttons and keyboard arrows) move ONLY through the lines of "Your Order".
   * They never highlight, move through or scroll the menu list, and do nothing
   * while the bill or payment QR is showing in place of the order panel.
   * While feedback is open they move the highlighted feedback row instead.
   */
  function moveCursor(delta: number) {
    if (feedbackOpen && feedbackRef.current) {
      setFeedbackActive(true);
      feedbackRef.current.move(delta);
      return;
    }

    if (billOpen || qrOpen) {
      // The bill / QR panel replaces "Your Order": ▲▼ scroll that panel.
      scrollRightPanel(delta);
      return;
    }
    moveCartCursor(delta);
  }

  /** ▲ ▼ while the bill or QR is showing: scroll the panel up / down. */
  function scrollRightPanel(delta: number) {
    const box = document.querySelector<HTMLElement>("[data-device-right] section");
    if (!box) return;
    box.scrollBy({ top: delta * 120, behavior: "smooth" });
  }

  /** ▲ ▼ move through the ordered items. */
  function moveCartCursor(delta: number) {
    if (cartLines.length === 0) return;
    const idx = cartLines.findIndex((l) => l.code === cartCursor);
    const nextIdx =
      idx === -1
        ? delta > 0
          ? 0
          : cartLines.length - 1
        : Math.min(Math.max(idx + delta, 0), cartLines.length - 1);
    setCartCursor(cartLines[nextIdx].code);
  }

  /** X (key): remove exactly ONE quantity; the line goes at zero. */
  function removeOneFromCart(code: string) {
    const idx = cartLines.findIndex((l) => l.code === code);
    if (idx === -1) return;
    const line = cartLines[idx];

    cart.decrement(code);

    if (line.qty <= 1) {
      // Line is gone: move the cursor to its neighbour so X can keep going.
      const neighbour = cartLines[idx + 1] ?? cartLines[idx - 1] ?? null;
      setCartCursor(neighbour ? neighbour.code : null);
      announce(`Removed ${line.name} from your order.`);
    } else {
      setCartCursor(code);
      announce(`Removed one ${line.name}. ${line.qty - 1} left.`);
    }
  }

  /*
   * ✓ while the bill panel is open:
   *  - loyalty is on, no member yet, and a number was typed -> look the member up
   *  - member identified and points typed -> redeem reward / custom points, then QR
   *  - otherwise -> generate the payment QR
   */
  async function handleBillConfirm() {
    const needsPhone =
      Boolean(loyaltyState?.loyalty.enabled) &&
      !loyaltyState?.loyalty.identified &&
      loyaltyState?.status !== "paid";

    if (needsPhone && billPhone.trim() !== "") {
      if (mutating.current) return;
      mutating.current = true;
      try {
        const res = await loyaltyHandlers.identify(billPhone);
        if (!res.ok) {
          showNotice("error", res.message ?? "Couldn't check that number.");
          return;
        }
        setBillPhone("");
        showNotice("success", "MOBILE NUMBER SAVED", "Type points to redeem and press ✓, or press ✓ to skip and pay.");
      } finally {
        mutating.current = false;
      }
      return;
    }

    // Member identified and points typed: redeem matching preset reward or custom points, then show QR.
    const l = loyaltyState?.loyalty;
    if (l && l.enabled && l.identified && billRedeem.trim() !== "") {
      if (mutating.current) return;
      const text = billRedeem.trim();
      const pts = Number(text);
      if (!/^\d+$/.test(text) || pts <= 0) {
        showNotice("error", "Enter the points as a whole number.");
        return;
      }

      mutating.current = true;
      showNotice("info", "APPLYING POINTS…", `Redeeming ${pts} points on your bill.`);

      try {
        const pick = findRewardByPoints(l.rewards, billRedeem);
        if (pick.ok) {
          const res = await redeemLoyaltyReward(tableId, orderId!, pick.rewardId);
          if (!res.ok) {
            showNotice("error", res.message ?? "Couldn't apply that reward.");
            return;
          }
          if (res.bill) setLoyaltyState(res.bill);
        } else if (loyaltyState?.billId && orderId) {
          const customRes = await redeemCustomPointsForBill(tableId, orderId, pts);
          if (!customRes.ok) {
            showNotice("error", customRes.message ?? "Couldn't redeem those points.");
            return;
          }
          if (customRes.bill) setLoyaltyState(customRes.bill);
        } else {
          showNotice("error", pick.message);
          return;
        }

        setBillRedeem("");
        dismissNotice();
        await handleQrGen();
      } finally {
        mutating.current = false;
      }
      return;
    }

    // Nothing to redeem (or skipped): straight to the payment QR.
    setBillPhone("");
    setBillRedeem("");
    await handleQrGen();
  }

  const loyaltyNeedsPhone =
    Boolean(loyaltyState?.loyalty.enabled) &&
    !loyaltyState?.loyalty.identified &&
    loyaltyState?.status !== "paid";
  const loyaltyIdentified =
    Boolean(loyaltyState?.loyalty.enabled) &&
    Boolean(loyaltyState?.loyalty.identified) &&
    loyaltyState?.status !== "paid";
  const billEntryHint = loyaltyNeedsPhone
    ? "Mobile number, then press ✓"
    : loyaltyIdentified
      ? "Points to redeem, then ✓ (✓ alone = skip and pay)"
      : "Press ✓ to generate the QR";

  // Keep the keypad on screen while the bill is open: the number is typed on it.
  useEffect(() => {
    if (billOpen) {
      document.querySelector("[data-keypad]")?.scrollIntoView({ block: "nearest" });
    }
  }, [billOpen]);

  const keyboardEnabled = !(snap.paid && order && closedOrderId !== order.id);

  // Latest handler lives in a ref so the single listener below never goes stale.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!keyboardEnabled) return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target as HTMLElement | null;
    // Never interfere with typing in a text field. (The feedback form has none: it is keypad driven.)
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

    const key = event.key;
    const lower = key.toLowerCase();

    // W = Call Waiter, from anywhere (also while a panel is open).
    if (lower === "w") {
      if (event.repeat) return;
      event.preventDefault();
      void handleCallWaiter();
      return;
    }

    // Feedback mode inside the right-hand LCD screen: ▲▼ move rows, 1-9 / 0 (=10) rate, X clears, Enter submits, Esc/F closes.
    if (feedbackOpen) {
      if (key === "Escape" || lower === "f") {
        if (event.repeat) return;
        event.preventDefault();
        closeFeedback();
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        moveCursor(key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (key === "Enter") {
        if (event.repeat) return;
        event.preventDefault();
        handleCommitQty();
        return;
      }
      if (lower === "x" || key === "Backspace") {
        event.preventDefault();
        handleBackspace();
        return;
      }
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        handleDigit(key);
        return;
      }
      return;
    }

    // QR panels: only Esc (close) is handled here.
    if (menuQrOpen || qrOpen) {
      if (key === "Escape") {
        event.preventDefault();
        setMenuQrOpen(false);
        setQrOpen(false);
      } else if (qrOpen && (key === "ArrowUp" || key === "ArrowDown")) {
        event.preventDefault();
        scrollRightPanel(key === "ArrowUp" ? -1 : 1);
      }
      return;
    }

    // Bill panel: the keypad types the mobile number; ✓ / Enter confirms; Q = QR.
    if (billOpen) {
      if (key === "Escape") {
        event.preventDefault();
        closeBill();
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        scrollRightPanel(key === "ArrowUp" ? -1 : 1);
      } else if (key === "Enter") {
        if (target?.closest("button, a, summary, [role='button']")) return;
        if (event.repeat) return;
        event.preventDefault();
        void handleBillConfirm();
      } else if (lower === "q") {
        if (event.repeat) return;
        event.preventDefault();
        setBillPhone("");
        setBillRedeem("");
        void handleQrGen();
      } else if (lower === "x" || key === "Backspace") {
        event.preventDefault();
        handleBackspace();
      } else if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        handleDigit(key);
      }
      return;
    }

    const typing = Boolean(selectedItem) || codeDraft.length > 0;

    // ▲ ▼ : move the highlight through the "Your Order" lines only (never the menu)
    if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      moveCursor(key === "ArrowUp" ? -1 : 1);
      return;
    }

    // Esc: abandon what is being keyed in, else hide the waiter message
    if (key === "Escape") {
      if (typing) {
        setCodeDraft("");
        setSelectedCode(null);
        setQtyDraft(0);
        setQtyTyped(false);
      } else if (waiterVisible) {
        setWaiterHidden(waiterKey);
      }
      return;
    }

    // Enter = the ✓ key. A focused button keeps its own native Enter.
    if (key === "Enter") {
      if (target?.closest("button, a, summary, [role='button']")) return;
      if (event.repeat) return; // holding Enter must not add dozens of items
      event.preventDefault();
      handleCommitQty();
      return;
    }

    // X / Backspace = the X key: delete a typed digit, else remove ONE of the highlighted order item
    if (lower === "x" || key === "Backspace") {
      if (event.repeat && !typing) return;
      event.preventDefault();
      handleBackspace();
      return;
    }

    // 0-9 = keypad digits (item code, then quantity)
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      handleDigit(key);
      return;
    }

    // + / − = the QTY keys
    if (key === "+" || key === "=") {
      event.preventDefault();
      handleQtyPlus();
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      handleQtyMinus();
      return;
    }

    // Function keys
    if (event.repeat) return;
    switch (lower) {
      case "q": event.preventDefault(); void handleQrGen(); return;
      case "c": event.preventDefault(); void handleConfirmOrder(); return;
      case "b": event.preventDefault(); void handleBillGen(); return;
      case "f": event.preventDefault(); handleFeedback(); return;
      case "delete": event.preventDefault(); handleClearAll(); return;
    }
  };

  useEffect(() => {
    keyHandlerRef.current = handleKeyDown;
  });

  // The restaurant changed the bill (service charge, discount...): never leave
  // the customer with an old amount on screen or an old QR.
  useEffect(() => {
    ensureLoyalty.current = () => {
      if (!billOpen || loyaltyState || loyaltyLoading.current) return;
      loyaltyLoading.current = true;
      void openLoyalty().finally(() => {
        loyaltyLoading.current = false;
      });
    };
    onBillChanged.current = () => {
      if (billOpen) {
        showNotice("info", "BILL UPDATED", "The restaurant updated your bill. The amounts below are the latest.");
        void openLoyalty();
      }
      if (qrOpen) {
        showNotice("info", "BILL UPDATED", "The payment QR was refreshed with the new amount.");
        void loadQr();
      }
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyHandlerRef.current(event);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep the highlighted order row visible by scrolling ONLY the order list:
  // never the page and never the menu.
  useEffect(() => {
    if (!activeCartCode) return;
    const row = document.querySelector<HTMLElement>(
      `[data-order-panel] [data-cart-code="${CSS.escape(activeCartCode)}"]`
    );
    const box = row?.closest<HTMLElement>("[data-order-scroll]");
    if (!row || !box) return;
    const r = row.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  }, [activeCartCode]);

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
    try {
      const state = await getCustomerOrderState(tableId, orderId);
      if (state.ok && state.bill) setLoyaltyState(state.bill);
    } catch {
      // Loyalty is optional: the bill must still work without it.
    }
  }

  /*
   * BILL GEN: issues the ONE combined bill for every confirmed round and receives
   * the full bill + loyalty view in a single server round-trip.
   */
  async function handleBillGen() {
    if (!orderId) {
      showNotice("info", "Place your order first to generate a bill.");
      return;
    }

    if (generatingBill) return;

    closeFeedback();
    // Open the panel at once (it shows "Generating bill…") so the screen never
    // sits idle. Every bill starts with fresh loyalty state and empty fields.
    setGeneratingBill(true);
    setLoyaltyState(null);
    setBillPhone("");
    setBillRedeem("");
    setBillOpen(true);

    const result = await generateCustomerBill(tableId, orderId).catch(
      () => ({ ok: false as const, error: "Couldn't generate the bill. Please try again." })
    );

    if (!result.ok) {
      setGeneratingBill(false);
      setBillOpen(false);
      showNotice("error", result.error);
      return;
    }

    setLoyaltyState(result.bill);
    if (snap.bill) {
      const nextStatus: NonNullable<CustomerSnapshot["bill"]>["status"] =
        result.billSnapshot.status === "paid" || result.billSnapshot.status === "refunded"
          ? "paid"
          : result.billSnapshot.status === "partial"
            ? "partial"
            : "unpaid";
      setSnap((prev) =>
        prev.bill
          ? {
              ...prev,
              bill: {
                ...prev.bill,
                ...result.billSnapshot,
                status: nextStatus,
              },
            }
          : prev
      );
      void refresh();
    } else {
      await refresh();
    }
    setGeneratingBill(false);
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
   * QR GEN / SCAN TO PAY: issues the bill on the server if needed and generates
   * the payment QR in a single server round-trip.
   */
  async function handleQrGen() {
    // Before any order: QR GEN shows the menu QR. After ordering: the dynamic pay QR.
    if (!orderId || sessionClosed) {
      setMenuQrOpen(true);
      return;
    }

    closeFeedback();
    closeBill();
    setQrOpen(true);
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

  /*
   * F key / FEEDBACK key: opens the feedback panel directly inside the right-hand
   * device LCD screen (or closes it back to Your Order if already open).
   */
  function handleFeedback() {
    if (!orderId || sessionClosed) {
      showNotice("info", "Place your order first, then you can share feedback.");
      return;
    }
    if (feedbackOpen) {
      closeFeedback();
      return;
    }
    closeBill();
    setQrOpen(false);
    setFeedbackOpen(true);
    setFeedbackActive(true);
  }

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
            closeFeedback();
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
  const statusLabel =
    snap.table.status === "reserved" ? "RESERVED" : snap.table.status === "occupied" ? "OCCUPIED" : "AVAILABLE";
  const statusColor =
    snap.table.status === "reserved" ? "#f5a623" : snap.table.status === "occupied" ? "#4fd6e8" : "#5fe08a";

  const confirmedCount = shownLines.reduce((sum, l) => sum + l.qty, 0);
  const confirmedTotal = shownLines.reduce((sum, l) => sum + l.qty * l.priceRupees, 0);

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

      <OffersStrip offers={snap.offers ?? []} onPickItem={handleOfferItemPick} />

      {/* The whole menu is always visible; items are chosen by typing their code on the keypad. */}
      <MenuPane
        offerTags={offerTags}
        items={items}
        selectedCode={selectedCode}
        getQty={cart.getQty}
        onSelectRow={handleMenuRowSelect}
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
          onArrowUp={() => moveCursor(-1)}
          onArrowDown={() => moveCursor(1)}
          entryHint={billOpen ? billEntryHint : feedbackOpen ? "▲▼ row · 1–9 rate · 0=10 · ✓ submit · Esc close" : undefined}
          entryValue={billOpen ? (loyaltyIdentified ? billRedeem.padEnd(3, "_") : billPhone.padEnd(10, "_")) : undefined}
        />

        {/*
          Right-hand slot ("Your Order" area). Feedback, the bill, then the payment QR,
          take its place INSIDE the device frame; the order panel returns when closed.
        */}
        <div className="relative h-full min-h-[30rem] lg:min-h-0" data-device-right>
          {/* Absolutely filled: the panel can never make the row taller than the keypad; it scrolls inside. */}
          <div className="absolute inset-0">
          {feedbackOpen && hasOrder ? (
            <div className="relative h-full overflow-y-auto rounded-lg border" style={{ background: "var(--device-lcd-bg)", borderColor: "var(--device-gold)" }}>
              <div className="sticky top-0 z-10 flex justify-end px-2 pt-2">
                <button
                  type="button"
                  onClick={closeFeedback}
                  className="rounded border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    background: "var(--device-shell)",
                    borderColor: "var(--device-gold)",
                    color: "var(--device-gold)",
                  }}
                >
                  ✕ Back to Order
                </button>
              </div>
              <DeviceFeedback
                ref={feedbackRef}
                key={orderId ?? "no-order"}
                tableId={tableId}
                orderId={orderId}
                orderLines={uniqueRateLines}
                alreadySubmitted={snap.feedbackSubmitted}
                active={feedbackActive}
                onActiveChange={setFeedbackActive}
                onSubmitted={() => {
                  closeFeedback();
                  setSnap((prev) => ({ ...prev, feedbackSubmitted: true }));
                }}
                onNotice={showNotice}
              />
            </div>
          ) : billOpen && !snap.paid && snap.bill && (snap.bill.kind === "issued" || !generatingBill) ? (
            <BillPopup
              bill={snap.bill}
              busy={generatingBill}
              loyaltyState={loyaltyState}
              loyalty={loyaltyHandlers}
              phone={billPhone}
              onPhoneChange={setBillPhone}
              redeemPoints={billRedeem}
              onRedeemPointsChange={setBillRedeem}
              onPay={() => void handleQrGen()}
              onConfirm={() => void handleBillConfirm()}
              onClose={closeBill}
            />
          ) : billOpen && !snap.paid ? (
            <section
              role="status"
              className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border p-4 text-center"
              style={{ background: "var(--device-shell)", borderColor: "var(--device-gold)" }}
            >
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-amber-300/25 border-t-amber-300" />
              <p className="text-sm" style={{ color: "var(--device-lcd-muted)" }}>Generating bill…</p>
              <button
                type="button"
                onClick={closeBill}
                className="rounded-md border px-4 py-2 text-xs font-semibold"
                style={{ borderColor: "var(--device-shell-border)", color: "var(--device-lcd-text)" }}
              >
                Cancel
              </button>
            </section>
          ) : qrOpen && !snap.paid && order ? (
            <QrPopup
              restaurantName={snap.restaurantName}
              tableNumber={snap.table.number}
              orderNumber={order.orderNumber}
              state={qrState}
              onRetry={() => void loadQr()}
              onSimulatePayment={handleDemoPayment}
              onClose={() => setQrOpen(false)}
            />
          ) : (
            <OrderPanel
              activeCode={activeCartCode}
              panelActive={activeCartCode !== null}
              onSelectLine={setCartCursor}
              tableLabel={tableLabel}
              lines={cart.lines}
              itemCount={cart.itemCount + confirmedCount}
              totalRupees={cart.totalRupees + confirmedTotal}
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
          )}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {srMessage}
      </p>

      {/* Footer: waiter-call status + notifications (stick to the viewport bottom) */}
      <div className="sticky bottom-2 z-20">
        <WaiterBanner
          waiter={waiterHidden === waiterKey ? { status: "none" } : snap.waiter}
          onDismiss={() => setWaiterHidden(waiterKey)}
        />
        <ScreenNotice notice={notice} onDismiss={dismissNotice} />
      </div>

      {/* Menu QR (before any order) stays a popup. */}
      {menuQrOpen && (
        <MenuQrPopup
          restaurantName={snap.restaurantName}
          tableNumber={snap.table.number}
          menuUrl={typeof window === "undefined" ? "" : `${window.location.origin}/customer/${encodeURIComponent(tableId)}`}
          onClose={() => setMenuQrOpen(false)}
        />
      )}
    </div>
  );
}