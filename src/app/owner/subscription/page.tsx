import "@/components/reports/reports.css";
import { requirePermission } from "@/server/modules/auth/session";
import { getDevicesDb } from "@/server/modules/data/devices-db";
import { getSettings } from "@/server/modules/demo-store/settings";
import { PLANS, PLAN_ORDER, deviceLimit, getSubscription, monthlyRupees } from "@/server/modules/demo-store/subscription";
import { SubscriptionManager } from "./subscription-manager";
import type { SubscriptionLanguage } from "./subscription-i18n";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const session = await requirePermission("subscription");
  const [sub, devices, settings] = await Promise.all([
    getSubscription(session.restaurantId),
    getDevicesDb(session.restaurantId),
    getSettings(session.restaurantId),
  ]);

  return (
    <div className="rp">
      <SubscriptionManager
        planId={sub.plan}
        planName={PLANS[sub.plan].name}
        renewalDate={sub.renewalDate}
        monthlyRupees={monthlyRupees(sub)}
        devicesUsed={devices.length}
        deviceLimit={deviceLimit(sub)}
        plans={PLAN_ORDER.map((id) => ({ id, ...PLANS[id] }))}
        payments={sub.payments.map((p) => ({
          id: p.id,
          invoiceNo: p.invoiceNo,
          date: p.paidAt,
          description: p.description,
          amountRupees: p.amountRupees,
          status: p.status,
        }))}
        initialLanguage={settings.language as SubscriptionLanguage}
      />
    </div>
  );
}
