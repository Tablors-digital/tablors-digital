import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { PinSessionGuard } from "@/components/pin-session-guard";
import { PIN_IDLE_MS } from "@/server/modules/auth/pin-session";
import { getPotsPinVerified } from "@/server/modules/auth/pots-session";
import { PotsNav } from "./_components/pots-nav";

/**
 * Server-side PIN gate for every route under /owner/pots, plus the section navigation and the sandbox label.
 * `--radium-green` is referenced by the older Pots screens (rules, approvals, loyalty...) but was never defined,
 * so it is aliased here to the project's radium-green token (--color-radium-500) for the whole Pots section.
 * PinSessionGuard locks the section on leave / after 10s idle.
 */
export default async function PotsLayout({ children }: { children: ReactNode }) {
  if (!(await getPotsPinVerified())) redirect("/owner/pots-pin");
  return (
    <div className="space-y-5" style={{ ["--radium-green" as string]: "var(--color-radium-500)" } as CSSProperties}>
      <PinSessionGuard scope="pots" pinPath="/owner/pots-pin" idleMs={PIN_IDLE_MS} />
      <PotsNav />
      <p className="rounded-lg border border-amber-900/50 px-3 py-1.5 text-xs text-amber-400">Prototype mode — payments and payouts are simulated. No real money moves.</p>
      {children}
    </div>
  );
}
