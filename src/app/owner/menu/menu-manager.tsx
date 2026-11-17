"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Plus, SlidersHorizontal, X } from "lucide-react";
import type { MenuItem } from "@/server/modules/demo-store/store";
import {
  deleteMenuItemAction,
  toggleItemAvailability,
} from "@/server/modules/menu/actions";
import { computeMenuStats } from "@/lib/menu-shared";
import { MenuItemForm } from "./menu-item-form";
import { MenuSummary, type StatusFilter } from "./menu-summary";
import { CategoryChips } from "./menu-categories";
import { MenuToolbar, type DietFilter, type ViewMode } from "./menu-toolbar";
import { ItemsGrid, ItemsList, ItemsTable, type ItemHandlers } from "./menu-items-view";

type Notice = { kind: "success" | "error"; text: string };

type FormState = {
  /** the item being edited; null = a new item */
  item: MenuItem | null;
  /** set when duplicating: the new item is pre-filled from this one */
  duplicateOf?: MenuItem;
} | null;

const addButtonClass =
  "inline-flex items-center gap-2 rounded-xl bg-[var(--color-radium-500)] px-4 py-2.5 text-sm font-semibold text-[#05120a] shadow-[0_0_24px_-6px_rgba(57,255,106,0.6)] transition-colors hover:bg-[var(--color-radium-600)]";

export function MenuManager({
  items,
  usage,
  initialCategory,
}: {
  items: MenuItem[];
  /** MenuItem.id → number of historical order lines that reference it */
  usage: Record<string, number>;
  initialCategory: string | null;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory ?? "all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [diet, setDiet] = useState<DietFilter>("all");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [view, setView] = useState<ViewMode>("list");

  const [form, setForm] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Availability flips instantly in the UI (rows, filters and counts); the server
  // action then persists it and revalidates, and the real data replaces this.
  const [menu, applyOptimistic] = useOptimistic(
    items,
    (current: MenuItem[], patch: { id: string; available: boolean }) =>
      current.map((i) => (i.id === patch.id ? { ...i, available: patch.available } : i)),
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const stats = useMemo(() => computeMenuStats(menu), [menu]);


  const filtersActive =
    search.trim() !== "" || category !== "all" || status !== "all" || diet !== "all" || specialOnly;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (status === "available" && !item.available) return false;
      if (status === "unavailable" && item.available) return false;
      if (diet === "veg" && !item.veg) return false;
      if (diet === "non-veg" && item.veg) return false;
      if (specialOnly && !item.isSpecial) return false;
      if (q) {
        return (
          item.name.toLowerCase().includes(q) ||
          item.code.includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [menu, search, category, status, diet, specialOnly]);

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setDiet("all");
    setSpecialOnly(false);
  }

  function toggleAvailability(item: MenuItem) {
    const next = !item.available;
    setTogglingId(item.id);
    startTransition(async () => {
      applyOptimistic({ id: item.id, available: next });
      try {
        // The one existing availability path: it updates the shared menu, raises/
        // resolves the "item unavailable" alert and revalidates every menu surface.
        // Table devices pick the change up from their next state poll.
        const result = await toggleItemAvailability(item.code, next);
        setNotice(
          result.ok
            ? {
                kind: "success",
                text: `${item.name} is now ${next ? "available" : "unavailable"} — table devices update within seconds.`,
              }
            : { kind: "error", text: result.error },
        );
      } catch {
        setNotice({ kind: "error", text: "Couldn't update availability. Please try again." });
      } finally {
        setTogglingId(null);
      }
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteMenuItemAction(deleteTarget.id);
      setNotice(
        result.ok
          ? { kind: "success", text: result.message }
          : { kind: "error", text: result.error },
      );
    } catch {
      setNotice({ kind: "error", text: "Couldn't delete the item. Please try again." });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const handlers: ItemHandlers = {
    onToggle: toggleAvailability,
    onEdit: (item) => setForm({ item }),
    onDuplicate: (item) => setForm({ item: null, duplicateOf: item }),
    onDelete: setDeleteTarget,
    togglingId,
  };

  const isEmpty = menu.length === 0;
  const formKey = form ? (form.item?.id ?? (form.duplicateOf ? `dup-${form.duplicateOf.id}` : "new")) : "";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Page header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
            Menu
          </h1>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-radium-500)]"
            />
            Synced with table devices
          </p>
        </div>
        <button type="button" onClick={() => setForm({ item: null })} className={addButtonClass}>
          <Plus className="h-4 w-4" />
          Add item
        </button>
      </header>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mm-pop fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur ${
            notice.kind === "error"
              ? "border-[var(--color-danger)]/40 bg-[var(--color-surface-1)]/95 text-[var(--color-danger)]"
              : "border-[var(--color-radium-500)]/40 bg-[var(--color-surface-1)]/95 text-[var(--color-radium-500)]"
          }`}
        >
          {notice.kind === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
          <SlidersHorizontal className="mx-auto h-5 w-5 text-[var(--color-gold-500)]" />
          <p className="mt-3 text-sm text-[var(--color-text-primary)]">Your menu is empty.</p>
          <button type="button" onClick={() => setForm({ item: null })} className={`${addButtonClass} mt-4`}>
            <Plus className="h-4 w-4" />
            Add item
          </button>
        </div>
      ) : (
        <>
                    <MenuSummary stats={stats} status={status} onStatusChange={setStatus} />

          <MenuToolbar
            search={search}
            onSearch={setSearch}
            status={status}
            onStatus={setStatus}
            diet={diet}
            onDiet={setDiet}
            specialOnly={specialOnly}
            onSpecialOnly={setSpecialOnly}
            view={view}
            onView={setView}
            filtersActive={filtersActive}
            onClear={clearFilters}
            shown={visible.length}
            total={menu.length}
          />

          <CategoryChips stats={stats} active={category} onSelect={setCategory} />

          {initialCategory && category === initialCategory && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Showing category from link.{" "}
              <Link href="/owner/menu" className="underline underline-offset-2">
                Reset
              </Link>
            </p>
          )}

          {visible.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] px-4 py-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">No menu items found.</p>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 text-sm text-[var(--color-gold-500)] underline underline-offset-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === "grid" ? (
            <ItemsGrid items={visible} handlers={handlers} />
          ) : (
            <>
              <ItemsTable items={visible} handlers={handlers} />
              <ItemsList items={visible} handlers={handlers} />
            </>
          )}
        </>
      )}

      {form && (
        <MenuItemForm
          // remount when switching between items so state never leaks
          key={formKey}
          item={form.item}
          duplicateOf={form.duplicateOf ?? null}
          defaultCategory={category !== "all" ? category : undefined}
          allItems={menu}
          onClose={() => setForm(null)}
          onSaved={(text) => {
            setForm(null);
            setNotice({ kind: "success", text });
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel delete"
            onClick={() => !deleting && setDeleteTarget(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-desc"
            className="mm-pop relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)] sm:p-6"
          >
            <h2 id="delete-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
              Delete this menu item?
            </h2>
            <div id="delete-desc" className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>
                <span className="text-[var(--color-text-primary)]">
                  {deleteTarget.code} · {deleteTarget.name}
                </span>{" "}
                will be removed from the menu on every table device.
              </p>
              <p>Existing historical orders will remain unchanged.</p>
              {(usage[deleteTarget.id] ?? 0) > 0 && (
                <p className="text-[var(--color-text-muted)]">
                  This item appears in {usage[deleteTarget.id]} past order line
                  {usage[deleteTarget.id] === 1 ? "" : "s"}, so it will be archived (hidden and
                  un-orderable) rather than erased, and its code becomes free to reuse.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                autoFocus
                className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:border-[var(--color-gold-500)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-xl bg-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-[#1a0505] hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
