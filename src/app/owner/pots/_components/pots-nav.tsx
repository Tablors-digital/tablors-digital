"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hourglass } from "lucide-react";

const NAV = [
  ["Overview", "/owner/pots"], ["Salary", "/owner/pots/salary"], ["Suppliers", "/owner/pots/suppliers"], ["GST", "/owner/pots/gst"],
  ["Profit", "/owner/pots/profit"], ["Approvals", "/owner/pots/approvals"], ["Transactions", "/owner/pots/transactions"],
  ["Rules", "/owner/pots/rules"], ["Loyalty", "/owner/pots/loyalty"], ["Reports", "/owner/pots/reports"], ["Team", "/owner/pots/team"],
] as const;

/**
 * `pending` maps a tab href to how many items are waiting there, e.g.
 * { "/owner/pots/approvals": 3, "/owner/pots/suppliers": 1 }.
 * A tab with a count shows a pulsing hourglass and the number.
 */
export function PotsNav({ pending = {} }: { pending?: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Financial Pots" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-xs [scrollbar-width:none]">
      {NAV.map(([label, href]) => {
        const active = href === "/owner/pots" ? path === href : path === href || path.startsWith(`${href}/`);
        const waiting = pending[href] ?? 0;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-medium transition-all ${active ? "border-transparent text-black shadow-[0_0_18px_rgba(212,175,55,0.35)]" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"}`}
            style={active ? { background: "var(--color-gold-500)" } : undefined}>
            {label}
            {waiting > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={active ? { background: "rgba(0,0,0,0.15)" } : { color: "var(--color-gold-500)", background: "rgba(212,175,55,0.12)" }} title={`${waiting} waiting`}>
                <Hourglass className="h-3 w-3 animate-pulse" aria-hidden />{waiting}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}