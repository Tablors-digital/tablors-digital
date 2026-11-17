"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Pencil } from "lucide-react";
import { checkInAction, checkOutAction, correctAttendanceAction } from "../actions";

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#d7fe3b] focus:outline-none [color-scheme:dark]";

/** Check in / Check out for today. The server blocks duplicates and invalid check-outs. */
export function PunchButtons({ staffId, state }: { staffId: string; state: "can_in" | "can_out" | "done" | "blocked" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (state === "blocked") return null;
  const go = (fn: typeof checkInAction) =>
    startTransition(async () => {
      const res = await fn(staffId);
      setError(res.ok ? null : res.error);
    });
  return (
    <div className="space-y-1">
      {state === "can_in" && (
        <button type="button" disabled={pending} onClick={() => go(checkInAction)} className="inline-flex items-center gap-2 rounded-lg bg-[#d7fe3b] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60">
          <LogIn className="h-4 w-4" /> Check in
        </button>
      )}
      {state === "can_out" && (
        <button type="button" disabled={pending} onClick={() => go(checkOutAction)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-400 disabled:opacity-60">
          <LogOut className="h-4 w-4" /> Check out
        </button>
      )}
      {state === "done" && <span className="text-xs text-zinc-500">Today is complete.</span>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Owner / manager correction. Old values, who changed them and the reason are kept on the record. */
export function CorrectButton({ staffId, date, checkIn, checkOut, today, label }: {
  staffId: string; date?: string; checkIn?: string; checkOut?: string; today: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      date: String(fd.get("date") ?? ""),
      checkIn: String(fd.get("checkIn") ?? ""),
      checkOut: String(fd.get("checkOut") ?? ""),
      reason: String(fd.get("reason") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const res = await correctAttendanceAction(staffId, input);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-[#d7fe3b]">
        <Pencil className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="correct-title">
          <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
            <h2 id="correct-title" className="text-lg font-semibold text-zinc-50">Correct attendance</h2>
            <label className="block space-y-1.5"><span className="text-xs font-medium text-zinc-400">Date</span>
              <input name="date" type="date" required max={today} defaultValue={date ?? today} className={inputClass} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5"><span className="text-xs font-medium text-zinc-400">Check-in</span>
                <input name="checkIn" type="time" defaultValue={checkIn ?? ""} className={inputClass} /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-zinc-400">Check-out</span>
                <input name="checkOut" type="time" defaultValue={checkOut ?? ""} className={inputClass} /></label>
            </div>
            <label className="block space-y-1.5"><span className="text-xs font-medium text-zinc-400">Reason (required)</span>
              <input name="reason" required minLength={3} maxLength={200} className={inputClass} placeholder="e.g. forgot to check out" /></label>
            <p className="text-[11px] text-zinc-500">Leave both times empty to clear the day. Times are India time.</p>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">Cancel</button>
              <button type="submit" disabled={pending} className="rounded-lg bg-[#d7fe3b] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60">{pending ? "Saving..." : "Save correction"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
