import { ALERT_HELP, ALERT_LABEL, ALERT_TYPES, stockState } from "@/lib/inventory-alerts";
import { requirePermission } from "@/server/modules/auth/session";
import { getAlertSettings, listItems, listLog } from "@/server/modules/inventory/store";
import { whatsappConnection } from "@/server/modules/inventory/whatsapp";
import {
  addRecipientAction,
  deleteItemAction,
  notifySupplierAction,
  removeRecipientAction,
  saveAlertSettingsAction,
  saveItemAction,
  sendReplenishmentAction,
  updateStockAction,
} from "./actions";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5";
const input =
  "w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#d7fe3b] focus:outline-none";
const primary = "min-h-10 rounded-lg bg-[#d7fe3b] px-4 py-2 text-sm font-semibold text-black hover:opacity-90";
const ghost = "min-h-9 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#d7fe3b] hover:text-[#d7fe3b]";
const danger = "min-h-9 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-500/50 hover:text-red-400";
const stamp = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const STATE_PILL = {
  ok: ["In stock", "bg-[#d7fe3b]/10 text-[#d7fe3b]"],
  low: ["Low", "bg-amber-500/10 text-amber-400"],
  out: ["Out of stock", "bg-red-500/10 text-red-400"],
} as const;
const STATUS_LABEL = {
  sent: ["Accepted by WhatsApp", "text-[#d7fe3b]"],
  failed: ["Failed", "text-red-400"],
  not_configured: ["Not sent · WhatsApp not connected", "text-amber-400"],
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const session = await requirePermission("inventory");
  const { notice } = await searchParams;
  const [items, settings, log] = await Promise.all([
    listItems(session.restaurantId),
    getAlertSettings(session.restaurantId),
    listLog(session.restaurantId, 40),
  ]);
  const conn = whatsappConnection();
  const states = items.map((i) => stockState(i.quantity, i.lowStockThreshold));
  const low = states.filter((s) => s === "low").length;
  const out = states.filter((s) => s === "out").length;
  const isError = notice?.startsWith("error:");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Inventory</h1>
        <p className="mt-1 text-sm text-zinc-400">Track stock and send WhatsApp alerts for low and out-of-stock items.</p>
      </div>

      {notice && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${isError ? "border-red-900 text-red-400" : "border-zinc-800 text-[#d7fe3b]"}`}>
          {isError ? notice.slice(6) : notice}
        </p>
      )}

      {conn.configured ? (
        <p className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
          WhatsApp is connected. “Accepted by WhatsApp” means the message was handed to WhatsApp; read and delivery receipts are not tracked yet.
        </p>
      ) : (
        <p className="rounded-lg border border-amber-900 px-3 py-2 text-sm text-amber-400">
          WhatsApp is not connected. Set {conn.missing.join(" and ")} on the server (Meta WhatsApp Cloud API). Until then, alerts are recorded in the history as “not sent”; nothing is delivered.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[["Items", items.length, "text-zinc-50"], ["Low stock", low, "text-amber-400"], ["Out of stock", out, "text-red-400"]].map(([t, v, c]) => (
          <div key={String(t)} className={`${card} !p-4`}>
            <p className="text-xs text-zinc-500">{t}</p>
            <p className={`mt-1 text-2xl font-semibold ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className={`${card} !p-0 overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="text-sm font-semibold text-zinc-100">Stock</h2>
          <form action={sendReplenishmentAction}>
            <button className={ghost}>Send replenishment reminder</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
              <tr><th className="px-4 py-2 font-medium">Item</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Set stock</th><th className="px-4 py-2 font-medium">Alert at</th><th className="px-4 py-2 font-medium">Supplier</th><th className="px-4 py-2 font-medium">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {items.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-500">No items yet. Add the first one below.</td></tr>}
              {items.map((i, idx) => {
                const [label, cls] = STATE_PILL[states[idx]];
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-2 font-medium text-zinc-100">{i.name}</td>
                    <td className="px-4 py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span></td>
                    <td className="px-4 py-2">
                      <form action={updateStockAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={i.id} />
                        <input name="quantity" inputMode="decimal" defaultValue={i.quantity} aria-label={`Stock of ${i.name}`} className={`${input} !w-24`} />
                        <span className="text-xs text-zinc-500">{i.unit}</span>
                        <button className={ghost}>Update</button>
                      </form>
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{i.lowStockThreshold} {i.unit}</td>
                    <td className="px-4 py-2 text-zinc-400">{i.supplierName || "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <form action={notifySupplierAction}><input type="hidden" name="id" value={i.id} /><button className={ghost} disabled={!i.supplierPhone} title={i.supplierPhone ? "" : "No supplier WhatsApp number"}>Notify supplier</button></form>
                        <form action={deleteItemAction}><input type="hidden" name="id" value={i.id} /><button className={danger}>Delete</button></form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold text-zinc-100">Add an item</h2>
        <form action={saveItemAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Name"><input name="name" required minLength={2} maxLength={80} className={input} placeholder="Basmati rice" /></Field>
          <Field label="Unit"><input name="unit" required maxLength={12} className={input} placeholder="kg" /></Field>
          <Field label="Current stock"><input name="quantity" required inputMode="decimal" className={input} placeholder="25" /></Field>
          <Field label="Alert when stock is at or below"><input name="lowStockThreshold" required inputMode="decimal" className={input} placeholder="5" /></Field>
          <Field label="Supplier name (optional)"><input name="supplierName" maxLength={80} className={input} /></Field>
          <Field label="Supplier WhatsApp (optional)"><input name="supplierPhone" inputMode="tel" className={input} placeholder="98765 43210" /></Field>
          <div className="sm:col-span-3"><button className={primary}>Add item</button></div>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Alerts and message templates</h2>
          <p className="mt-1 text-xs text-zinc-500">Everything starts switched off. Use {"{item} {quantity} {unit} {threshold} {supplier} {restaurant} {items}"} in templates.</p>
          <form action={saveAlertSettingsAction} className="mt-3 space-y-4">
            {ALERT_TYPES.map((t) => (
              <div key={t} className="space-y-1.5 border-t border-zinc-900 pt-3 first:border-0 first:pt-0">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <input type="checkbox" name={`enabled_${t}`} defaultChecked={settings.enabled[t]} className="h-4 w-4 accent-[#d7fe3b]" />
                  {ALERT_LABEL[t]}
                </label>
                <p className="text-xs text-zinc-500">{ALERT_HELP[t]}</p>
                <textarea name={`template_${t}`} defaultValue={settings.templates[t]} rows={2} maxLength={500} className={input} aria-label={`${ALERT_LABEL[t]} template`} />
              </div>
            ))}
            <button className={primary}>Save settings</button>
          </form>
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-100">Who receives alerts</h2>
          <ul className="mt-3 divide-y divide-zinc-900 text-sm">
            {settings.recipients.length === 0 && <li className="py-2 text-zinc-500">No recipients yet. Alerts have nobody to go to.</li>}
            {settings.recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-zinc-200">{r.name} <span className="text-zinc-500">+{r.phone}</span></span>
                <form action={removeRecipientAction}><input type="hidden" name="id" value={r.id} /><button className={danger}>Remove</button></form>
              </li>
            ))}
          </ul>
          <form action={addRecipientAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Name"><input name="name" required minLength={2} className={input} /></Field>
            <Field label="WhatsApp number"><input name="phone" required inputMode="tel" className={input} placeholder="98765 43210" /></Field>
            <button className={primary}>Add</button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">A 10-digit number is treated as Indian (+91). Otherwise include the country code.</p>
        </div>
      </div>

      <div className={`${card} !p-0 overflow-hidden`}>
        <h2 className="p-4 pb-2 text-sm font-semibold text-zinc-100">Delivery history</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
              <tr><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Alert</th><th className="px-4 py-2 font-medium">To</th><th className="px-4 py-2 font-medium">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {log.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-500">No messages yet.</td></tr>}
              {log.map((l) => {
                const [label, cls] = STATUS_LABEL[l.status];
                return (
                  <tr key={l.id} title={l.message}>
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-300">{stamp.format(new Date(l.at))}</td>
                    <td className="px-4 py-2 text-zinc-300">{ALERT_LABEL[l.type]}</td>
                    <td className="px-4 py-2 text-zinc-300">{l.toName} <span className="text-zinc-500">+{l.to}</span></td>
                    <td className={`px-4 py-2 ${cls}`}>{label}{l.error ? <span className="block text-xs text-zinc-500">{l.error}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
