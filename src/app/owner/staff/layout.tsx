import type { ReactNode } from "react";
import { PinSessionGuard } from "@/components/pin-session-guard";
import { PIN_IDLE_MS } from "@/server/modules/auth/pin-session";

/** Wraps /owner/staff and /owner/staff/[id]. Unmounts when the user leaves the section, which locks it. */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PinSessionGuard scope="staff" pinPath="/owner/staff-pin" idleMs={PIN_IDLE_MS} />
      {children}
    </>
  );
}
