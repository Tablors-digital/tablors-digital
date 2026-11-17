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

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // sync poll never resolves
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("keyboard ordering", () => {
  it("highlights with arrows, adds with Enter, repeated Enter increments", () => {
    mount();
    key("ArrowDown");
    expect(menuRow("001").getAttribute("aria-current")).toBe("true");
    key("Enter");
    expect(qtyIn("001")).toBe("1");
    key("Enter");
    expect(qtyIn("001")).toBe("2");
  });

  it("ignores key auto-repeat so holding Enter cannot spam additions", () => {
    mount();
    key("ArrowDown");
    key("Enter");
    key("Enter", { repeat: true });
    key("Enter", { repeat: true });
    expect(qtyIn("001")).toBe("1");
  });

  it("skips unavailable items and clamps at first/last", () => {
    mount();
    key("ArrowUp"); // nothing placed yet -> first item
    expect(menuRow("001").getAttribute("aria-current")).toBe("true");
    key("ArrowUp"); // clamp at top
    expect(menuRow("001").getAttribute("aria-current")).toBe("true");
    key("ArrowDown"); // 002
    key("ArrowDown"); // skips sold-out 003 -> 004
    expect(menuRow("004").getAttribute("aria-current")).toBe("true");
    key("ArrowDown"); // clamp at bottom
    expect(menuRow("004").getAttribute("aria-current")).toBe("true");
  });

  it("typed digits set the quantity added by Enter", () => {
    mount();
    key("ArrowDown");
    key("3");
    key("Enter");
    expect(qtyIn("001")).toBe("3");
  });

  it("arrows alone never add or remove anything", () => {
    mount();
    key("ArrowDown"); key("ArrowDown"); key("ArrowUp"); key("ArrowRight");
    expect(document.querySelectorAll("[data-cart-code]").length).toBe(0);
  });

  it("the spec scenario: X removes one quantity at a time, then the line", () => {
    mount();
    key("ArrowDown"); key("Enter");              // Chilli Chicken x1
    key("ArrowDown"); key("Enter"); key("Enter"); // Majestic Chicken x2
    key("ArrowRight");                           // into the order panel (first line active)
    key("ArrowDown");                            // Majestic Chicken
    expect(cartRow("002")!.getAttribute("aria-current")).toBe("true");

    key("x");
    expect(qtyIn("002")).toBe("1");
    expect(qtyIn("001")).toBe("1");             // other line untouched

    key("X");
    expect(cartRow("002")).toBeNull();          // gone at zero
    expect(qtyIn("001")).toBe("1");
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true"); // cursor moved to neighbour

    key("x");
    expect(cartRow("001")).toBeNull();
    key("x");                                    // empty cart: harmless
    expect(document.querySelectorAll("[data-cart-code]").length).toBe(0);
  });

  it("the X button removes exactly one quantity (mouse / touch)", () => {
    mount();
    key("ArrowDown"); key("Enter"); key("Enter");
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
    key("ArrowDown"); key("Enter"); // item in cart
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "x" });
    expect(qtyIn("001")).toBe("1");
    input.remove();
  });

  it("totals and quantities still calculate correctly", () => {
    mount();
    key("ArrowDown"); key("2"); key("Enter");         // 2 x 200
    key("ArrowDown"); key("Enter");                   // 1 x 300
    expect(screen.getByText(/Total Items : 3/)).toBeTruthy();
    expect(screen.getByText(/Total : ₹ 700\/-/)).toBeTruthy();
  });

  it("on-screen keypad: ▲▼ highlight, ✓ adds, X removes one (mouse / touch)", () => {
    mount();
    const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

    click(/Highlight next item/);                 // 001
    expect(menuRow("001").getAttribute("aria-current")).toBe("true");
    click(/Confirm quantity/); click(/Confirm quantity/); // ✓ ✓  -> 2 x Chilli Chicken
    expect(qtyIn("001")).toBe("2");

    click(/Highlight next item/);                 // 002
    click(/Confirm quantity/);
    expect(qtyIn("002")).toBe("1");

    fireEvent.click(cartRow("001")!);             // tap a line in the order panel
    expect(cartRow("001")!.getAttribute("aria-current")).toBe("true");
    click(/^X/);                                  // keypad X: one off
    expect(qtyIn("001")).toBe("1");
    click(/^X/);
    expect(cartRow("001")).toBeNull();
    expect(qtyIn("002")).toBe("1");               // untouched
  });

  it("keypad X still works as backspace while an item code is being typed", () => {
    mount();
    key("ArrowDown"); key("Enter");               // item in cart, cursor in menu
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /^X/ }));
    expect(qtyIn("001")).toBe("1");               // nothing was removed from the cart
  });
});
