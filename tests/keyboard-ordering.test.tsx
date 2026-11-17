// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/modules/orders/actions", () => ({ callWaiter: vi.fn(), placeCustomerOrder: vi.fn() }));
vi.mock("@/server/modules/customer/actions", () => ({
  createPaymentQr: vi.fn(),
  simulateDemoPayment: vi.fn(),
  generateCustomerBill: vi.fn(),
  getCustomerOrderState: vi.fn(),
  identifyLoyaltyMember: vi.fn(),
  redeemLoyaltyReward: vi.fn(),
  removeLoyaltyReward: vi.fn(),
}));

import { CartProvider } from "@/components/customer/cart-context";
import { TablorDevice } from "@/components/customer/tablor-device";
import type { MenuItem } from "@/server/modules/demo-store/store";
import type { CustomerSnapshot } from "@/server/modules/customer/snapshot";

function item(id: string, code: string, name: string, category: string, price: number, available = true): MenuItem {
  return {
    id, code, name, category, priceRupees: price, available,
    description: "", veg: false, prepMinutes: 10, imageUrl: null,
    isSpecial: false, discountPercent: 0, archivedAt: null,
  };
}

const ITEMS = [
  item("a", "001", "Chilli Chicken", "Starters", 200),
  item("b", "002", "Majestic Chicken", "Starters", 300),
  item("c", "003", "Sold Out Dish", "Starters", 100, false),
  item("d", "004", "Gulab Jamun", "Desserts", 90),
];

const SNAP = {
  restaurantName: "Test Kitchen",
  table: { id: "t01", number: "1", status: "available" },
  menuVersion: "v1",
  order: null,
  bill: null,
  billId: null,
  waiter: { status: "none" },
  feedbackSubmitted: false,
  paid: false,
  gateway: { configured: false, missing: [] },
  qr: null,
} as unknown as CustomerSnapshot;

function mount() {
  return render(
    <CartProvider>
      <TablorDevice tableId="t01" tableLabel="1" items={ITEMS} initialSnapshot={SNAP} />
    </CartProvider>
  );
}

const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key: k, ...init });
const cartRow = (code: string) => document.querySelector(`[data-cart-code="${code}"]`) as HTMLElement | null;
const menuRow = (code: string) => document.querySelector(`[data-menu-code="${code}"]`) as HTMLElement;
const qtyIn = (code: string) => cartRow(code)?.querySelectorAll("td")[3]?.textContent;
/** Tap a menu row: adds ONE of it to the order. */
const tap = (code: string) => fireEvent.click(menuRow(code));
/** Type an item code on the keyboard (digits only). */
const typeCode = (code: string) => code.split("").forEach((d) => key(d));
const menuHighlights = () => document.querySelectorAll("[data-menu-code][aria-current]").length;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // sync poll never resolves
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("keyboard ordering", () => {
  it("▲▼ keys highlight only lines of Your Order and clamp at both ends", () => {
    mount();
    tap("001"); tap("002");
    expect(menuHighlights()).toBe(0);
    expect(cartRow("001")!.getAttribute("aria-current")).toBeNull();

    key("ArrowDown");                                   // nothing highlighted yet -> first line
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");
    key("ArrowDown");
    expect(cartRow("002")!.getAttribute("aria-current")).toBe("true");
    key("ArrowDown");                                   // clamp at bottom
    expect(cartRow("002")!.getAttribute("aria-current")).toBe("true");
    key("ArrowUp");
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");
    key("ArrowUp");                                     // clamp at top
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");

    expect(menuHighlights()).toBe(0);                   // the menu is never highlighted by arrows
  });

  it("arrows never highlight or scroll the Menu list, whatever is in the cart", () => {
    mount();
    key("ArrowDown"); key("ArrowUp");                   // empty order: nothing happens at all
    expect(menuHighlights()).toBe(0);
    expect(document.querySelectorAll("[aria-current]").length).toBe(0);

    tap("004");
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    key("ArrowDown"); key("ArrowUp"); key("ArrowLeft"); key("ArrowRight");
    expect(menuHighlights()).toBe(0);
    const scrolled = vi.mocked(Element.prototype.scrollIntoView).mock.contexts as Element[];
    expect(scrolled.every((el) => !el.hasAttribute("data-menu-code"))).toBe(true);
  });

  it("arrows alone never add or remove anything", () => {
    mount();
    key("ArrowDown"); key("ArrowDown"); key("ArrowUp"); key("ArrowRight");
    expect(document.querySelectorAll("[data-cart-code]").length).toBe(0);
    tap("001");
    key("ArrowDown"); key("ArrowUp");
    expect(qtyIn("001")).toBe("1");
  });

  it("Enter with nothing typed adds nothing (no menu row is highlighted to add)", () => {
    mount();
    key("Enter");
    expect(document.querySelectorAll("[data-cart-code]").length).toBe(0);
  });

  it("typing a code then Enter selects, Enter again adds; key auto-repeat is ignored", () => {
    mount();
    typeCode("001");
    key("Enter");                                       // select Chilli Chicken
    key("Enter");                                       // add x1
    key("Enter", { repeat: true });
    key("Enter", { repeat: true });
    expect(qtyIn("001")).toBe("1");
  });

  it("unavailable items cannot be added by code", () => {
    mount();
    typeCode("003");
    key("Enter");
    key("Enter");
    expect(document.querySelectorAll("[data-cart-code]").length).toBe(0);
  });

  it("typed digits set the quantity added by Enter", () => {
    mount();
    typeCode("001");
    key("Enter");
    key("3");
    key("Enter");
    expect(qtyIn("001")).toBe("3");
  });

  it("the spec scenario: X removes one quantity at a time, then the line", () => {
    mount();
    tap("001");                                          // Chilli Chicken x1
    tap("002"); tap("002");                              // Majestic Chicken x2
    key("ArrowDown"); key("ArrowDown");                  // first line, then Majestic Chicken
    expect(cartRow("002")!.getAttribute("aria-current")).toBe("true");

    key("x");
    expect(qtyIn("002")).toBe("1");
    expect(qtyIn("001")).toBe("1");                      // other line untouched

    key("X");
    expect(cartRow("002")).toBeNull();                   // gone at zero
    expect(qtyIn("001")).toBe("1");
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true"); // cursor moved to neighbour

    key("x");
    expect(cartRow("001")).toBeNull();
    key("x");                                            // empty cart: harmless
    expect(document.querySelectorAll("[data-cart-code]").length).toBe(0);
  });

  it("tapping a menu row clears the order highlight, so X cannot remove a line by accident", () => {
    mount();
    tap("001");
    key("ArrowDown");
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");
    tap("002");
    expect(cartRow("001")!.getAttribute("aria-current")).toBeNull();
    key("x");
    expect(qtyIn("001")).toBe("1");
    expect(qtyIn("002")).toBe("1");
  });

  it("the X button removes exactly one quantity (mouse / touch)", () => {
    mount();
    tap("001"); tap("001");
    const btn = within(cartRow("001")!).getByRole("button", { name: /Remove one Chilli Chicken/ });
    fireEvent.click(btn);
    expect(qtyIn("001")).toBe("1");
    fireEvent.click(within(cartRow("001")!).getByRole("button", { name: /Remove one/ }));
    expect(cartRow("001")).toBeNull();
  });

  it("does not hijack keys while typing in a text field", () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    tap("001");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "x" });
    expect(qtyIn("001")).toBe("1");
    expect(cartRow("001")!.getAttribute("aria-current")).toBeNull();
    input.remove();
  });

  it("totals and quantities still calculate correctly", () => {
    mount();
    typeCode("001"); key("Enter"); key("2"); key("Enter");   // 2 x 200
    typeCode("002"); key("Enter"); key("Enter");             // 1 x 300
    expect(screen.getByText(/Total Items : 3/)).toBeTruthy();
    expect(screen.getByText(/Total : ₹ 700\/-/)).toBeTruthy();
  });

  it("on-screen keypad: green/red ▲▼ move only through Your Order, ✓ adds, X removes one", () => {
    mount();
    const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

    tap("001"); tap("001"); tap("002");                  // 2 x Chilli Chicken, 1 x Majestic Chicken
    click(/Highlight next order line/);
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");
    click(/Highlight next order line/);
    expect(cartRow("002")!.getAttribute("aria-current")).toBe("true");
    click(/Highlight previous order line/);
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");
    expect(menuHighlights()).toBe(0);                    // the menu never gets a highlight

    click(/^X/);                                          // keypad X: one off the highlighted line
    expect(qtyIn("001")).toBe("1");
    click(/^X/);
    expect(cartRow("001")).toBeNull();
    expect(qtyIn("002")).toBe("1");                       // untouched

    click("0"); click("0"); click("4");                   // keypad digits + ✓ still add by code
    click(/Confirm quantity/); click(/Confirm quantity/);
    expect(qtyIn("004")).toBe("1");
  });

  it("clicking a line in Your Order highlights it", () => {
    mount();
    tap("001"); tap("002");
    fireEvent.click(cartRow("002")!);
    expect(cartRow("002")!.getAttribute("aria-current")).toBe("true");
    expect(menuHighlights()).toBe(0);
  });

  it("keypad X still works as backspace while an item code is being typed", () => {
    mount();
    tap("001");
    key("ArrowDown");                                     // an order line is highlighted
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /^X/ }));
    expect(qtyIn("001")).toBe("1");                       // the digit was deleted, nothing removed
  });
});
