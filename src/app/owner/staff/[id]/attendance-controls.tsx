"use client";

import { useState, useTransition } from "react";
import { correctAttendanceAction, checkInAction, checkOutAction, type StaffActionResult } from "../actions";

const input =
  "w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 focus:border-[#d7fe3b] focus:outline-none [color-scheme:dark]";
const primary =
  "min-h-10 rounded-lg bg-[#d7fe3b] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50";
const secondary =
  "min-h-10 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-[#d7fe3b] hover:text-[#d7fe3b] disabled:opacity-50";

export function AttendanceControls({
  staffId,
  today,
  checkedIn,
  checkedOut,
  active,
}: {
  staffId: string;
  today: string;
  checkedIn: boolean;
  checkedOut: boolean;
  active: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<StaffActionResult>, message: string) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await fn();
      if (res.ok) setDone(message);
      else setError(res.error);
    });
  }

  function onCorrect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    run(
      () =>
        correctAttendanceAction(staffId, {
          date: String(fd.get("date") ?? ""),
          checkIn: String(fd.get("checkIn") ?? ""),
          checkOut: String(fd.get("checkOut") ?? ""),
          reason: String(fd.get("reason") ?? ""),
        }),
      "Attendance corrected and logged.",
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          disabled={pending || !active || checkedIn}
          onClick={() => run(() => checkInAction(staffId), "Checked in.")}
        >
          Check in now
        </button>
        <button
          type="button"
          className={secondary}
          disabled={pending || !active || !checkedIn || checkedOut}
          onClick={() => run(() => checkOutAction(staffId), "Checked out.")}
        >
          Check out now
        </button>
      </div>

      <details className="rounded-lg border border-zinc-800 p-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">
          Correct a day (owner / manager)
        </summary>
        <form onSubmit={onCorrect} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Date</span>
            <input name="date" type="date" required max={today} defaultValue={today} className={input} />
          </label>
          <span className="hidden sm:block" />
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Check-in (blank = none)</span>
            <input name="checkIn" type="time" className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Check-out (blank = none)</span>
            <input name="checkOut" type="time" className={input} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-zinc-400">Reason (required, kept in the audit log)</span>
            <input name="reason" required minLength={3} maxLength={200} className={input} placeholder="e.g. Forgot to check out" />
          </label>
          <div className="sm:col-span-2">
            <button className={primary} disabled={pending || !active}>
              Save correction
            </button>
          </div>
        </form>
      </details>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-[#d7fe3b]">
          {done}
        </p>
      )}
    </div>
  );
}
