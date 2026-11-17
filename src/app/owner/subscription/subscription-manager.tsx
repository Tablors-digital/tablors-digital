"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronRight, CreditCard, Download, FileText, HardDrive, Loader2, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { changePlanAction, type SubscriptionActionResult } from "./actions";
import { SUBSCRIPTION_LOCALES, SUBSCRIPTION_STRINGS, type SubscriptionLanguage } from "./subscription-i18n";

type PlanId = "starter" | "professional" | "enterprise";
type PaymentRow = { id: string; invoiceNo: string; date: string; description: string; amountRupees: number; status: string };
type Props = {
  planId: string; planName: string; renewalDate: string; monthlyRupees: number;
  devicesUsed: number; deviceLimit: number;
  plans: { id: string; name: string; monthlyRupees: number; deviceLimit: number }[];
  payments: PaymentRow[]; initialLanguage: SubscriptionLanguage;
};

const panel = "rounded-2xl border border-zinc-800/90 bg-[#0b0d10] p-5 shadow-[0_8px_28px_rgba(0,0,0,0.16)]";
const actionButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-[#0d0f12] px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-[#c8ff00]/70 hover:text-[#c8ff00] focus:outline-none focus:ring-2 focus:ring-[#c8ff00]/40 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#c8ff00] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#d7ff45] focus:outline-none focus:ring-2 focus:ring-[#c8ff00]/50 disabled:cursor-not-allowed disabled:opacity-50";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-700 bg-[#101216] p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-white">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X size={18}/></button></div>
        {children}
      </section>
    </div>
  );
}

export function SubscriptionManager(p: Props) {
  const router = useRouter();
  const t = SUBSCRIPTION_STRINGS[p.initialLanguage] ?? SUBSCRIPTION_STRINGS.en;
  const locale = SUBSCRIPTION_LOCALES[p.initialLanguage] ?? "en-IN";
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<Props["plans"][number] | null>(null);
  const [showRenew, setShowRenew] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addCount, setAddCount] = useState("1");
  const [invoice, setInvoice] = useState<PaymentRow | null>(null);

  const currentIndex = p.plans.findIndex((x) => x.id === p.planId);
  const pct = Math.min(100, Math.round((p.devicesUsed / Math.max(p.deviceLimit, 1)) * 100));
  const renewalLabel = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", dateStyle: "long" }).format(new Date(p.renewalDate)), [locale, p.renewalDate]);
  const money = (n: number) => `₹${n.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
  const dateLabel = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", dateStyle: "medium" }).format(new Date(iso));

  function run(fn: () => Promise<SubscriptionActionResult>, successText: string, after?: () => void) {
    setNotice(null);
    start(async () => {
      try {
        const result = await fn();
        if (!result.ok) setNotice({ kind: "error", text: result.error });
        else { setNotice({ kind: "success", text: successText }); after?.(); router.refresh(); }
      } catch {
        setNotice({ kind: "error", text: t.paymentUnavailable });
      }
    });
  }

  function downloadInvoice(row: PaymentRow) {
    const safe = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safe(row.invoiceNo)}</title><style>body{font:15px Arial,sans-serif;color:#171717;margin:48px}h1{font-size:26px}table{width:100%;border-collapse:collapse;margin-top:28px}td,th{padding:14px;border-bottom:1px solid #ddd;text-align:left}.total{font-size:20px;font-weight:bold;text-align:right;margin-top:24px}.muted{color:#666}@media print{button{display:none}body{margin:20mm}}</style></head><body><h1>Tablor — ${safe(t.invoiceFor)}</h1><p class="muted">${safe(t.generated)}</p><p><b>${safe(t.invoiceNumber)}:</b> ${safe(row.invoiceNo)}<br><b>${safe(t.date)}:</b> ${safe(dateLabel(row.date))}<br><b>${safe(t.status)}:</b> ${safe(row.status)}</p><table><thead><tr><th>${safe(t.description)}</th><th>${safe(t.amount)}</th></tr></thead><tbody><tr><td>${safe(row.description)}</td><td>${safe(money(row.amountRupees))}</td></tr></tbody></table><p class="total">${safe(t.amount)}: ${safe(money(row.amountRupees))}</p><button onclick="window.print()">${safe(t.print)}</button></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${row.invoiceNo}.html`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const statusLabel = (status: string) => status === "paid" ? t.paid : status === "failed" ? t.failed : t.pending;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#c8ff00]/25 bg-[#c8ff00]/10 text-[#c8ff00]"><CreditCard size={23}/></span><div><h1 className="text-2xl font-semibold tracking-tight text-white">{t.heading}</h1><p className="mt-1 text-sm text-zinc-400">{t.subtitle}</p></div></div>
      </header>

      {notice && <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : notice.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}><ShieldCheck size={17} className="mt-0.5 shrink-0"/><span>{notice.text}</span><button type="button" className="ml-auto text-current/70 hover:text-current" onClick={() => setNotice(null)} aria-label={t.close}><X size={16}/></button></div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t.heading}>
        <article className={panel}><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{t.plan}</p><Sparkles size={18} className="text-[#c8ff00]"/></div><p className="mt-3 text-2xl font-semibold text-[#c8ff00]">{p.planName}</p></article>
        <article className={panel}><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{t.renewal}</p><CalendarDays size={18} className="text-zinc-500"/></div><p className="mt-3 text-xl font-semibold text-white">{renewalLabel}</p></article>
        <article className={panel}><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{t.monthly}</p><CreditCard size={18} className="text-zinc-500"/></div><p className="mt-3 text-2xl font-semibold text-white">{money(p.monthlyRupees)}</p></article>
        <article className={panel}><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{t.devices}</p><HardDrive size={18} className="text-zinc-500"/></div><p className="mt-3 text-2xl font-semibold text-white">{p.devicesUsed}<span className="text-zinc-500">/{p.deviceLimit}</span></p><div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-[#c8ff00] transition-all" style={{ width: `${pct}%` }}/></div><p className="mt-1.5 text-xs text-zinc-500">{pct}% {t.used}</p></article>
      </section>

      <div className="flex flex-wrap gap-2"><button type="button" className={actionButton} onClick={() => { setNotice(null); setShowPlans(true); }}><Sparkles size={16}/>{t.upgrade}</button><button type="button" className={actionButton} onClick={() => { setNotice(null); setShowRenew(true); }}><RefreshCw size={16}/>{t.renew}</button><button type="button" className={actionButton} onClick={() => { setNotice(null); setShowAdd(true); }}><HardDrive size={16}/>{t.addDevices}</button></div>

      <section className={`${panel} overflow-hidden !p-0`}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div className="flex items-center gap-2"><FileText size={18} className="text-[#c8ff00]"/><h2 className="font-semibold text-white">{t.paymentHistory}</h2></div><span className="text-xs text-zinc-500">{p.payments.length}</span></div>
        {p.payments.length === 0 ? <p className="px-5 py-10 text-center text-sm text-zinc-500">{t.noPayments}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-zinc-500"><tr>{[t.invoice,t.date,t.description,t.amount,t.status,t.actions].map((label) => <th key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800/80">{p.payments.map((row) => <tr key={row.id} className="transition hover:bg-white/[0.025]"><td className="px-5 py-4 font-medium text-zinc-100">{row.invoiceNo}</td><td className="px-5 py-4 text-zinc-400">{dateLabel(row.date)}</td><td className="px-5 py-4 text-zinc-300">{row.description}</td><td className="px-5 py-4 font-medium text-white">{money(row.amountRupees)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.status === "paid" ? "bg-emerald-500/10 text-emerald-400" : row.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-300"}`}>{statusLabel(row.status)}</span></td><td className="px-5 py-4"><button type="button" onClick={() => setInvoice(row)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-[#c8ff00]" title={t.download}><Download size={15}/>{t.download}</button></td></tr>)}</tbody></table></div>}
      </section>

      {showPlans && <Modal title={t.choosePlan} onClose={() => setShowPlans(false)}><p className="mb-4 text-sm text-zinc-400">{t.planChangeNote}</p><div className="grid gap-3 sm:grid-cols-3">{p.plans.map((pl) => { const current = pl.id === p.planId; return <article key={pl.id} className={`rounded-xl border p-4 ${current ? "border-[#c8ff00]/60 bg-[#c8ff00]/[0.06]" : "border-zinc-700 bg-black/20"}`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-white">{pl.name}</h3>{current && <Check size={16} className="text-[#c8ff00]"/>}</div><p className="mt-3 text-2xl font-semibold text-white">{money(pl.monthlyRupees)}<span className="text-xs font-normal text-zinc-500"> {t.month}</span></p><p className="mt-2 text-xs text-zinc-400">{pl.deviceLimit} {t.devicesIncluded}</p><button type="button" className={`${current ? actionButton : primaryButton} mt-5 w-full`} disabled={current || pending} onClick={() => setConfirmPlan(pl)}>{current ? t.currentPlan : <>{t.selectPlan}<ChevronRight size={15}/></>}</button></article>; })}</div><div className="mt-5 flex justify-end"><button type="button" className={actionButton} onClick={() => setShowPlans(false)}>{t.close}</button></div></Modal>}

      {confirmPlan && <Modal title={t.confirmPlan} onClose={() => setConfirmPlan(null)}><p className="text-sm text-zinc-300">{t.planConfirm} <strong className="text-[#c8ff00]">{confirmPlan.name}</strong>?</p><p className="mt-2 text-sm text-zinc-500">{money(confirmPlan.monthlyRupees)} {t.month} · {confirmPlan.deviceLimit} {t.devicesIncluded}</p><div className="mt-6 flex justify-end gap-2"><button type="button" className={actionButton} onClick={() => setConfirmPlan(null)}>{t.cancel}</button><button type="button" className={primaryButton} disabled={pending} onClick={() => run(() => changePlanAction(confirmPlan.id as PlanId), t.successPlan, () => { setConfirmPlan(null); setShowPlans(false); })}>{pending && <Loader2 size={15} className="animate-spin"/>}{pending ? t.loading : t.confirm}</button></div></Modal>}

      {showRenew && <Modal title={t.renewTitle} onClose={() => setShowRenew(false)}><div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4"><p className="text-sm leading-6 text-amber-100">{t.renewBody}</p></div><div className="mt-5 flex justify-end"><button type="button" className={actionButton} onClick={() => { setShowRenew(false); setNotice({ kind: "info", text: t.paymentUnavailable }); }}>{t.close}</button></div></Modal>}

      {showAdd && <Modal title={t.addTitle} onClose={() => setShowAdd(false)}><label className="block text-sm text-zinc-300">{t.extraDevices}<input type="number" min="1" max="100" value={addCount} onChange={(e) => setAddCount(e.target.value)} className="mt-2 block w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-white outline-none focus:border-[#c8ff00]"/></label><p className="mt-3 text-sm text-zinc-400">{t.newLimit}: <strong className="text-white">{p.deviceLimit + Math.max(0, Number(addCount) || 0)}</strong></p><div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4"><p className="text-sm leading-6 text-amber-100">{t.addBody}</p></div><div className="mt-5 flex justify-end"><button type="button" className={actionButton} onClick={() => { setShowAdd(false); setNotice({ kind: "info", text: t.paymentUnavailable }); }}>{t.close}</button></div></Modal>}
      {invoice && <Modal title={t.invoiceFor} onClose={() => setInvoice(null)}><p className="text-sm text-zinc-400">{invoice.invoiceNo} · {dateLabel(invoice.date)}</p><p className="mt-4 text-lg font-semibold text-white">{invoice.description}</p><p className="mt-2 text-2xl font-bold text-[#c8ff00]">{money(invoice.amountRupees)}</p><p className="mt-3 text-xs text-zinc-500">{t.generated}</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={actionButton} onClick={() => setInvoice(null)}>{t.close}</button><button type="button" className={primaryButton} onClick={() => downloadInvoice(invoice)}><Download size={15}/>{t.download}</button></div></Modal>}
    </div>
  );
}
