// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LoyaltyBox, findRewardByPoints, type LoyaltyHandlers } from "@/components/customer/device/loyalty-box";
import type { CustomerBillState } from "@/server/modules/customer/actions";

afterEach(cleanup);

const REWARD = { id: "r1", name: "₹10 off", description: "₹10 off your bill", pointsCost: 100, redeemable: true, reason: null };
const LOCKED = { id: "r2", name: "₹50 off", description: "₹50 off your bill", pointsCost: 500, redeemable: false, reason: "Not enough points." };

function bill(over: Record<string, unknown> = {}, status = "unpaid") {
  return {
    status,
    loyalty: {
      enabled: true,
      identified: true,
      phoneMasked: "98******10",
      balance: 150,
      pointsToEarn: 0,
      applied: null,
      rewards: [REWARD, LOCKED],
      history: [],
      ...over,
    },
  } as unknown as CustomerBillState;
}

function handlers(): LoyaltyHandlers {
  return {
    identify: vi.fn(async () => ({ ok: true })),
    redeem: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  };
}

const redeemInput = () => screen.getByLabelText(/Points to redeem/) as HTMLInputElement;
const enter = (el: Element) => fireEvent.keyDown(el, { key: "Enter" });

describe("loyalty phone entry", () => {
  const anon = () => bill({ identified: false });

  it("Enter in the phone field does the same as Continue", async () => {
    const h = handlers();
    render(<LoyaltyBox bill={anon()} handlers={h} />);
    const input = screen.getByLabelText(/mobile number/i);
    fireEvent.change(input, { target: { value: "98765 43210" } });
    enter(input);
    await waitFor(() => expect(h.identify).toHaveBeenCalledWith("98765 43210"));
  });

  it("Enter on an empty phone field does nothing; Continue button still works", async () => {
    const h = handlers();
    render(<LoyaltyBox bill={anon()} handlers={h} />);
    enter(screen.getByLabelText(/mobile number/i));
    expect(h.identify).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(h.identify).toHaveBeenCalledTimes(1));
  });
});

describe("redeem points", () => {
  it("has no Redeem button: redeeming is Enter-only", () => {
    render(<LoyaltyBox bill={bill()} handlers={handlers()} />);
    expect(screen.queryByRole("button", { name: /^Redeem/ })).toBeNull();
  });

  it("Enter with matching points redeems that reward and then proceeds to payment", async () => {
    const h = handlers();
    const onProceed = vi.fn();
    render(<LoyaltyBox bill={bill()} handlers={h} onProceed={onProceed} />);
    fireEvent.change(redeemInput(), { target: { value: "100" } });
    expect(h.redeem).not.toHaveBeenCalled();             // typing alone does nothing
    enter(redeemInput());
    await waitFor(() => expect(h.redeem).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
  });

  it("blur does not redeem or proceed", () => {
    const h = handlers();
    const onProceed = vi.fn();
    render(<LoyaltyBox bill={bill()} handlers={h} onProceed={onProceed} />);
    fireEvent.change(redeemInput(), { target: { value: "100" } });
    fireEvent.blur(redeemInput());
    expect(h.redeem).not.toHaveBeenCalled();
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("Enter on an empty field skips redeeming and proceeds to payment", () => {
    const h = handlers();
    const onProceed = vi.fn();
    render(<LoyaltyBox bill={bill()} handlers={h} onProceed={onProceed} />);
    enter(redeemInput());
    expect(h.redeem).not.toHaveBeenCalled();
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it("nothing redeemable: no redeem field, no Locked card (Enter on the device goes to payment)", () => {
    render(<LoyaltyBox bill={bill({ balance: 48, rewards: [{ ...REWARD, redeemable: false, reason: "Not enough points." }] })} handlers={handlers()} />);
    expect(screen.queryByLabelText(/Points to redeem/)).toBeNull();
    expect(screen.queryByText(/Locked/)).toBeNull();
    expect(screen.queryByText(REWARD.name)).toBeNull();
    expect(screen.getByText(/No reward is available with your points yet/)).toBeTruthy();
  });

  it("only usable rewards are listed, and there is no Recent activity list", () => {
    render(<LoyaltyBox bill={bill({ history: [{ id: "h1", createdAt: Date.now(), type: "earn", reason: "Points earned on paid bill", points: 16 }] })} handlers={handlers()} />);
    expect(screen.getByText(REWARD.name)).toBeTruthy();
    expect(screen.queryByText(LOCKED.name)).toBeNull();
    expect(screen.queryByText(/Recent activity/)).toBeNull();
    expect(screen.queryByText(/Points earned on paid bill/)).toBeNull();
  });

  it("points that match no available reward show a message and do not proceed", async () => {
    const h = handlers();
    const onProceed = vi.fn();
    render(<LoyaltyBox bill={bill()} handlers={h} onProceed={onProceed} />);
    fireEvent.change(redeemInput(), { target: { value: "70" } });
    enter(redeemInput());
    expect((await screen.findByRole("alert")).textContent).toMatch(/No reward costs 70 points/);
    fireEvent.change(redeemInput(), { target: { value: "500" } });
    enter(redeemInput());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Not enough points/));
    expect(h.redeem).not.toHaveBeenCalled();
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("a failed redemption does not proceed to payment", async () => {
    const h = handlers();
    h.redeem = vi.fn(async () => ({ ok: false, message: "Reward no longer available." }));
    const onProceed = vi.fn();
    render(<LoyaltyBox bill={bill()} handlers={h} onProceed={onProceed} />);
    fireEvent.change(redeemInput(), { target: { value: "100" } });
    enter(redeemInput());
    expect((await screen.findByRole("alert")).textContent).toMatch(/no longer available/);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("findRewardByPoints rejects non-numeric input", () => {
    expect(findRewardByPoints([REWARD], "abc").ok).toBe(false);
    expect(findRewardByPoints([REWARD], "0").ok).toBe(false);
    expect(findRewardByPoints([REWARD], " 100 ")).toEqual({ ok: true, rewardId: "r1" });
  });
});
