"use client";
import { useRef } from "react";
import { deletePotAction } from "@/server/modules/pots/pot-actions";

export function ConfirmDeletePot({ potId, name }: { potId: string; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400">Delete pot</button>
      <dialog ref={ref} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-200 backdrop:bg-black/60">
        <p className="mb-1 font-semibold">Delete “{name}”?</p>
        <p className="mb-4 text-xs text-zinc-400">It must have a zero balance. Its history is kept.</p>
        <form action={deletePotAction} className="flex justify-end gap-2">
          <input type="hidden" name="potId" value={potId} />
          <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs">Cancel</button>
          <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white">Delete</button>
        </form>
      </dialog>
    </>
  );
}