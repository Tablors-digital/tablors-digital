"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import type { CartLine } from "@/components/customer/cart-context";
import { submitDeviceFeedback } from "@/server/modules/feedback/actions";
import {
  DEFAULT_FEEDBACK_LANGUAGE,
  FEEDBACK_LANGUAGES,
  FEEDBACK_STRINGS,
  type FeedbackStrings,
} from "@/server/modules/feedback/i18n";

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** English first, then every other language directly underneath (Telugu, Hindi). No language switch. */
const EN = FEEDBACK_STRINGS[DEFAULT_FEEDBACK_LANGUAGE];
const OTHERS = FEEDBACK_LANGUAGES.filter((l) => l !== DEFAULT_FEEDBACK_LANGUAGE);

/** Controls the ordering device drives with the keypad / keyboard while feedback is active. */
export interface FeedbackControls {
  /** "1"-"9" rate 1-9, "0" rates 10; then focus moves to the next row. */
  digit: (d: string) => void;
  /** Move the highlighted row up (-1) or down (+1). */
  move: (delta: number) => void;
  /** Submit (when the required ratings are filled). */
  enter: () => void;
  /** Clear the highlighted row's rating. */
  clear: () => void;
}

/** Colour by score so the selected number is obvious at a glance. */
function scoreColor(n: number): string {
  if (n <= 4) return "#e0574a";
  if (n <= 7) return "#f5a623";
  return "#3fc062";
}

/** One text in all languages: English on top, the others in a muted sub-line each. */
function Tri({ pick, className = "" }: { pick: (t: FeedbackStrings) => string; className?: string }) {
  return (
    <span className={`block ${className}`}>
      <span className="block">{pick(EN)}</span>
      {OTHERS.map((l) => (
        <span
          key={l}
          lang={l}
          className="block text-[11px] font-normal normal-case leading-snug tracking-normal"
          style={{ color: "var(--device-lcd-muted)" }}
        >
          {pick(FEEDBACK_STRINGS[l])}
        </span>
      ))}
    </span>
  );
}

/** Same, joined for the single-line on-screen notice: English as the headline, the rest as its detail. */
function triNotice(pick: (t: FeedbackStrings) => string): { text: string; detail: string } {
  return { text: pick(EN), detail: OTHERS.map((l) => pick(FEEDBACK_STRINGS[l])).join(" · ") };
}

function NumberScale({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
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
            aria-label={EN.ratingOutOf(label, n)}
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
  pick,
  value,
  onChange,
  highlighted,
  row,
}: {
  letter: string;
  pick: (t: FeedbackStrings) => string;
  value: number;
  onChange: (n: number) => void;
  highlighted: boolean;
  row: number;
}) {
  return (
    <div
      data-fb-row={row}
      className="rounded-lg border p-3 transition-shadow"
      style={{
        borderColor: highlighted ? "var(--device-gold)" : "var(--device-lcd-border)",
        boxShadow: highlighted ? "0 0 0 2px var(--device-gold)" : "none",
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold" style={{ color: "var(--device-lcd-text)" }}>
          <span className="mr-1.5" style={{ color: "var(--device-gold)" }}>
            {letter}.
          </span>
          <span className="inline-block align-top">
            <Tri pick={pick} />
          </span>
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
      <NumberScale label={pick(EN)} value={value} onChange={onChange} />
    </div>
  );
}

type Props = {
  tableId: string;
  orderId: string | null;
  /** Dishes on the placed order — each gets its own 1–10 review. */
  orderLines: CartLine[];
  alreadySubmitted: boolean;
  /** True while the keypad / keyboard is driving this form. */
  active: boolean;
  onActiveChange: (active: boolean) => void;
  onSubmitted: () => void;
  onNotice: (kind: "success" | "error" | "info", text: string, detail?: string) => void;
};

/**
 * RESTAURANT FEEDBACK — always shown inside the ordering device once there is an order.
 * Every text is English on top with Telugu and Hindi beneath it. Fully keypad/keyboard driven:
 * the device forwards ▲ ▼ / 1-9 / 0 / Enter / X to the controls exposed through `ref`.
 */
export const DeviceFeedback = forwardRef<FeedbackControls, Props>(function DeviceFeedback(
  { tableId, orderId, orderLines, alreadySubmitted, active, onActiveChange, onSubmitted, onNotice },
  ref
) {
  const [overall, setOverall] = useState(0);
  const [foodTaste, setFoodTaste] = useState(0);
  const [deviceUsability, setDeviceUsability] = useState(0);
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  // Highlighted row: 0..2 = questions A-C, 3.. = one per dish, last = the Submit button.
  const [idx, setIdx] = useState(0);

  const submitIdx = 3 + orderLines.length;
  const keyOf = (line: CartLine) => line.itemId || line.code;

  function setRatingAt(i: number, n: number) {
    if (i === 0) setOverall(n);
    else if (i === 1) setFoodTaste(n);
    else if (i === 2) setDeviceUsability(n);
    else {
      const line = orderLines[i - 3];
      if (line) setItemRatings((prev) => ({ ...prev, [keyOf(line)]: n }));
    }
  }

  async function handleSubmit() {
    if (submitting || alreadySubmitted) return;

    if (!orderId) {
      const m = triNotice((t) => t.placeOrderFirst);
      onNotice("info", m.text, m.detail);
      return;
    }

    if (!overall || !foodTaste || !deviceUsability) {
      const m = triNotice((t) => t.answerAll);
      onNotice("error", m.text, m.detail);
      // Jump to the first unanswered required question.
      setIdx(!overall ? 0 : !foodTaste ? 1 : 2);
      return;
    }

    setSubmitting(true);
    const result = await submitDeviceFeedback({
      orderId,
      tableId,
      overall,
      foodTaste,
      deviceUsability,
      itemRatings: Object.entries(itemRatings).map(([itemId, rating]) => ({ itemId, rating })),
      language: DEFAULT_FEEDBACK_LANGUAGE,
    });
    setSubmitting(false);

    if (result.ok) {
      const m = triNotice((t) => t.thanksToast);
      onNotice("success", m.text, m.detail);
      onSubmitted();
    } else {
      onNotice("error", result.error);
    }
  }

  useImperativeHandle(ref, () => ({
    digit(d: string) {
      if (!/^[0-9]$/.test(d) || idx >= submitIdx) return;
      setRatingAt(idx, d === "0" ? 10 : Number(d));
      setIdx(Math.min(idx + 1, submitIdx)); // auto-advance for fast entry
    },
    move(delta: number) {
      setIdx((cur) => Math.min(Math.max(cur + delta, 0), submitIdx));
    },
    enter() {
      void handleSubmit();
    },
    clear() {
      if (idx < submitIdx) setRatingAt(idx, 0);
    },
  }));

  // Keep the highlighted row on screen while moving with ▲ ▼.
  useEffect(() => {
    if (!active) return;
    document
      .querySelector(`#device-feedback [data-fb-row="${idx}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, idx]);

  const hl = (i: number) => active && idx === i;

  return (
    <section
      id="device-feedback"
      aria-labelledby="device-feedback-title"
      className="mx-1 mt-3 rounded-lg border p-3 sm:mx-2 sm:p-4"
      style={{ background: "var(--device-lcd-bg)", borderColor: "var(--device-gold)" }}
      onPointerDown={() => onActiveChange(true)}
    >
      <h2
        id="device-feedback-title"
        className="text-center text-sm font-bold uppercase tracking-[0.2em]"
        style={{ color: "var(--device-gold)" }}
      >
        <Tri pick={(t) => t.title} />
      </h2>

      {alreadySubmitted ? (
        <p
          className="mt-3 rounded-md border px-3 py-4 text-center text-sm font-semibold"
          style={{ borderColor: "#1f6b3a", color: "#5fe08a", background: "rgba(31,107,58,0.12)" }}
        >
          <Tri pick={(t) => t.thanksBox} />
        </p>
      ) : (
        <>
          <div className="mt-3 text-center text-xs" style={{ color: "var(--device-lcd-muted)" }}>
            <Tri pick={(t) => t.instruction} />
          </div>

          <p
            className="mt-2 text-center text-[10px] uppercase tracking-wider"
            style={{ color: active ? "var(--device-gold)" : "var(--device-lcd-muted)" }}
          >
            {active
              ? "▲▼ move · 1–9 rate · 0 = 10 · X clear · Enter submit · Esc back to ordering"
              : "Press F to rate with the keypad"}
          </p>

          <div className="mt-3 space-y-3">
            <Question
              row={0} letter="A" pick={(t) => t.qOverall} value={overall} highlighted={hl(0)}
              onChange={(n) => { setOverall(n); setIdx(0); onActiveChange(true); }}
            />
            <Question
              row={1} letter="B" pick={(t) => t.qFood} value={foodTaste} highlighted={hl(1)}
              onChange={(n) => { setFoodTaste(n); setIdx(1); onActiveChange(true); }}
            />
            <Question
              row={2} letter="C" pick={(t) => t.qDevice} value={deviceUsability} highlighted={hl(2)}
              onChange={(n) => { setDeviceUsability(n); setIdx(2); onActiveChange(true); }}
            />
          </div>

          <div className="mt-4">
            <h3
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--device-lcd-cyan)" }}
            >
              <Tri pick={(t) => t.dishesHeading} />
            </h3>

            {orderLines.length === 0 ? (
              <div className="mt-2 text-xs" style={{ color: "var(--device-lcd-muted)" }}>
                <Tri pick={(t) => t.dishesEmpty} />
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {orderLines.map((line, i) => {
                  const row = 3 + i;
                  const key = keyOf(line);
                  const value = itemRatings[key] ?? 0;
                  return (
                    <li
                      key={key}
                      data-fb-row={row}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 transition-shadow"
                      style={{
                        borderColor: hl(row) ? "var(--device-gold)" : "var(--device-lcd-border)",
                        boxShadow: hl(row) ? "0 0 0 2px var(--device-gold)" : "none",
                      }}
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
                        label={EN.rateDish(line.name)}
                        value={value}
                        onChange={(n) => { setItemRatings((prev) => ({ ...prev, [key]: n })); setIdx(row); onActiveChange(true); }}
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
            data-fb-row={submitIdx}
            onClick={() => { setIdx(submitIdx); void handleSubmit(); }}
            disabled={submitting}
            className="mt-4 w-full rounded-md py-3 text-sm font-semibold uppercase tracking-wide transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "var(--device-gold)",
              color: "#171a10",
              outline: hl(submitIdx) ? "3px solid #fff" : "none",
              outlineOffset: 2,
            }}
          >
            <Tri pick={(t) => (submitting ? t.submitting : t.submit)} />
          </button>
        </>
      )}
    </section>
  );
});