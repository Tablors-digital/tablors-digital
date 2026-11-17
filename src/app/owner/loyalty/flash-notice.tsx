"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

/**
 * Result of the last action (comes from ?notice=). Shows for a few seconds,
 * can be closed, and removes the notice from the address bar so a refresh
 * doesn't show it again.
 */
export function FlashNotice({ ok, text }: { ok: boolean; text: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("notice")) {
      url.searchParams.delete("notice");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        ok
          ? "border-[#d7fe3b]/40 bg-[#d7fe3b]/10 text-[#d7fe3b]"
          : "border-red-500/50 bg-red-500/10 text-red-300"
      }`}
    >
      <p className="flex items-start gap-2">
        {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        {text}
      </p>
      <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
