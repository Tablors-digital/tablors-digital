"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Trash2, X } from "lucide-react";
import type { MenuItem } from "@/server/modules/demo-store/store";
import {
  createMenuItemAction,
  updateMenuItemAction,
} from "@/server/modules/menu/actions";
import {
  CATEGORY_MAX,
  DESCRIPTION_MAX,
  IMAGE_ALLOWED_TYPES,
  ITEM_CODE_HINT,
  NAME_MAX,
  duplicateItemName,
  formatRupees,
  getEffectivePrice,
  suggestNextItemCode,
  validateImageFile,
  validateMenuInput,
  type MenuFieldErrors,
  type MenuFormField,
  type MenuFormValues,
} from "@/lib/menu-shared";
import { Switch, fieldBase } from "./menu-ui";

const NEW_CATEGORY = "__new__";

function fieldBorder(error?: string) {
  return error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]";
}

function toValues(
  item: MenuItem | null,
  duplicateOf: MenuItem | null,
  autoCode: string,
  defaultCategory: string | undefined,
): MenuFormValues {
  const source = item ?? duplicateOf;
  if (!source) {
    return {
      name: "",
      // New items get the next free code automatically (still editable via "Change").
      code: autoCode,
      description: "",
      priceRupees: "",
      category: defaultCategory ?? "",
      veg: "",
      prepMinutes: "",
      available: true,
      isSpecial: false,
      discountPercent: "",
    };
  }
  return {
    // A duplicate is a NEW item: fresh code, "(Copy)" name, everything else carried over.
    name: item ? source.name : duplicateItemName(source.name),
    code: item ? source.code : autoCode,
    description: source.description,
    priceRupees: String(source.priceRupees),
    category: source.category,
    veg: source.veg ? "veg" : "non-veg",
    prepMinutes: String(source.prepMinutes),
    available: source.available,
    isSpecial: source.isSpecial,
    discountPercent: source.discountPercent > 0 ? String(source.discountPercent) : "",
  };
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  id,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  id: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
        checked
          ? "border-[var(--color-radium-500)]/40 bg-[var(--color-radium-500)]/[0.06]"
          : "border-[var(--color-border)] bg-[var(--color-surface-0)]"
      }`}
    >
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-[var(--color-text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{description}</span>
      </label>
      <Switch id={id} checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function MenuItemForm({
  item,
  duplicateOf = null,
  defaultCategory,
  allItems,
  onClose,
  onSaved,
}: {
  /** null = add mode (or duplicate mode when duplicateOf is set) */
  item: MenuItem | null;
  /** Pre-fills a NEW item from an existing one. Saves through the normal create path. */
  duplicateOf?: MenuItem | null;
  /** Category pre-selected for a new item (e.g. the category currently being viewed). */
  defaultCategory?: string;
  /** every active item, for the unique-code check + category list */
  allItems: MenuItem[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = item !== null;
  const isDuplicate = !isEdit && duplicateOf !== null;

  const categories = useMemo(
    () => Array.from(new Set(allItems.map((m) => m.category))),
    [allItems],
  );

  // Suggested once when the form opens; the server still enforces uniqueness on save.
  const [autoCode] = useState(
    () => suggestNextItemCode(allItems.map((m) => m.code)) ?? "",
  );
  const [values, setValues] = useState<MenuFormValues>(() =>
    toValues(
      item,
      duplicateOf,
      autoCode,
      defaultCategory && categories.includes(defaultCategory) ? defaultCategory : undefined,
    ),
  );
  const [touched, setTouched] = useState<Set<MenuFormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<MenuFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [categoryMode, setCategoryMode] = useState<"existing" | "new">(
    categories.length === 0 ? "new" : "existing",
  );

  // The code is generated for the owner; "Change" unlocks it for a manual override.
  const defaultCode = isEdit && item ? item.code : autoCode;
  const [codeUnlocked, setCodeUnlocked] = useState(defaultCode === "");
  const codeRef = useRef<HTMLInputElement>(null);

  // Image state: a newly chosen file, or a request to remove the current one.
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const imageTouched = useRef(false);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Duplicate: carry the source photo over as a normal upload, so the copy
  // goes through the exact same create + image validation path as any new item.
  useEffect(() => {
    const src = duplicateOf?.imageUrl;
    if (!src) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(src, { signal: controller.signal });
        if (!res.ok) return;
        const blob = await res.blob();
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const copy = new File([blob], `${duplicateOf.code}-copy.${ext}`, { type: blob.type });
        if (validateImageFile(copy) !== null || imageTouched.current) return;
        setFile(copy);
      } catch {
        // Aborted or offline: the copy simply starts without a photo.
      }
    })();
    return () => controller.abort();
  }, [duplicateOf]);

  // Escape to close + lock background scroll while the drawer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, saving]);

  const validation = useMemo(
    () =>
      validateMenuInput(
        values,
        allItems.map((m) => ({ id: m.id, code: m.code, name: m.name })),
        categories,
        item?.id ?? null,
      ),
    [values, allItems, categories, item],
  );

  const clientErrors: MenuFieldErrors = validation.ok ? {} : validation.errors;
  const errorFor = (field: MenuFormField): string | undefined => {
    if (field === "image") return imageError ?? serverErrors.image;
    // Server-reported errors show until that field is edited again.
    if (serverErrors[field]) return serverErrors[field];
    if (submitted || touched.has(field)) return clientErrors[field];
    return undefined;
  };

  function set<K extends keyof MenuFormValues>(key: K, value: MenuFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key in serverErrors) {
      setServerErrors((prev) => {
        const next = { ...prev };
        delete next[key as MenuFormField];
        return next;
      });
    }
  }
  const touch = (field: MenuFormField) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  // Who owns the code being typed? Shown live, before submit.
  const codeOwner = useMemo(() => {
    const code = values.code.trim();
    if (!code) return null;
    const owner = allItems.find((m) => m.code === code && m.id !== item?.id);
    return owner ?? null;
  }, [values.code, allItems, item]);
  const codeChanged = isEdit && item !== null && values.code.trim() !== item.code;
  // A clash reported by the server (someone else took the code) re-opens the field.
  const codeEditable = codeUnlocked || Boolean(serverErrors.code);

  const effectivePreview = useMemo(() => {
    const price = /^\d+$/.test(values.priceRupees.trim()) ? Number(values.priceRupees) : null;
    if (price === null) return null;
    const d = values.discountPercent.trim() === "" ? 0 : Number(values.discountPercent);
    if (!Number.isInteger(d) || d < 0 || d > 100) return null;
    return {
      base: price,
      discount: d,
      effective: getEffectivePrice({ priceRupees: price, discountPercent: d }),
    };
  }, [values.priceRupees, values.discountPercent]);

  function acceptFile(picked: File) {
    imageTouched.current = true;
    const problem = validateImageFile(picked);
    if (problem) {
      setImageError(problem);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImageError(null);
    setFile(picked);
    setRemoveImage(false);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (picked) acceptFile(picked);
  }

  function onDropFile(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  }

  function clearImage() {
    imageTouched.current = true;
    setFile(null);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (item?.imageUrl) setRemoveImage(true);
  }

  function toggleCodeLock() {
    if (codeEditable) {
      // Back to the generated (or original) code.
      set("code", defaultCode);
      setCodeUnlocked(defaultCode === "");
    } else {
      setCodeUnlocked(true);
      codeRef.current?.focus();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});

    if (!validation.ok || imageError) {
      setFormError("Please fix the highlighted fields.");
      return;
    }

    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("code", values.code);
    fd.set("description", values.description);
    fd.set("priceRupees", values.priceRupees);
    fd.set("category", values.category);
    fd.set("veg", values.veg);
    fd.set("prepMinutes", values.prepMinutes);
    fd.set("available", String(values.available));
    fd.set("isSpecial", String(values.isSpecial));
    fd.set("discountPercent", values.discountPercent);
    if (file) fd.set("image", file);
    if (removeImage && !file) fd.set("removeImage", "true");

    setSaving(true);
    try {
      const result = item
        ? await updateMenuItemAction(item.id, fd)
        : await createMenuItemAction(fd);
      if (result.ok) {
        onSaved(result.message);
      } else {
        setServerErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    } catch {
      setFormError("Couldn't save the item. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const currentImage = file ? filePreview : removeImage ? null : (item?.imageUrl ?? null);

  const title = isEdit ? "Edit menu item" : isDuplicate ? "Duplicate menu item" : "Add menu item";
  const subtitle = isEdit
    ? `${item?.code} · ${item?.name}`
    : isDuplicate
      ? `Copying “${duplicateOf?.name}”. Review the details, then save it as a new item.`
      : "Fill in the details. The item code is generated for you.";
  const submitLabel = isEdit ? "Save changes" : isDuplicate ? "Create copy" : "Add item";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close form"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
      />

      <form
        onSubmit={onSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-form-title"
        className="mm-pop relative flex h-full w-full max-w-xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.9)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{
            background:
              "radial-gradient(80% 100% at 0% 0%, rgba(212,175,55,0.10) 0%, rgba(5,7,10,0) 70%)",
          }}
        />
        <div className="relative flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">
              Menu item
            </p>
            <h2 id="menu-form-title" className="mt-0.5 text-lg font-semibold text-[var(--color-text-primary)]">
              {title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Food image */}
          <Field
            label="Food image (optional)"
            error={errorFor("image")}
            hint="JPEG, PNG or WebP, up to 512 KB. Drag a photo here or browse."
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDropFile}
              className={`relative h-44 overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
                dragging
                  ? "border-[var(--color-radium-500)] bg-[var(--color-radium-500)]/[0.06]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-0)]"
              }`}
            >
              {currentImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview / our own image route
                <img src={currentImage} alt="Food preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--color-gold-500)]/30 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-500)]">
                    <ImagePlus className="h-5 w-5" />
                  </span>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    Drop a photo here or choose one
                  </span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={IMAGE_ALLOWED_TYPES.join(",")}
                onChange={onPickFile}
                className="sr-only"
                id="mf-image"
              />
              <div className="absolute bottom-2.5 right-2.5 flex gap-2">
                <label
                  htmlFor="mf-image"
                  className="cursor-pointer rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] backdrop-blur hover:border-[var(--color-gold-500)]"
                >
                  {currentImage ? "Replace image" : "Choose image"}
                </label>
                {currentImage && (
                  <button
                    type="button"
                    onClick={clearImage}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] backdrop-blur hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                )}
              </div>
            </div>
          </Field>

          {/* Name + code */}
          <div className="grid gap-3 sm:grid-cols-[1fr_10.5rem]">
            <Field label="Item name" htmlFor="mf-name" error={errorFor("name")}>
              <input
                id="mf-name"
                maxLength={NAME_MAX + 20}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => touch("name")}
                placeholder="Pepper Chicken"
                aria-invalid={Boolean(errorFor("name"))}
                className={`${fieldBase} w-full ${fieldBorder(errorFor("name"))}`}
              />
            </Field>
            <Field
              label="Item code"
              htmlFor="mf-code"
              error={errorFor("code")}
              hint={codeEditable ? ITEM_CODE_HINT : isEdit ? "Current code" : "Auto-generated"}
            >
              <div className="flex gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <input
                    id="mf-code"
                    ref={codeRef}
                    inputMode="numeric"
                    maxLength={3}
                    readOnly={!codeEditable}
                    value={values.code}
                    onChange={(e) => set("code", e.target.value.replace(/\D/g, ""))}
                    onBlur={() => touch("code")}
                    placeholder="099"
                    aria-invalid={Boolean(errorFor("code"))}
                    className={`${fieldBase} w-full font-semibold tabular-nums ${
                      codeEditable ? "" : "pr-8 text-[var(--color-gold-400)]"
                    } ${fieldBorder(errorFor("code"))}`}
                  />
                  {!codeEditable && (
                    <Lock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={toggleCodeLock}
                  className="shrink-0 rounded-xl border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-gold-500)] hover:text-[var(--color-text-primary)]"
                >
                  {codeEditable ? (isEdit ? "Reset" : "Auto") : "Change"}
                </button>
              </div>
            </Field>
          </div>

          {codeOwner && !errorFor("code") && (
            <p className="-mt-3 text-xs text-[var(--color-danger)]">
              Code {codeOwner.code} belongs to “{codeOwner.name}”.
            </p>
          )}
          {codeChanged && !codeOwner && (
            <p className="-mt-3 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
              Changing the code from {item?.code} to {values.code.trim() || "…"} changes what guests
              enter on the device. Past orders keep the code they were placed with.
            </p>
          )}
          {!isEdit && autoCode === "" && (
            <p role="alert" className="-mt-3 text-xs text-[var(--color-danger)]">
              All codes from 001 to 999 are in use. Delete an item to free a code.
            </p>
          )}

          {/* Category + type */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" htmlFor="mf-category" error={errorFor("category")}>
              {categoryMode === "existing" ? (
                <select
                  id="mf-category"
                  value={values.category}
                  onChange={(e) => {
                    if (e.target.value === NEW_CATEGORY) {
                      setCategoryMode("new");
                      set("category", "");
                    } else set("category", e.target.value);
                  }}
                  onBlur={() => touch("category")}
                  aria-invalid={Boolean(errorFor("category"))}
                  className={`${fieldBase} w-full ${fieldBorder(errorFor("category"))}`}
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>+ New category…</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    id="mf-category"
                    autoFocus={categories.length > 0}
                    maxLength={CATEGORY_MAX + 10}
                    value={values.category}
                    onChange={(e) => set("category", e.target.value)}
                    onBlur={() => touch("category")}
                    placeholder="New category name"
                    aria-invalid={Boolean(errorFor("category"))}
                    className={`${fieldBase} w-full ${fieldBorder(errorFor("category"))}`}
                  />
                  {categories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryMode("existing");
                        set("category", item && categories.includes(item.category) ? item.category : "");
                      }}
                      className="shrink-0 rounded-xl border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-gold-500)]"
                    >
                      List
                    </button>
                  )}
                </div>
              )}
            </Field>

            <Field label="Type" error={errorFor("veg")}>
              <div
                role="radiogroup"
                aria-label="Veg or Non-Veg"
                className={`flex overflow-hidden rounded-xl border ${
                  errorFor("veg") ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
                }`}
              >
                {(
                  [
                    ["veg", "Veg"],
                    ["non-veg", "Non-Veg"],
                  ] as const
                ).map(([val, label]) => {
                  const active = values.veg === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        set("veg", val);
                        touch("veg");
                      }}
                      className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? val === "veg"
                            ? "bg-[var(--color-radium-500)] text-[#05120a]"
                            : "bg-[var(--color-danger)] text-[#1a0505]"
                          : "bg-[var(--color-surface-0)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          {/* Price + prep time */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price" htmlFor="mf-price" error={errorFor("priceRupees")}>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]"
                >
                  ₹
                </span>
                <input
                  id="mf-price"
                  inputMode="numeric"
                  value={values.priceRupees}
                  onChange={(e) => set("priceRupees", e.target.value)}
                  onBlur={() => touch("priceRupees")}
                  placeholder="280"
                  aria-label="Price (₹)"
                  aria-invalid={Boolean(errorFor("priceRupees"))}
                  className={`${fieldBase} w-full pl-7 tabular-nums ${fieldBorder(errorFor("priceRupees"))}`}
                />
              </div>
            </Field>
            <Field label="Preparation time" htmlFor="mf-prep" error={errorFor("prepMinutes")}>
              <div className="relative">
                <input
                  id="mf-prep"
                  inputMode="numeric"
                  value={values.prepMinutes}
                  onChange={(e) => set("prepMinutes", e.target.value)}
                  onBlur={() => touch("prepMinutes")}
                  placeholder="15"
                  aria-label="Prep time (min)"
                  aria-invalid={Boolean(errorFor("prepMinutes"))}
                  className={`${fieldBase} w-full pr-12 tabular-nums ${fieldBorder(errorFor("prepMinutes"))}`}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]"
                >
                  min
                </span>
              </div>
            </Field>
          </div>

          {/* Discount (existing feature) + guest price preview */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Discount % (optional)"
              htmlFor="mf-discount"
              error={errorFor("discountPercent")}
              hint="Leave blank for no discount."
            >
              <input
                id="mf-discount"
                inputMode="numeric"
                value={values.discountPercent}
                onChange={(e) => set("discountPercent", e.target.value)}
                onBlur={() => touch("discountPercent")}
                placeholder="10"
                aria-invalid={Boolean(errorFor("discountPercent"))}
                className={`${fieldBase} w-full tabular-nums ${fieldBorder(errorFor("discountPercent"))}`}
              />
            </Field>
            <div className="flex flex-col justify-center rounded-xl border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.05] px-3.5 py-2 text-xs text-[var(--color-text-secondary)] sm:mt-[1.375rem] sm:self-start sm:py-2.5">
              <span className="text-[var(--color-text-muted)]">Guests pay</span>
              {effectivePreview ? (
                <span className="mt-0.5 text-base font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {effectivePreview.discount > 0 && (
                    <s className="mr-1.5 text-xs font-normal text-[var(--color-text-muted)]">
                      {formatRupees(effectivePreview.base)}
                    </s>
                  )}
                  {formatRupees(effectivePreview.effective)}
                </span>
              ) : (
                <span className="mt-0.5 text-base text-[var(--color-text-muted)]">—</span>
              )}
            </div>
          </div>

          {/* Description */}
          <Field
            label="Description (optional)"
            htmlFor="mf-desc"
            error={errorFor("description")}
            hint={`${values.description.trim().length}/${DESCRIPTION_MAX}`}
          >
            <textarea
              id="mf-desc"
              rows={3}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              onBlur={() => touch("description")}
              placeholder="Juicy pepper chicken cooked with freshly ground spices."
              className={`${fieldBase} w-full resize-none ${fieldBorder(errorFor("description"))}`}
            />
          </Field>

          {/* Availability + special */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              id="mf-available"
              title="Available"
              description="Guests can order it on table devices."
              checked={values.available}
              onChange={(next) => set("available", next)}
            />
            <ToggleRow
              id="mf-special"
              title="Today's special"
              description="Highlighted as a special."
              checked={values.isSpecial}
              onChange={(next) => set("isSpecial", next)}
            />
          </div>
        </div>

        <div className="relative border-t border-[var(--color-border)] bg-[var(--color-surface-1)] px-5 py-4">
          {formError && (
            <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-gold-500)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-radium-500)] px-5 py-2.5 text-sm font-semibold text-[#05120a] shadow-[0_0_24px_-6px_rgba(57,255,106,0.6)] transition-colors hover:bg-[var(--color-radium-600)] disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
