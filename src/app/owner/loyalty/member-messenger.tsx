"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Gift, Loader2, MessageSquare, Percent, Search, Send, Users, X } from "lucide-react";

import { SubmitOnceButton } from "@/components/ui/submit-once-button";
import { adjustPointsAction, setCustomerStatusAction } from "./points-actions";
import { sendMemberMessageAction, type MessageState } from "./message-actions";
import {
  getMemberDetailsAction,
  searchMembersAction,
  type MemberDetails,
} from "./member-details-action";

export type MemberRow = {
  id: string;
  /** Already masked on the server, e.g. 98******10. Full numbers never reach the browser. */
  maskedPhone: string;
  balance: number;
  status: string;
  /** ISO date the member joined. */
  joined: string;
};

const MAX = 100; // keep in step with MAX_RECIPIENTS_PER_SEND on the server
const LIMIT = 300;
const idle: MessageState = { status: "idle" };

const TEMPLATES = [
  {
    key: "offer",
    label: "Offer Template",
    icon: Gift,
    text: "Thank you for visiting! Show this message on your next visit and enjoy a special offer.",
  },
  {
    key: "discount",
    label: "Discount Template",
    icon: Percent,
    text: "Enjoy 10% off your next bill. Valid this week only. See you soon!",
  },
];

const TYPE_LABEL: Record<string, string> = {
  EARN: "Earned",
  REDEEM: "Redeemed",
  REFUND_REVERSAL: "Reversed",
  EXPIRE: "Expired",
  ADJUST: "Adjusted",
};

const fmt = (n: number) => n.toLocaleString("en-IN");
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

const inputCls =
  "h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-[#d7fe3b]";
const ghostBtn =
  "inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500 disabled:opacity-50";

function StatusDot({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        active ? "border-[#d7fe3b]/40 text-[#d7fe3b]" : "border-red-500/40 text-red-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#d7fe3b]" : "bg-red-400"}`} />
      {active ? "Active" : "Blocked"}
    </span>
  );
}

function MemberDrawer({
  member,
  isOwner,
  onClose,
}: {
  member: MemberRow;
  isOwner: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<MemberDetails | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    getMemberDetailsAction(member.id)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ ok: false, error: "Couldn't load this member. Please try again." }));
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const stat = (name: string, value: number, tone = "text-white") => (
    <div className="rounded-xl bg-zinc-900/70 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{name}</p>
      <p className={`text-xl font-semibold ${tone}`}>{fmt(value)}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close details" className="hidden flex-1 sm:block" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-mono text-lg font-semibold tracking-wider text-white">{member.maskedPhone}</h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <StatusDot status={member.status} />
              <span>Joined {new Date(member.joined).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {data === null ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading member…
          </p>
        ) : !data.ok ? (
          <p className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{data.error}</p>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-[#d7fe3b]/30 bg-[#d7fe3b]/5 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Available balance</p>
              <p className="text-3xl font-bold text-[#d7fe3b]">{fmt(data.available)} <span className="text-sm font-normal text-zinc-400">points</span></p>
              {data.onHold > 0 && <p className="text-xs text-zinc-500">{fmt(data.onHold)} on hold for an open bill</p>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {stat("Earned", data.earned, "text-[#d7fe3b]")}
              {stat("Redeemed", data.redeemed)}
              {stat("Reversed", data.reversed)}
              {stat("Expired / adjusted", data.expired + Math.abs(data.adjusted))}
            </div>

            {isOwner && (
              <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
                <form action={adjustPointsAction} className="space-y-2">
                  <input type="hidden" name="customerId" value={member.id} />
                  <input type="hidden" name="requestId" value={requestId} />
                  <p className="text-xs font-medium text-zinc-300">Adjust points</p>
                  <div className="grid grid-cols-[96px_1fr] gap-2">
                    <input name="points" type="number" step={1} required placeholder="± pts" className={inputCls} />
                    <input name="reason" required minLength={3} maxLength={200} placeholder="Reason (required)" className={inputCls} />
                  </div>
                  <SubmitOnceButton className={ghostBtn} pendingLabel="Saving…">
                    Apply adjustment
                  </SubmitOnceButton>
                </form>
                <form action={setCustomerStatusAction}>
                  <input type="hidden" name="customerId" value={member.id} />
                  <input type="hidden" name="status" value={member.status === "active" ? "blocked" : "active"} />
                  <SubmitOnceButton className={ghostBtn} pendingLabel="Updating…">
                    {member.status === "active" ? "Block account" : "Unblock account"}
                  </SubmitOnceButton>
                </form>
              </div>
            )}

            <h4 className="mt-5 text-sm font-semibold text-white">Points history</h4>
            {data.history.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">
                No points activity yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-900">
                {data.history.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-zinc-200">{TYPE_LABEL[t.type] ?? t.type}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {when(t.at)}
                        {t.reason ? ` · ${t.reason}` : ""}
                        {t.ref ? ` · ${t.ref}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 font-semibold ${t.points < 0 ? "text-red-300" : "text-[#d7fe3b]"}`}>
                      {t.points > 0 ? `+${t.points}` : t.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SendButton({ disabled, count }: { disabled: boolean; count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#d7fe3b] px-5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {pending ? "Sending…" : count > 0 ? `Send to ${count}` : "Send"}
    </button>
  );
}

/**
 * Members list (search, selection, details) and Offer Messaging. They share
 * one selection: tick members above, write or pick a template below.
 * Numbers are masked; a typed number is matched on the server.
 */
export function MemberMessenger({
  members,
  isOwner,
  initialCustomerId,
}: {
  members: MemberRow[];
  isOwner: boolean;
  initialCustomerId?: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [serverIds, setServerIds] = useState<Set<string> | null>(null);
  const [searching, startSearch] = useTransition();
  const [openId, setOpenId] = useState<string | null>(
    initialCustomerId && members.some((m) => m.id === initialCustomerId) ? initialCustomerId : null,
  );
  const [state, formAction] = useActionState(sendMemberMessageAction, idle);
  const searchSeq = useRef(0);

  // Typed numbers are matched on the server (debounced); only ids come back.
  useEffect(() => {
    const digits = query.replace(/\D/g, "");
    // Under 2 digits the server result is ignored by the filter below.
    if (digits.length < 2) return;
    const seq = ++searchSeq.current;
    const t = setTimeout(() => {
      startSearch(async () => {
        const res = await searchMembersAction(query);
        if (seq === searchSeq.current) setServerIds(res.ok ? new Set(res.ids) : null);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = query.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const filtered = members.filter((m) => {
    if (!q) return true;
    if (digits.length >= 2 && serverIds) return serverIds.has(m.id);
    return m.maskedPhone.includes(q) || m.status.includes(q);
  });

  const selectable = filtered.filter((m) => m.status === "active");
  const allSelected = selectable.length > 0 && selectable.every((m) => selected.has(m.id));
  const tooMany = selected.size > MAX;
  const open = members.find((m) => m.id === openId) ?? null;
  const selectedMembers = members.filter((m) => selected.has(m.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectable.forEach((m) => next.delete(m.id));
      else selectable.forEach((m) => next.add(m.id));
      return next;
    });

  return (
    <>
      {/* ---------------- Members ---------------- */}
      <section id="members" className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Users className="h-5 w-5 text-[#d7fe3b]" /> Members
            <span className="text-xs font-normal text-zinc-500">{members.length}</span>
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by mobile number"
              aria-label="Search members"
              className={`${inputCls} pl-9 pr-9`}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />}
          </div>
        </div>

        {members.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-300">No members yet</p>
            <p className="mt-1 text-xs text-zinc-500">They appear when a customer enters a mobile number on their bill.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
            {searching ? "Searching…" : `No members match “${query}”.`}
          </p>
        ) : (
          <div className="mt-4 max-h-[26rem] overflow-auto rounded-xl border border-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all members"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={selectable.length === 0}
                      className="h-4 w-4 accent-[#d7fe3b]"
                    />
                  </th>
                  <th className="px-2 py-2.5 font-medium">Mobile</th>
                  <th className="px-2 py-2.5 text-right font-medium">Points</th>
                  <th className="px-2 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const on = selected.has(m.id);
                  const blocked = m.status !== "active";
                  return (
                    <tr key={m.id} className={`border-b border-zinc-900 last:border-0 ${on ? "bg-[#d7fe3b]/5" : "hover:bg-zinc-900/40"}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select member ${m.maskedPhone}`}
                          checked={on}
                          disabled={blocked}
                          onChange={() => toggle(m.id)}
                          className="h-4 w-4 accent-[#d7fe3b] disabled:opacity-30"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => setOpenId(m.id)}
                          className="font-mono tracking-wider text-zinc-100 hover:text-[#d7fe3b]"
                        >
                          {m.maskedPhone}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold text-zinc-100">{fmt(m.balance)}</td>
                      <td className="px-2 py-2.5">
                        <StatusDot status={m.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" onClick={() => setOpenId(m.id)} className="text-xs text-[#d7fe3b] hover:underline">
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {members.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            {selected.size} selected · numbers are partly hidden for privacy
          </p>
        )}
      </section>

      {/* ---------------- Offer messaging ---------------- */}
      <section id="messaging" className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <MessageSquare className="h-5 w-5 text-[#d7fe3b]" /> Offer Messaging
        </h2>
        <p className="mt-1 text-xs text-zinc-500">Sends to the members ticked above. Blocked members are skipped.</p>

        <form action={formAction} className="mt-4 space-y-3">
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="memberId" value={id} />
          ))}

          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map(({ key, label, icon: Icon, text }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMessage(text)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
                  message === text
                    ? "border-[#d7fe3b] bg-[#d7fe3b]/10 text-[#d7fe3b]"
                    : "border-zinc-700 text-zinc-200 hover:border-zinc-500"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, LIMIT))}
            rows={4}
            placeholder="Type a custom message, or pick a template above…"
            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-[#d7fe3b]"
          />

          <div className="flex flex-wrap items-center gap-2">
            {selectedMembers.length === 0 ? (
              <span className="text-xs text-zinc-500">No members selected yet.</span>
            ) : (
              <>
                {selectedMembers.slice(0, 6).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    title="Remove"
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-red-500/60"
                  >
                    {m.maskedPhone} <X className="h-3 w-3" />
                  </button>
                ))}
                {selectedMembers.length > 6 && <span className="text-xs text-zinc-500">+{selectedMembers.length - 6} more</span>}
                <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 underline hover:text-white">
                  Clear
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">
              {message.length}/{LIMIT} · up to {MAX} members per send
            </span>
            <SendButton disabled={selected.size === 0 || tooMany || message.trim().length < 5} count={selected.size} />
          </div>

          {tooMany && <p className="text-xs text-red-300">Select {MAX} members or fewer for one send.</p>}
          {state.status !== "idle" && (
            <p
              role="status"
              className={`rounded-lg border px-3 py-2 text-sm ${
                state.status === "ok"
                  ? "border-[#d7fe3b]/40 bg-[#d7fe3b]/10 text-[#d7fe3b]"
                  : "border-red-500/40 bg-red-500/10 text-red-300"
              }`}
            >
              {state.text}
            </p>
          )}
        </form>
      </section>

      {open && <MemberDrawer key={`${open.id}-${open.balance}-${open.status}`} member={open} isOwner={isOwner} onClose={() => setOpenId(null)} />}
    </>
  );
}
