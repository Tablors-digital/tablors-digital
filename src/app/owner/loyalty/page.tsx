import Link from "next/link";
import { Coins, Gift, History, RotateCcw, Settings2, Users, Wallet } from "lucide-react";

import { LiveRefresh } from "@/components/live/live-refresh";
import { SubmitOnceButton } from "@/components/ui/submit-once-button";
import { requirePermission } from "@/server/modules/auth/session";
import {
  getLoyaltySettingsDb,
  getLoyaltyStatsDb,
  listCustomersDb,
  listRewardsDb,
} from "@/server/modules/loyalty-db/db-loyalty";
import { maskPhone } from "@/server/modules/loyalty-db/engine";
import { FlashNotice } from "./flash-notice";
import { MembersPanel } from "./members-panel";
import { RewardManager, type RewardView } from "./reward-manager";
import { saveLoyaltySettingsAction } from "./points-actions";

export const dynamic = "force-dynamic";

const input =
  "mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-[#d7fe3b]";
const label = "block text-xs text-zinc-400";
const checkLabel = "flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-800 px-3 py-2.5 text-sm text-zinc-200 hover:border-zinc-600";

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  "settings-saved": { ok: true, text: "Loyalty settings saved." },
  "invalid-settings": { ok: false, text: "Check the settings: rate, points and limits must be valid numbers." },
  "reward-created": { ok: true, text: "Reward created." },
  "reward-updated": { ok: true, text: "Reward updated." },
  "reward-deleted": { ok: true, text: "Reward deleted." },
  "reward-in-use": { ok: false, text: "This reward has been redeemed before, so it can't be deleted. Deactivate it instead." },
  "reward-missing": { ok: false, text: "That reward no longer exists." },
  "invalid-reward": { ok: false, text: "Check the reward: name, points cost, and the discount value or percent (1–100)." },
  adjusted: { ok: true, text: "Points adjusted and logged." },
  "adjust-failed": { ok: false, text: "Adjustment failed: use a whole number, a reason, and don't go below zero." },
  "owner-only": { ok: false, text: "Only the owner can adjust points manually." },
  "customer-updated": { ok: true, text: "Member updated." },
  "member-deleted": { ok: true, text: "Member and their points history deleted." },
  "member-on-hold": { ok: false, text: "This member has points on hold for an open bill. Finish or release that bill first." },
  "customer-missing": { ok: false, text: "That member no longer exists." },
  denied: { ok: false, text: "You don't have access to loyalty." },
};

const dateInput = (d: Date | null) =>
  d ? new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : "";

export default async function LoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; customer?: string }>;
}) {
  const session = await requirePermission("loyalty");
  const { notice: code, customer: customerId } = await searchParams;
  const notice = code ? NOTICES[code] : null;
  const rid = session.restaurantId;

  const [settings, stats, rewards, customers] = await Promise.all([
    getLoyaltySettingsDb(rid),
    getLoyaltyStatsDb(rid),
    listRewardsDb(rid),
    listCustomersDb(rid),
  ]);

  const rewardViews: RewardView[] = rewards.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    pointsCost: r.pointsCost,
    valueRupees: r.valuePaise ? r.valuePaise / 100 : null,
    percent: r.percent,
    maxDiscountRupees: r.maxDiscountPaise ? r.maxDiscountPaise / 100 : null,
    quantity: r.quantity,
    terms: r.terms,
    active: r.active,
    validFrom: dateInput(r.validFrom),
    validTo: dateInput(r.validTo),
  }));

  const kpis = [
    { name: "Members", value: stats.members, icon: Users, href: "#members", hint: "View members" },
    { name: "Points issued", value: stats.issued, icon: Coins, href: "#earning", hint: "Edit earning rules" },
    { name: "Points redeemed", value: stats.redeemed, icon: Gift, href: "#rewards", hint: "View rewards" },
    { name: "Points reversed", value: stats.reversed, icon: RotateCcw, href: "#members", hint: "Check members" },
    { name: "Outstanding points", value: stats.outstanding, icon: Wallet, href: "#members", hint: "See balances" },
  ];

  const nav = [
    ["Earning rules", "#earning"],
    ["Rewards", "#rewards"],
    ["Members", "#members"],
    ["Messaging", "#messaging"],
  ];

  return (
    <div className="space-y-5">
      <LiveRefresh intervalMs={15000} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Loyalty</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Members are identified by mobile number. Points are earned automatically when a bill is paid and are kept
            separate from money and Pots.
          </p>
        </div>
        <Link href="/owner/loyalty/legacy" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-xs text-zinc-300 hover:border-zinc-600">
          <History className="h-3.5 w-3.5" /> Older member offers
        </Link>
      </div>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Loyalty sections">
        {nav.map(([name, href]) => (
          <a
            key={href}
            href={href}
            className="whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[#d7fe3b] hover:text-[#d7fe3b]"
          >
            {name}
          </a>
        ))}
      </nav>

      {notice && <FlashNotice key={code} ok={notice.ok} text={notice.text} />}

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map(({ name, value, icon: Icon, href, hint }, i) => (
          <a
            key={name}
            href={href}
            title={hint}
            className={`group flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3.5 transition hover:border-[#d7fe3b]/60 hover:bg-zinc-900/60 ${
              i === 4 ? "col-span-2 md:col-span-1" : ""
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d7fe3b]/10 text-[#d7fe3b]">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500">{name}</p>
              <p className="truncate text-2xl font-semibold text-white">{value.toLocaleString("en-IN")}</p>
            </div>
          </a>
        ))}
      </section>

      {/* Earning rules */}
      <section id="earning" className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Settings2 className="h-5 w-5 text-[#d7fe3b]" /> Earning Rules
        </h2>

        <form action={saveLoyaltySettingsAction} className="mt-4 space-y-4">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-zinc-100">Loyalty program</span>
              <span className="block text-xs text-zinc-500">Switching off keeps all members and history.</span>
            </span>
            <span className="relative inline-flex shrink-0 items-center">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="peer sr-only" />
              <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-[#d7fe3b] peer-focus-visible:ring-2 peer-focus-visible:ring-[#d7fe3b]/60" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-black transition-all peer-checked:left-[22px]" />
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={label}>
              Points earned
              <input name="earnPoints" type="number" min={1} step={1} required defaultValue={settings.earnPoints} className={input} />
            </label>
            <label className={label}>
              …for every ₹ of eligible spend
              <input name="earnSpendRupees" type="number" min={1} step="any" required defaultValue={settings.earnSpendPaise / 100} className={input} />
            </label>
            <label className={label}>
              Minimum bill (₹)
              <input name="minBillRupees" type="number" min={0} defaultValue={settings.minBillPaise / 100} className={input} />
            </label>
            <label className={label}>
              Max points per bill (blank = none)
              <input name="maxPointsPerBill" type="number" min={0} step={1} defaultValue={settings.maxPointsPerBill ?? ""} className={input} />
            </label>
            <label className={label}>
              Points expire after (months, blank = never)
              <input name="expiryMonths" type="number" min={0} step={1} defaultValue={settings.expiryMonths ?? ""} className={input} />
            </label>
            <label className={label}>
              Minimum points to redeem
              <input name="minPointsToRedeem" type="number" min={0} step={1} defaultValue={settings.minPointsToRedeem} className={input} />
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <label className={checkLabel}>
              <input type="checkbox" name="excludeGst" defaultChecked={settings.excludeGst} className="h-4 w-4 accent-[#d7fe3b]" />
              Exclude GST from points
            </label>
            <label className={checkLabel}>
              <input type="checkbox" name="excludeServiceCharge" defaultChecked={settings.excludeServiceCharge} className="h-4 w-4 accent-[#d7fe3b]" />
              Exclude service charge
            </label>
            <label className={checkLabel}>
              <input type="checkbox" name="discountBeforePoints" defaultChecked={settings.discountBeforePoints} className="h-4 w-4 accent-[#d7fe3b]" />
              Deduct discounts before points
            </label>
          </div>

          <SubmitOnceButton
            pendingLabel="Saving…"
            className="h-10 rounded-lg bg-[#d7fe3b] px-6 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Save settings
          </SubmitOnceButton>
        </form>
      </section>

      {/* Rewards */}
      <RewardManager rewards={rewardViews} />

      {/* Members + offer messaging */}
      <div className="grid gap-5 xl:grid-cols-5 xl:items-start xl:[&>#members]:col-span-3 xl:[&>#messaging]:col-span-2">
        <MembersPanel
          members={customers.map((c) => ({
            id: c.id,
            maskedPhone: maskPhone(c.phone),
            balance: c.balance,
            status: c.status,
            joined: c.createdAt.toISOString(),
          }))}
          isOwner={session.role === "owner"}
          initialCustomerId={customerId ?? null}
        />
      </div>
    </div>
  );
}
