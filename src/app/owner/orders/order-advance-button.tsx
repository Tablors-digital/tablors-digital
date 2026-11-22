"use client";

import { useState, useTransition } from "react";
import { advanceOrder } from "@/server/modules/orders/actions";
import type { OrderStatus } from "@/server/modules/demo-store/store";

type Props = {
  orderId: string;
  currentStatus: OrderStatus;
  label: string;
};

export function OrderAdvanceButton({ orderId, currentStatus, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [optimisticLabel, setOptimisticLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleClick() {
    setErrorMsg(null);
    setOptimisticLabel(currentStatus === "ready" ? "Marking Served…" : "Marking Ready…");

    startTransition(async () => {
      const res = await advanceOrder(orderId, currentStatus);
      setOptimisticLabel(null);
      if (!res.ok) {
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="rounded-lg border border-[#39ff6a] bg-[#39ff6a] px-5 py-2.5 text-sm font-extrabold text-black shadow-[0_0_14px_rgba(57,255,106,0.35)] transition hover:brightness-110 active:scale-95 disabled:opacity-60"
      >
        {optimisticLabel ?? label}
      </button>
      {errorMsg && <span className="text-xs text-red-400">{errorMsg}</span>}
    </div>
  );
}