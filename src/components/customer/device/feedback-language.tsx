"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_FEEDBACK_LANGUAGE,
  FEEDBACK_LANGUAGES,
  FEEDBACK_LANGUAGE_NAMES,
  isFeedbackLanguage,
  type FeedbackLanguage,
} from "@/server/modules/feedback/i18n";

const STORAGE_KEY = "tablor_feedback_language";
const listeners = new Set<() => void>();

function readStored(): FeedbackLanguage {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isFeedbackLanguage(v) ? v : DEFAULT_FEEDBACK_LANGUAGE;
  } catch {
    return DEFAULT_FEEDBACK_LANGUAGE;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Remembers the customer's language on this device; defaults to English. */
export function useFeedbackLanguage(): [FeedbackLanguage, (l: FeedbackLanguage) => void] {
  const lang = useSyncExternalStore(subscribe, readStored, () => DEFAULT_FEEDBACK_LANGUAGE);
  const set = (next: FeedbackLanguage) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: selection still applies until reload */
    }
    listeners.forEach((l) => l());
  };
  return [lang, set];
}

/** Three large, touch-friendly buttons, each labelled in its own script. */
export function FeedbackLanguageSwitch({
  value,
  onChange,
  label,
}: {
  value: FeedbackLanguage;
  onChange: (l: FeedbackLanguage) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-3 grid grid-cols-3 gap-1.5">
      {FEEDBACK_LANGUAGES.map((l) => {
        const selected = l === value;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={l}
            onClick={() => onChange(l)}
            className="min-h-10 rounded-md border px-2 text-sm font-semibold transition-transform active:scale-95"
            style={{
              borderColor: selected ? "var(--device-gold)" : "var(--device-lcd-border)",
              background: selected ? "var(--device-gold)" : "#15171c",
              color: selected ? "#171a10" : "var(--device-lcd-text)",
            }}
          >
            {FEEDBACK_LANGUAGE_NAMES[l]}
          </button>
        );
      })}
    </div>
  );
}
