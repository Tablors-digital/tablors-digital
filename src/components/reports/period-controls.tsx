"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";

import "./reports.css";

export type PeriodOption = {
  value: string;
  label: string;
  /** Date text for the period, e.g. "13-11-2026" or "09-11-2026 – 15-11-2026". */
  dates: string;
};

/**
 * Date dropdown + Today / Yesterday / This Week / This Month buttons.
 * Choosing a period navigates to ?period=…, so the server recomputes every
 * report section from the database.
 */
export function PeriodControls({ options, current }: { options: PeriodOption[]; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === current) ?? options[0];

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

  const go = (value: string) => {
    setOpen(false);
    if (value === current) return;
    startTransition(() => router.push(`/owner/reports?period=${value}`));
  };

  return (
    <div className="rp-controls" aria-busy={pending} style={pending ? { opacity: 0.7 } : undefined}>
      <div ref={ref} className="rp-menu-wrap">
        <button
          type="button"
          className="rp-btn"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <Calendar aria-hidden />
          <span>
            {active.label} • {active.dates}
          </span>
          <ChevronDown aria-hidden style={open ? { transform: "rotate(180deg)" } : undefined} />
        </button>
        {open && (
          <ul className="rp-menu" role="listbox">
            {options.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === current}>
                <button type="button" className={o.value === current ? "is-on" : ""} onClick={() => go(o.value)}>
                  <span>{o.label}</span>
                  <small>{o.dates}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`rp-btn${o.value === current ? " is-on" : ""}`}
          aria-pressed={o.value === current}
          onClick={() => go(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
