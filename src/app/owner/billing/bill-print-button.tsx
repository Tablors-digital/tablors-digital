"use client";

import { Printer } from "lucide-react";

/**
 * Prints a bill straight from the list: loads the existing bill page in a
 * hidden frame (its print styles hide the app chrome) and opens the print
 * dialog. Nothing is created or changed.
 */
export function BillPrintButton({ billId }: { billId: string }) {
  function print() {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    frame.src = `/owner/billing/${billId}`;
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) return;
      w.focus();
      w.print();
      setTimeout(() => frame.remove(), 60000);
    };
    document.body.appendChild(frame);
  }

  return (
    <button
      type="button"
      onClick={print}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
    >
      <Printer className="h-3.5 w-3.5" />
      Print
    </button>
  );
}
