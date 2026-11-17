"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Re-runs the server page to pull the latest orders (no full reload). */
export function OrdersRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:border-[var(--radium-green)] hover:text-[var(--radium-green)] disabled:opacity-60"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      Refresh
    </button>
  );
}
