"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Gift, Pencil, Plus, Trash2, X } from "lucide-react";

import { SubmitOnceButton } from "@/components/ui/submit-once-button";
import {
  createRewardAction,
  deleteRewardAction,
  toggleRewardAction,
  updateRewardAction,
} from "./points-actions";

export type RewardView = {
  id: string;
  name: string;
  type: string;
  pointsCost: number;
  valueRupees: number | null;
  percent: number | null;
  maxDiscountRupees: number | null;
  quantity: number | null;
  terms: string | null;
  active: boolean;
  /** YYYY-MM-DD (India) or "" */
  validFrom: string;
  validTo: string;
};

const TYPE_LABEL: Record<string, string> = {
  fixed_discount: "Fixed discount (₹)",
  percent_discount: "Percentage discount",
  free_item: "Free item",
  coupon: "Coupon",
  experience: "Experience / perk",
};

const input =
  "mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-[#d7fe3b]";
const label = "block text-xs text-zinc-400";

function summary(r: RewardView): string {
  if (r.type === "fixed_discount" && r.valueRupees) return `₹${r.valueRupees} off`;
  if (r.type === "percent_discount" && r.percent)
    return `${r.percent}% off${r.maxDiscountRupees ? ` (max ₹${r.maxDiscountRupees})` : ""}`;
  return TYPE_LABEL[r.type] ?? r.type;
}

function Switch({ on }: { on: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Deactivate reward" : "Activate reward"}
      disabled={pending}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-[#d7fe3b]" : "bg-zinc-700"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Delete reward"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function RewardDialog({ reward, onClose }: { reward: RewardView | null; onClose: () => void }) {
  const [type, setType] = useState(reward?.type ?? "fixed_discount");
  const [errors, setErrors] = useState<string[]>([]);

  function validate(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    const errs: string[] = [];
    const name = String(f.get("name") ?? "").trim();
    const cost = num("pointsCost");
    if (name.length < 2) errs.push("Enter a reward name (at least 2 characters).");
    if (cost === null || !Number.isInteger(cost) || cost < 1) errs.push("Points cost must be a whole number of 1 or more.");
    if (type === "fixed_discount") {
      const v = num("valueRupees");
      if (v === null || !Number.isInteger(v) || v <= 0) errs.push("Enter a discount amount in whole rupees (more than 0).");
    }
    if (type === "percent_discount") {
      const p = num("percent");
      if (p === null || !Number.isInteger(p) || p < 1 || p > 100) errs.push("Percent must be a whole number from 1 to 100.");
    }
    const qty = num("quantity");
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) errs.push("Quantity must be a whole number (or blank for unlimited).");
    const from = String(f.get("validFrom") ?? "");
    const to = String(f.get("validTo") ?? "");
    if (from && to && from > to) errs.push("“Valid until” must be on or after “Valid from”.");

    setErrors(errs);
    if (errs.length) e.preventDefault();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{reward ? "Edit reward" : "New reward"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={reward ? updateRewardAction : createRewardAction} onSubmit={validate} noValidate className="mt-4 space-y-4">
          {reward && <input type="hidden" name="id" value={reward.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Reward name
              <input name="name" defaultValue={reward?.name} placeholder="₹50 off your next bill" maxLength={80} className={input} />
            </label>
            <label className={label}>
              Type
              <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={input}>
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Points cost
              <input name="pointsCost" type="number" min={1} step={1} defaultValue={reward?.pointsCost} className={input} />
            </label>

            {type === "fixed_discount" && (
              <label className={label}>
                Discount (₹)
                <input name="valueRupees" type="number" min={1} step={1} defaultValue={reward?.valueRupees ?? ""} className={input} />
              </label>
            )}
            {type === "percent_discount" && (
              <>
                <label className={label}>
                  Percent (1–100)
                  <input name="percent" type="number" min={1} max={100} step={1} defaultValue={reward?.percent ?? ""} className={input} />
                </label>
                <label className={label}>
                  Max discount ₹ (optional)
                  <input name="maxDiscountRupees" type="number" min={0} step={1} defaultValue={reward?.maxDiscountRupees ?? ""} className={input} />
                </label>
              </>
            )}

            <label className={label}>
              Quantity (blank = unlimited)
              <input name="quantity" type="number" min={0} step={1} defaultValue={reward?.quantity ?? ""} className={input} />
            </label>
            <label className={label}>
              Valid from
              <input name="validFrom" type="date" defaultValue={reward?.validFrom ?? ""} className={`${input} [color-scheme:dark]`} />
            </label>
            <label className={label}>
              Valid until
              <input name="validTo" type="date" defaultValue={reward?.validTo ?? ""} className={`${input} [color-scheme:dark]`} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Terms (optional)
              <input name="terms" maxLength={300} defaultValue={reward?.terms ?? ""} className={input} />
            </label>
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-zinc-500">
              Cancel
            </button>
            <SubmitOnceButton
              pendingLabel="Saving…"
              className="h-10 rounded-lg bg-[#d7fe3b] px-5 text-sm font-semibold text-black transition hover:opacity-90"
            >
              {reward ? "Save changes" : "Create reward"}
            </SubmitOnceButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RewardManager({ rewards }: { rewards: RewardView[] }) {
  // undefined = closed, null = creating, RewardView = editing
  const [dialog, setDialog] = useState<RewardView | null | undefined>(undefined);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const shown = rewards.filter((r) => filter === "all" || (filter === "active" ? r.active : !r.active));

  return (
    <section id="rewards" className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Gift className="h-5 w-5 text-[#d7fe3b]" /> Rewards
          <span className="text-xs font-normal text-zinc-500">{rewards.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => setDialog(null)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#d7fe3b] px-4 text-sm font-semibold text-black hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New reward
        </button>
      </div>

      {rewards.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "All", rewards.length],
              ["active", "Active", rewards.filter((r) => r.active).length],
              ["inactive", "Inactive", rewards.filter((r) => !r.active).length],
            ] as const
          ).map(([key, name, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === key
                  ? "border-[#d7fe3b] bg-[#d7fe3b]/10 text-[#d7fe3b]"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {name} {n}
            </button>
          ))}
        </div>
      )}

      {rewards.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">No rewards yet</p>
          <p className="mt-1 text-xs text-zinc-500">Create a reward so members can spend their points.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
              No {filter} rewards.
            </p>
          )}
          {shown.map((r) => (
            <div
              key={r.id}
              onClick={() => setDialog(r)}
              className={`flex cursor-pointer flex-col rounded-xl border p-4 transition hover:border-[#d7fe3b]/50 ${r.active ? "border-zinc-800" : "border-zinc-900 opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-50">{r.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{summary(r)}</p>
                </div>
                <form action={toggleRewardAction} onClick={(e) => e.stopPropagation()}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={String(!r.active)} />
                  <Switch on={r.active} />
                </form>
              </div>

              <p className="mt-3 text-2xl font-semibold text-[#d7fe3b]">
                {r.pointsCost.toLocaleString("en-IN")} <span className="text-xs font-normal text-zinc-500">points</span>
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                {r.quantity === null ? "Unlimited" : `${r.quantity} available`}
                {(r.validFrom || r.validTo) && ` · ${r.validFrom || "…"} → ${r.validTo || "…"}`}
              </p>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-zinc-900 pt-3" onClick={(e) => e.stopPropagation()}>
                <span className={`text-xs font-medium ${r.active ? "text-[#d7fe3b]" : "text-zinc-500"}`}>
                  {r.active ? "Active" : "Inactive"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog(r)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-xs text-zinc-200 hover:border-zinc-600"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <form
                    action={deleteRewardAction}
                    onSubmit={(e) => {
                      if (!window.confirm(`Delete “${r.name}”? This can't be undone.`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <DeleteButton />
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog !== undefined && <RewardDialog key={dialog?.id ?? "new"} reward={dialog} onClose={() => setDialog(undefined)} />}
    </section>
  );
}
