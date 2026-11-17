"use client";

import { useState } from "react";

import type { CartLine } from "@/components/customer/cart-context";
import { submitDeviceFeedback } from "@/server/modules/feedback/actions";
import { FEEDBACK_STRINGS, type FeedbackStrings } from "@/server/modules/feedback/i18n";
import { FeedbackLanguageSwitch, useFeedbackLanguage } from "./feedback-language";

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Colour by score so the selected number is obvious at a glance. */
function scoreColor(n: number): string {
  if (n <= 4) return "#e0574a";
  if (n <= 7) return "#f5a623";
  return "#3fc062";
}

function NumberScale({
  label,
  value,
  onChange,
  t,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  t: FeedbackStrings;
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={compact ? "flex shrink-0 gap-0.5" : "grid grid-cols-5 gap-1.5 sm:grid-cols-10"}
    >
      {SCALE.map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t.ratingOutOf(label, n)}
            onClick={() => onChange(n)}
            className={`rounded-md border font-bold transition-transform active:scale-90 ${
              compact ? "h-6 w-6 text-[10px]" : "h-9 text-sm"
            }`}
            style={{
              borderColor: selected ? scoreColor(n) : "var(--device-lcd-border)",
              background: selected ? scoreColor(n) : "#15171c",
              color: selected ? "#101010" : "var(--device-lcd-text)",
              boxShadow: selected ? `0 0 0 2px ${scoreColor(n)}55` : "none",
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function Question({
  letter,
  question,
  value,
  onChange,
  t,
}: {
  letter: string;
  question: string;
  value: number;
  onChange: (n: number) => void;
  t: FeedbackStrings;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--device-lcd-border)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold" style={{ color: "var(--device-lcd-text)" }}>
          <span className="mr-1.5" style={{ color: "var(--device-gold)" }}>
            {letter}.
          </span>
          {question}
        </p>
        <span
          className="shrink-0 rounded px-2 py-0.5 text-[11px] font-bold"
          style={{
            background: value ? scoreColor(value) : "transparent",
            color: value ? "#101010" : "var(--device-lcd-muted)",
            border: value ? "none" : "1px solid var(--device-lcd-border)",
          }}
          aria-live="polite"
        >
          {value ? `${value} / 10` : "— / 10"}
        </span>
      </div>
      <NumberScale label={question} value={value} onChange={onChange} t={t} />
    </div>
  );
}

/**
 * RESTAURANT FEEDBACK — bottom section of the device.
 * Ratings stay editable until Submit. Saved against this table + order.
 */
export function DeviceFeedback({
  tableId,
  orderId,
  orderLines,
  alreadySubmitted,
  onSubmitted,
  onNotice,
}: {
  tableId: string;
  orderId: string | null;
  /** Dishes on the placed order — each gets its own 1–10 review. */
  orderLines: CartLine[];
  alreadySubmitted: boolean;
  onSubmitted: () => void;
  onNotice: (kind: "success" | "error" | "info", text: string) => void;
}) {
  const [overall, setOverall] = useState(0);
  const [foodTaste, setFoodTaste] = useState(0);
  const [deviceUsability, setDeviceUsability] = useState(0);
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useFeedbackLanguage();
  const t = FEEDBACK_STRINGS[language];

  async function handleSubmit() {
    if (!orderId) {
      onNotice("info", t.placeOrderFirst);
      return;
    }

    if (!overall || !foodTaste || !deviceUsability) {
      onNotice("error", t.answerAll);
      return;
    }

    setSubmitting(true);

    const result = await submitDeviceFeedback({
      orderId,
      tableId,
      overall,
      foodTaste,
      deviceUsability,
      itemRatings: Object.entries(itemRatings).map(([itemId, rating]) => ({
        itemId,
        rating,
      })),
      language,
    });

    setSubmitting(false);

    if (result.ok) {
      onNotice("success", t.thanksToast);
      onSubmitted();
    } else {
      onNotice("error", result.error);
    }
  }

  return (
    <section
      id="device-feedback"
      aria-labelledby="device-feedback-title"
      className="mx-1 mt-3 rounded-lg border p-3 sm:mx-2 sm:p-4"
      style={{ background: "var(--device-lcd-bg)", borderColor: "var(--device-gold)" }}
    >
      <h2
        id="device-feedback-title"
        className="text-center text-sm font-bold uppercase tracking-[0.2em]"
        style={{ color: "var(--device-gold)" }}
      >
        {t.title}
      </h2>

      <FeedbackLanguageSwitch value={language} onChange={setLanguage} label={t.language} />

      {alreadySubmitted ? (
        <p
          className="mt-3 rounded-md border px-3 py-4 text-center text-sm font-semibold"
          style={{ borderColor: "#1f6b3a", color: "#5fe08a", background: "rgba(31,107,58,0.12)" }}
        >
          {t.thanksBox}
        </p>
      ) : (
        <>
          <p className="mt-3 text-center text-xs" style={{ color: "var(--device-lcd-muted)" }}>
            {t.instruction}
          </p>

          <div className="mt-3 space-y-3">
            <Question letter="A" question={t.qOverall} value={overall} onChange={setOverall} t={t} />
            <Question letter="B" question={t.qFood} value={foodTaste} onChange={setFoodTaste} t={t} />
            <Question
              letter="C"
              question={t.qDevice}
              value={deviceUsability}
              onChange={setDeviceUsability}
              t={t}
            />
          </div>

          <div className="mt-4">
            <h3
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--device-lcd-cyan)" }}
            >
              {t.dishesHeading}
            </h3>

            {orderLines.length === 0 ? (
              <p className="mt-2 text-xs" style={{ color: "var(--device-lcd-muted)" }}>
                {t.dishesEmpty}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {orderLines.map((line) => {
                  const key = line.itemId || line.code;
                  const value = itemRatings[key] ?? 0;
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                      style={{ borderColor: "var(--device-lcd-border)" }}
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-[12px]"
                        style={{ color: "var(--device-lcd-text)" }}
                        title={line.name}
                      >
                        {line.name}
                      </span>
                      <NumberScale
                        compact
                        label={t.rateDish(line.name)}
                        t={t}
                        value={value}
                        onChange={(n) => setItemRatings((prev) => ({ ...prev, [key]: n }))}
                      />
                      <span
                        className="w-8 shrink-0 text-right text-[11px] font-bold"
                        style={{ color: value ? scoreColor(value) : "var(--device-lcd-muted)" }}
                      >
                        {value ? `${value}/10` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-4 w-full rounded-md py-3 text-sm font-semibold uppercase tracking-wide transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: "var(--device-gold)", color: "#171a10" }}
          >
            {submitting ? t.submitting : t.submit}
          </button>
        </>
      )}
    </section>
  );
}
