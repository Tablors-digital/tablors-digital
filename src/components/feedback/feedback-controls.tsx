"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";

import "../reports/reports.css";
import "./feedback.css";

export type FeedbackPeriodOption = {
  value: string; // today | yesterday | week | month | all
  label: string;
  dates: string;
};

/**
 * Date selector + Today / Yesterday / This Week / This Month buttons.
 * The dropdown also offers "All time" and any single date. Every choice
 * navigates to ?period=… or ?date=…, so the server recomputes the whole
 * dashboard from the stored feedback.
 */
export function FeedbackControls({
  options,
  current,
  customDate,
  maxDate,
  summary,
}: {
  options: FeedbackPeriodOption[];
  /** Active period value, or "" when a custom date is active. */
  current: string;
  /** Active YYYY-MM-DD when a custom date is selected. */
  customDate: string | null;
  /** Latest selectable date (today, IST) as YYYY-MM-DD. */
  maxDate: string;
  /** Text shown in the dropdown button, e.g. "Today • 13-11-2026". */
  summary: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const navigate = (query: string) => {
    setOpen(false);
    startTransition(() => router.push(`/owner/feedback?${query}`));
  };

  const quick = options.filter((o) => o.value !== "all");

  return (
    <div className="rp-controls" aria-busy={pending} style={pending ? { opacity: 0.65 } : undefined}>
      <div ref={ref} className="rp-menu-wrap">
        <button type="button" className="rp-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
          <Calendar aria-hidden />
          <span>{pending ? "Updating…" : summary}</span>
          <ChevronDown aria-hidden style={open ? { transform: "rotate(180deg)" } : undefined} />
        </button>
        {open && (
          <ul className="rp-menu" role="listbox">
            {options.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === current}>
                <button type="button" className={o.value === current ? "is-on" : ""} onClick={() => navigate(`period=${o.value}`)}>
                  <span>{o.label}</span>
                  <small>{o.dates}</small>
                </button>
              </li>
            ))}
            <li role="presentation">
              <hr className="fb-menu-sep" />
              <label className="fb-menu-date">
                Pick any date
                <input
                  type="date"
                  className="fb-date"
                  max={maxDate}
                  value={customDate ?? ""}
                  onChange={(e) => e.target.value && navigate(`date=${e.target.value}`)}
                />
              </label>
            </li>
          </ul>
        )}
      </div>

      {quick.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`rp-btn${o.value === current ? " is-on" : ""}`}
          aria-pressed={o.value === current}
          onClick={() => navigate(`period=${o.value}`)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
