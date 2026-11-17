"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarClock,
  Check,
  Copy,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import {
  createOfferAction,
  deleteOfferAction,
  duplicateOfferAction,
  toggleOfferAction,
  updateOfferAction,
  type OfferActionResult,
} from "@/server/modules/offers/actions";
import {
  OFFER_DESCRIPTION_MAX,
  OFFER_NAME_MAX,
  OFFER_TYPES,
  getOfferStatus,
  normaliseOfferDraft,
  offerTypeLabel,
  offerValueLabel,
  validateOfferDraft,
  type Offer,
  type OfferDraft,
  type OfferStatus,
  type OfferTargetType,
  type OfferType,
} from "@/lib/offers-shared";

// ---- props ----------------------------------------------------------------

export type OfferMenuItem = {
  id: string;
  name: string;
  category: string;
  /** What a customer pays now (list price net of any menu discount). */
  effectivePriceRupees: number;
};

type Props = {
  offers: Offer[];
  menu: OfferMenuItem[];
  /** Offer id -> number of bills it was applied to. */
  usage: Record<string, number>;
  /** Server clock when the page was rendered (ms). */
  serverNow: number;
};

// ---- small helpers ----------------------------------------------------------

type FormState = {
  name: string;
  description: string;
  type: OfferType;
  targetType: OfferTargetType;
  targetItemId: string;
  targetCategory: string;
  fixedPriceRupees: string;
  percentagePercent: string;
  fixedDiscountRupees: string;
  buyQuantity: string;
  freeQuantity: string;
  minimumOrderRupees: string;
  startsAt: string; // datetime-local value
  endsAt: string;
  active: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** ms -> value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number {
  if (!value) return Number.NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

const DAY = 24 * 60 * 60 * 1000;

function emptyForm(now: number): FormState {
  const start = Math.floor(now / 60000) * 60000;
  return {
    name: "",
    description: "",
    type: "percentage",
    targetType: "item",
    targetItemId: "",
    targetCategory: "",
    fixedPriceRupees: "",
    percentagePercent: "",
    fixedDiscountRupees: "",
    buyQuantity: "",
    freeQuantity: "",
    minimumOrderRupees: "",
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(start + 7 * DAY),
    active: true,
  };
}

function formFromOffer(o: Offer): FormState {
  const s = (n: number | null) => (n === null || n === undefined ? "" : String(n));
  return {
    name: o.name,
    description: o.description,
    type: o.type,
    targetType: o.targetType,
    targetItemId: o.targetItemId ?? "",
    targetCategory: o.targetCategory ?? "",
    fixedPriceRupees: s(o.fixedPriceRupees),
    percentagePercent: s(o.percentagePercent),
    fixedDiscountRupees: s(o.fixedDiscountRupees),
    buyQuantity: s(o.buyQuantity),
    freeQuantity: s(o.freeQuantity),
    minimumOrderRupees: s(o.minimumOrderRupees),
    startsAt: toLocalInput(o.startsAt),
    endsAt: toLocalInput(o.endsAt),
    active: o.active,
  };
}

function num(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Form text -> the draft the shared validator (and the server) understands. */
function toDraft(f: FormState): OfferDraft {
  const orNull = (t: string) => {
    const n = num(t);
    return n === null || Number.isNaN(n) ? (t.trim() === "" ? null : Number.NaN) : n;
  };
  return {
    name: f.name,
    description: f.description,
    type: f.type,
    targetType: f.targetType,
    targetItemId: f.targetItemId || null,
    targetCategory: f.targetCategory || null,
    fixedPriceRupees: orNull(f.fixedPriceRupees),
    percentagePercent: orNull(f.percentagePercent),
    fixedDiscountRupees: orNull(f.fixedDiscountRupees),
    buyQuantity: orNull(f.buyQuantity),
    freeQuantity: orNull(f.freeQuantity),
    minimumOrderRupees: orNull(f.minimumOrderRupees),
    startsAt: fromLocalInput(f.startsAt),
    endsAt: fromLocalInput(f.endsAt),
    active: f.active,
  };
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (ms: number) => dateFmt.format(ms);

function relative(ms: number): string {
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return "less than a minute";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const STATUS_STYLE: Record<OfferStatus, { label: string; cls: string; dot: string }> = {
  active: { label: "Active", cls: "bg-[#D7FE3B]/12 text-[#D7FE3B] ring-1 ring-[#D7FE3B]/30", dot: "bg-[#D7FE3B]" },
  scheduled: { label: "Scheduled", cls: "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/25", dot: "bg-sky-300" },
  expired: { label: "Expired", cls: "bg-zinc-700/30 text-zinc-400 ring-1 ring-zinc-600/40", dot: "bg-zinc-500" },
  paused: { label: "Paused", cls: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/25", dot: "bg-amber-300" },
};

type StatusFilter = "all" | OfferStatus;
type SortKey = "newest" | "ending" | "name" | "used";

const FIELD =
  "w-full rounded-xl border border-[#23251F] bg-[#0D0E0B] px-3.5 py-2.5 text-sm text-[#F2F3EC] outline-none transition placeholder:text-[#5B5F52] focus:border-[#D7FE3B] focus:ring-1 focus:ring-[#D7FE3B]/40 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-[#E4E6DB]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-[#7E8276]">{hint}</p>}
    </div>
  );
}

// ---- component ---------------------------------------------------------------

export function OffersManager({ offers, menu, usage, serverNow }: Props) {
  const [now, setNow] = useState(serverNow);
  const [form, setForm] = useState<FormState>(() => emptyForm(serverNow));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const formRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Statuses follow the clock: an offer flips to Active / Expired on its own.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // The server page re-renders every few seconds; keep the clock in step with it.
  useEffect(() => {
    setNow((prev) => Math.max(prev, serverNow));
  }, [serverNow]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === "error" ? 6000 : 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  // ---- derived data ----------------------------------------------------------

  const categories = useMemo(() => Array.from(new Set(menu.map((m) => m.category))), [menu]);

  const itemsByCategory = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: menu.filter((m) => m.category === category),
      })),
    [categories, menu],
  );

  const targetLabel = useCallback(
    (offer: Offer) => {
      if (offer.targetType === "order") return `Orders of ₹${offer.minimumOrderRupees ?? 0}+`;
      if (offer.targetType === "category") return offer.targetCategory ?? "Category";
      return menu.find((m) => m.id === offer.targetItemId)?.name ?? "Menu item (removed)";
    },
    [menu],
  );

  const rows = useMemo(
    () =>
      offers.map((offer) => ({
        offer,
        status: getOfferStatus(offer, now),
        used: usage[offer.id] ?? 0,
        target: targetLabel(offer),
        value: offerValueLabel(offer),
      })),
    [offers, now, usage, targetLabel],
  );

  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, scheduled: 0, expired: 0, paused: 0, used: 0 };
    for (const r of rows) {
      c[r.status] += 1;
      c.used += r.used;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.offer.name, r.offer.description, r.target, r.value, offerTypeLabel(r.offer.type), STATUS_STYLE[r.status].label]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => b.offer.createdAt - a.offer.createdAt);
    if (sort === "ending") {
      // Live and upcoming first (soonest end), expired last.
      const rank = (s: OfferStatus) => (s === "expired" ? 1 : 0);
      sorted.sort((a, b) => rank(a.status) - rank(b.status) || a.offer.endsAt - b.offer.endsAt);
    }
    if (sort === "name") sorted.sort((a, b) => a.offer.name.localeCompare(b.offer.name));
    if (sort === "used") sorted.sort((a, b) => b.used - a.used || a.offer.name.localeCompare(b.offer.name));
    return sorted;
  }, [rows, filter, query, sort]);

  // ---- form validation (instant feedback; the server re-checks everything) -----

  const draft = useMemo(() => toDraft(form), [form]);
  const clientError = useMemo(
    () =>
      validateOfferDraft(draft, {
        now,
        // Only demand a future end time when it is a new offer or the dates were changed.
        requireFutureEnd: (() => {
          if (!editingId) return true;
          const existing = offers.find((o) => o.id === editingId);
          return !existing || draft.startsAt !== existing.startsAt || draft.endsAt !== existing.endsAt;
        })(),
        itemPriceRupees: (id) => menu.find((m) => m.id === id)?.effectivePriceRupees ?? null,
        categoryMinPriceRupees: (category) => {
          const prices = menu.filter((m) => m.category === category).map((m) => m.effectivePriceRupees);
          return prices.length ? Math.min(...prices) : null;
        },
      }),
    [draft, now, editingId, offers, menu],
  );

  const selectedItem = menu.find((m) => m.id === form.targetItemId) ?? null;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeType(type: OfferType) {
    setFormError(null);
    setForm((prev) => ({
      ...prev,
      type,
      // Fixed price / Buy X Get Y cannot apply to a whole order.
      targetType: (type === "fixed_price" || type === "buy_x_get_y") && prev.targetType === "order" ? "item" : prev.targetType,
    }));
  }

  function setDuration(days: number) {
    const start = fromLocalInput(form.startsAt);
    const base = Number.isFinite(start) ? start : now;
    setFormError(null);
    setForm((prev) => ({ ...prev, endsAt: toLocalInput(base + days * DAY) }));
  }

  function startNow() {
    const start = Math.floor(Date.now() / 60000) * 60000;
    const oldStart = fromLocalInput(form.startsAt);
    const oldEnd = fromLocalInput(form.endsAt);
    const length = Number.isFinite(oldStart) && Number.isFinite(oldEnd) && oldEnd > oldStart ? oldEnd - oldStart : 7 * DAY;
    setFormError(null);
    setForm((prev) => ({ ...prev, startsAt: toLocalInput(start), endsAt: toLocalInput(start + length) }));
  }

  function resetForm() {
    setEditingId(null);
    setShowErrors(false);
    setFormError(null);
    setForm(emptyForm(Date.now()));
  }

  function beginEdit(offer: Offer) {
    setEditingId(offer.id);
    setShowErrors(false);
    setFormError(null);
    setForm(formFromOffer(offer));
    setConfirmDeleteId(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 350);
  }

  // ---- server calls ------------------------------------------------------------

  function report(result: OfferActionResult) {
    setToast({ kind: result.ok ? "success" : "error", message: result.message });
  }

  function run(key: string, call: () => Promise<OfferActionResult>, after?: (r: OfferActionResult) => void) {
    if (busyKey) return;
    setBusyKey(key);
    startTransition(async () => {
      try {
        const result = await call();
        report(result);
        after?.(result);
      } catch (error) {
        console.error("Offer action failed", error);
        setToast({ kind: "error", message: "Something went wrong. Please try again." });
      } finally {
        setBusyKey(null);
      }
    });
  }

  function buildFormData(): FormData {
    const d = normaliseOfferDraft(toDraft(form));
    const fd = new FormData();
    fd.set("name", d.name);
    fd.set("description", d.description);
    fd.set("type", d.type);
    fd.set("targetType", d.targetType);
    fd.set("targetItemId", d.targetItemId ?? "");
    fd.set("targetCategory", d.targetCategory ?? "");
    fd.set("fixedPriceRupees", d.fixedPriceRupees === null ? "" : String(d.fixedPriceRupees));
    fd.set("percentagePercent", d.percentagePercent === null ? "" : String(d.percentagePercent));
    fd.set("fixedDiscountRupees", d.fixedDiscountRupees === null ? "" : String(d.fixedDiscountRupees));
    fd.set("buyQuantity", d.buyQuantity === null ? "" : String(d.buyQuantity));
    fd.set("freeQuantity", d.freeQuantity === null ? "" : String(d.freeQuantity));
    fd.set("minimumOrderRupees", d.minimumOrderRupees === null ? "" : String(d.minimumOrderRupees));
    // Epoch milliseconds, converted in the browser so the owner's own time zone is used.
    fd.set("startsAt", String(d.startsAt));
    fd.set("endsAt", String(d.endsAt));
    fd.set("active", d.active ? "true" : "false");
    return fd;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyKey) return;
    setShowErrors(true);
    if (clientError) {
      setFormError(clientError);
      return;
    }
    setFormError(null);

    const id = editingId;
    const formData = buildFormData();
    run(
      id ? `save:${id}` : "create",
      () => (id ? updateOfferAction(id, formData) : createOfferAction(formData)),
      (result) => {
        if (result.ok) resetForm();
        else setFormError(result.message);
      },
    );
  }

  function onToggle(offer: Offer, active: boolean) {
    run(`toggle:${offer.id}`, () => toggleOfferAction(offer.id, active));
  }

  function onDuplicate(offer: Offer) {
    run(`dup:${offer.id}`, () => duplicateOfferAction(offer.id), (result) => {
      if (result.ok) {
        setFilter("all");
        setQuery("");
      }
    });
  }

  function onDelete(offer: Offer) {
    run(`del:${offer.id}`, () => deleteOfferAction(offer.id), (result) => {
      setConfirmDeleteId(null);
      if (result.ok && editingId === offer.id) resetForm();
    });
  }

  const isSaving = busyKey === "create" || (editingId !== null && busyKey === `save:${editingId}`);
  const editingOffer = editingId ? offers.find((o) => o.id === editingId) ?? null : null;
  const filtersActive = filter !== "all" || query.trim() !== "";
  const shownError = formError ?? (showErrors ? clientError : null);

  // ---- render ------------------------------------------------------------------

  const summary: { key: StatusFilter | "used"; label: string; value: number; note: string; tone: string }[] = [
    { key: "active", label: "Active", value: counts.active, note: "Live right now", tone: "text-[#D7FE3B]" },
    { key: "scheduled", label: "Scheduled", value: counts.scheduled, note: "Starting soon", tone: "text-sky-300" },
    { key: "expired", label: "Expired", value: counts.expired, note: "Past their end date", tone: "text-zinc-400" },
    { key: "used", label: "Offers used", value: counts.used, note: "Applied on bills", tone: "text-[#F2F3EC]" },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* SUMMARY */}
      <section aria-label="Offer summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summary.map((card) => {
          const selected = card.key === "used" ? sort === "used" : filter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                if (card.key === "used") setSort((s) => (s === "used" ? "newest" : "used"));
                else setFilter((f) => (f === card.key ? "all" : (card.key as StatusFilter)));
              }}
              aria-pressed={selected}
              title={card.key === "used" ? "Sort promotions by most used" : `Show ${card.label.toLowerCase()} offers`}
              className={`rounded-2xl border p-4 text-left transition sm:p-5 ${
                selected
                  ? "border-[#D7FE3B]/60 bg-[#1A1D10]"
                  : "border-[#23251F] bg-[#15170F] hover:border-[#3A3E2F]"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7E8276]">{card.label}</p>
              <p className={`mt-2 text-3xl font-semibold tabular-nums ${card.tone}`}>{card.value}</p>
              <p className="mt-1 text-xs text-[#7E8276]">{card.note}</p>
            </button>
          );
        })}
      </section>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:items-start">
        {/* CREATE / EDIT */}
        <section
          ref={formRef}
          aria-label={editingId ? "Edit offer" : "Create offer"}
          className="scroll-mt-4 rounded-2xl border border-[#23251F] bg-[#15170F] p-4 sm:p-5 md:p-6"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingId ? "Edit offer" : "Create offer"}</h2>
              <p className="mt-1 text-sm text-[#7E8276]">
                {editingId
                  ? `Changing “${editingOffer?.name ?? "offer"}”.`
                  : "Set the promotion rules and schedule."}
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 rounded-lg border border-[#23251F] px-2.5 py-1.5 text-xs text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B]"
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Offer name" htmlFor="offer-name">
              <input
                ref={nameRef}
                id="offer-name"
                value={form.name}
                maxLength={OFFER_NAME_MAX}
                onChange={(e) => patch("name", e.target.value)}
                placeholder="Chicken Biryani Special"
                className={FIELD}
                autoComplete="off"
              />
            </Field>

            <Field label="Description" htmlFor="offer-description">
              <textarea
                id="offer-description"
                rows={2}
                value={form.description}
                maxLength={OFFER_DESCRIPTION_MAX}
                onChange={(e) => patch("description", e.target.value)}
                placeholder="Limited-time dinner offer"
                className={`${FIELD} resize-none`}
              />
              <p className="mt-1 text-right text-[11px] text-[#5B5F52]">
                {form.description.length}/{OFFER_DESCRIPTION_MAX}
              </p>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="Offer type" htmlFor="offer-type">
                <select
                  id="offer-type"
                  value={form.type}
                  onChange={(e) => changeType(e.target.value as OfferType)}
                  className={FIELD}
                >
                  {OFFER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Applies to" htmlFor="offer-target">
                <select
                  id="offer-target"
                  value={form.targetType}
                  onChange={(e) => patch("targetType", e.target.value as OfferTargetType)}
                  className={FIELD}
                >
                  <option value="item">Menu item</option>
                  <option value="category">Category</option>
                  <option value="order" disabled={form.type === "fixed_price" || form.type === "buy_x_get_y"}>
                    Entire order
                  </option>
                </select>
              </Field>
            </div>

            {form.targetType === "item" && (
              <Field
                label="Menu item"
                htmlFor="offer-item"
                hint={selectedItem ? `Current price ₹${selectedItem.effectivePriceRupees}` : undefined}
              >
                <select
                  id="offer-item"
                  value={form.targetItemId}
                  onChange={(e) => patch("targetItemId", e.target.value)}
                  className={FIELD}
                >
                  <option value="">Select menu item</option>
                  {itemsByCategory.map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — ₹{item.effectivePriceRupees}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}

            {form.targetType === "category" && (
              <Field label="Category" htmlFor="offer-category">
                <select
                  id="offer-category"
                  value={form.targetCategory}
                  onChange={(e) => patch("targetCategory", e.target.value)}
                  className={FIELD}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Only the fields that belong to the chosen type are shown. */}
            {form.type === "fixed_price" && (
              <Field label="Promotional price ₹" htmlFor="offer-fixed-price" hint="Each unit sells at this price.">
                <input
                  id="offer-fixed-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.fixedPriceRupees}
                  onChange={(e) => patch("fixedPriceRupees", e.target.value)}
                  placeholder="220"
                  className={FIELD}
                />
              </Field>
            )}

            {form.type === "percentage" && (
              <Field label="Discount %" htmlFor="offer-percentage">
                <input
                  id="offer-percentage"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  value={form.percentagePercent}
                  onChange={(e) => patch("percentagePercent", e.target.value)}
                  placeholder="10"
                  className={FIELD}
                />
              </Field>
            )}

            {form.type === "fixed_discount" && (
              <Field
                label="Discount amount ₹"
                htmlFor="offer-fixed-discount"
                hint={
                  form.targetType === "order"
                    ? "Taken off the whole order once."
                    : "Taken off each unit of the item."
                }
              >
                <input
                  id="offer-fixed-discount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.fixedDiscountRupees}
                  onChange={(e) => patch("fixedDiscountRupees", e.target.value)}
                  placeholder="50"
                  className={FIELD}
                />
              </Field>
            )}

            {form.type === "buy_x_get_y" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Buy" htmlFor="offer-buy">
                  <input
                    id="offer-buy"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={form.buyQuantity}
                    onChange={(e) => patch("buyQuantity", e.target.value)}
                    placeholder="2"
                    className={FIELD}
                  />
                </Field>
                <Field label="Get free" htmlFor="offer-get">
                  <input
                    id="offer-get"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={form.freeQuantity}
                    onChange={(e) => patch("freeQuantity", e.target.value)}
                    placeholder="1"
                    className={FIELD}
                  />
                </Field>
              </div>
            )}

            <Field
              label={form.targetType === "order" ? "Minimum order ₹" : "Minimum order ₹ (optional)"}
              htmlFor="offer-min-order"
              hint={
                form.targetType === "order"
                  ? "The order subtotal needed before this offer applies."
                  : "Leave empty to apply on any order value."
              }
            >
              <input
                id="offer-min-order"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.minimumOrderRupees}
                onChange={(e) => patch("minimumOrderRupees", e.target.value)}
                placeholder="500"
                className={FIELD}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="Starts" htmlFor="offer-start">
                <input
                  id="offer-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => patch("startsAt", e.target.value)}
                  className={FIELD}
                />
              </Field>
              <Field label="Ends" htmlFor="offer-end">
                <input
                  id="offer-end"
                  type="datetime-local"
                  value={form.endsAt}
                  min={form.startsAt || undefined}
                  onChange={(e) => patch("endsAt", e.target.value)}
                  className={FIELD}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick dates">
              <button
                type="button"
                onClick={startNow}
                className="inline-flex items-center gap-1 rounded-full border border-[#23251F] px-2.5 py-1 text-xs text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B]"
              >
                <CalendarClock className="h-3 w-3" aria-hidden /> Start now
              </button>
              {[
                { label: "1 day", days: 1 },
                { label: "7 days", days: 7 },
                { label: "30 days", days: 30 },
              ].map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDuration(p.days)}
                  className="rounded-full border border-[#23251F] px-2.5 py-1 text-xs text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B]"
                >
                  Run {p.label}
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#23251F] bg-[#0D0E0B] px-3.5 py-3">
              <span>
                <span className="block text-sm font-medium text-[#E4E6DB]">Activate offer</span>
                <span className="block text-xs text-[#7E8276]">
                  Switched-off offers stay saved but are never shown or applied.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                aria-label="Activate offer"
                onClick={() => patch("active", !form.active)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${form.active ? "bg-[#D7FE3B]" : "bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#0D0E0B] transition-all ${form.active ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </label>

            {shownError && (
              <p role="alert" className="rounded-xl border border-[#E27468]/40 bg-[#E27468]/10 px-3.5 py-2.5 text-sm text-[#F0A198]">
                {shownError}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={isSaving || isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#D7FE3B] px-4 py-3 text-sm font-semibold text-[#0D0E0B] transition hover:bg-[#C4EC2A] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {editingId ? "Saving…" : "Creating…"}
                  </>
                ) : editingId ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden /> Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden /> Create offer
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={isSaving}
                className="rounded-xl border border-[#23251F] px-4 py-3 text-sm font-medium text-[#9DA194] transition hover:border-[#3A3E2F] hover:text-[#F2F3EC] disabled:opacity-50"
              >
                {editingId ? "Discard" : "Clear form"}
              </button>
            </div>
          </form>
        </section>

        {/* PROMOTIONS */}
        <section aria-label="Promotions" className="min-w-0">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Your promotions</h2>
                <p className="mt-1 text-sm text-[#7E8276]">
                  {filtersActive
                    ? `${visible.length} of ${rows.length} offer${rows.length === 1 ? "" : "s"} shown`
                    : `${rows.length} offer${rows.length === 1 ? "" : "s"} configured`}
                </p>
              </div>
              <div className="shrink-0">
                <label htmlFor="offer-sort" className="sr-only">
                  Sort promotions
                </label>
                <select
                  id="offer-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className={`${FIELD} !w-auto !py-2 text-xs`}
                >
                  <option value="newest">Newest first</option>
                  <option value="ending">Ending soonest</option>
                  <option value="name">Name A–Z</option>
                  <option value="used">Most used</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B5F52]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search offers by name, item, type or status"
                aria-label="Search offers"
                className={`${FIELD} pl-10 pr-10`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#7E8276] transition hover:text-[#F2F3EC]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
              {(
                [
                  ["all", "All", counts.all],
                  ["active", "Active", counts.active],
                  ["scheduled", "Scheduled", counts.scheduled],
                  ["expired", "Expired", counts.expired],
                  ["paused", "Paused", counts.paused],
                ] as [StatusFilter, string, number][]
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    filter === key
                      ? "border-[#D7FE3B] bg-[#D7FE3B] text-[#0D0E0B]"
                      : "border-[#23251F] bg-[#15170F] text-[#9DA194] hover:border-[#3A3E2F] hover:text-[#F2F3EC]"
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                      filter === key ? "bg-[#0D0E0B]/15" : "bg-[#23251F]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#23251F] bg-[#15170F] p-8 text-center sm:p-12">
              <Tag className="mx-auto h-8 w-8 text-[#3A3E2F]" aria-hidden />
              <p className="mt-3 text-sm font-medium">No offers yet</p>
              <p className="mt-1.5 text-sm text-[#7E8276]">Create your first promotion using the form.</p>
              <button
                type="button"
                onClick={() => {
                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  nameRef.current?.focus({ preventScroll: true });
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#D7FE3B] px-3.5 py-2 text-xs font-semibold text-[#0D0E0B] transition hover:bg-[#C4EC2A]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Create offer
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#23251F] bg-[#15170F] p-8 text-center sm:p-12">
              <p className="text-sm font-medium">No offers match</p>
              <p className="mt-1.5 text-sm text-[#7E8276]">Try a different search or status filter.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="mt-4 rounded-lg border border-[#23251F] px-3.5 py-2 text-xs font-medium text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map(({ offer, status, used, target, value }) => {
                const st = STATUS_STYLE[status];
                const working = busyKey !== null && busyKey.endsWith(offer.id);
                const confirming = confirmDeleteId === offer.id;
                const editing = editingId === offer.id;
                const timing =
                  status === "expired"
                    ? `Ended ${relative(now - offer.endsAt)} ago`
                    : status === "scheduled" || (status === "paused" && offer.startsAt > now)
                      ? `Starts in ${relative(offer.startsAt - now)}`
                      : `Ends in ${relative(offer.endsAt - now)}`;

                return (
                  <li
                    key={offer.id}
                    className={`rounded-2xl border bg-[#15170F] p-4 transition sm:p-5 ${
                      editing ? "border-[#D7FE3B]/60" : "border-[#23251F]"
                    } ${working ? "opacity-70" : ""}`}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold">{offer.name}</h3>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />
                            {st.label}
                          </span>
                          {working && <Loader2 className="h-4 w-4 animate-spin text-[#7E8276]" aria-label="Working" />}
                        </div>

                        {offer.description && (
                          <p className="mt-2 text-sm leading-6 text-[#9DA194]">{offer.description}</p>
                        )}

                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-xs text-[#7E8276]">Offer</dt>
                            <dd className="mt-1 font-semibold text-[#D7FE3B]">{value}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-[#7E8276]">Applies to</dt>
                            <dd className="mt-1 truncate font-medium">{target}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7E8276]">Type</dt>
                            <dd className="mt-1 font-medium">{offerTypeLabel(offer.type)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7E8276]">Used</dt>
                            <dd className="mt-1 font-medium tabular-nums">
                              {used} {used === 1 ? "time" : "times"}
                            </dd>
                          </div>
                        </dl>

                        <p className="mt-4 text-xs leading-5 text-[#7E8276]">
                          {formatDate(offer.startsAt)} → {formatDate(offer.endsAt)}
                          <span className="mx-1.5 text-[#3A3E2F]">•</span>
                          <span className={status === "active" ? "text-[#D7FE3B]" : ""}>{timing}</span>
                          {offer.minimumOrderRupees ? (
                            <>
                              <span className="mx-1.5 text-[#3A3E2F]">•</span>
                              Min order ₹{offer.minimumOrderRupees}
                            </>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 xl:max-w-[260px] xl:justify-end">
                        {confirming ? (
                          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[#E27468]/40 bg-[#E27468]/10 px-3 py-2 xl:justify-end">
                            <span className="text-xs text-[#F0A198]">Delete this offer?</span>
                            <button
                              type="button"
                              onClick={() => onDelete(offer)}
                              disabled={busyKey !== null}
                              className="rounded-lg bg-[#E27468] px-3 py-1.5 text-xs font-semibold text-[#0D0E0B] transition hover:bg-[#EC8A80] disabled:opacity-60"
                            >
                              {busyKey === `del:${offer.id}` ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={busyKey === `del:${offer.id}`}
                              className="rounded-lg border border-[#23251F] px-3 py-1.5 text-xs text-[#9DA194] transition hover:text-[#F2F3EC]"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEdit(offer)}
                              disabled={busyKey !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#23251F] px-3 py-2 text-xs font-medium text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B] disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDuplicate(offer)}
                              disabled={busyKey !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#23251F] px-3 py-2 text-xs font-medium text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B] disabled:opacity-50"
                            >
                              {busyKey === `dup:${offer.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              )}
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggle(offer, !offer.active)}
                              disabled={busyKey !== null || (status === "expired" && !offer.active)}
                              title={
                                status === "expired" && !offer.active
                                  ? "Expired — edit the end date to run it again"
                                  : offer.active
                                    ? "Pause this offer"
                                    : "Activate this offer"
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#23251F] px-3 py-2 text-xs font-medium text-[#9DA194] transition hover:border-[#D7FE3B] hover:text-[#D7FE3B] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {busyKey === `toggle:${offer.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : offer.active ? (
                                <Pause className="h-3.5 w-3.5" aria-hidden />
                              ) : (
                                <Play className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {offer.active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(offer.id)}
                              disabled={busyKey !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#23251F] px-3 py-2 text-xs font-medium text-[#E27468] transition hover:border-[#E27468] disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* TOAST */}
      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl sm:left-auto sm:right-6 sm:bottom-6 sm:mx-0 ${
            toast.kind === "error"
              ? "border-[#E27468]/50 bg-[#2A1512] text-[#F6B4AC]"
              : "border-[#D7FE3B]/40 bg-[#171B0A] text-[#E6FF8A]"
          }`}
        >
          {toast.kind === "error" ? <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <p className="flex-1">{toast.message}</p>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-70 transition hover:opacity-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
