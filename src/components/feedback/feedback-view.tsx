"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  PieChart,
  SlidersHorizontal,
  Star,
  Tag,
  type LucideIcon,
} from "lucide-react";

import "../reports/reports.css";
import "./feedback.css";

/**
 * Presentation + interaction for the owner Feedback dashboard. All figures
 * (averages, complaints, distribution) arrive pre-computed from
 * buildFeedbackReport; here we only filter, sort and display them.
 */

export type FeedbackRow = {
  id: string;
  orderId: string;
  tableLabel: string;
  submittedAt: number;
  dateText: string;
  language: string;
  languageName: string;
  food: number;
  service: number;
  ordering: number;
  /** Mean of the three ratings (same definition as the KPI). */
  overall: number;
  comment: string | null;
  device: {
    overall: number;
    foodTaste: number;
    deviceUsability: number;
    items: { name: string; rating: number }[];
  } | null;
};

export type FeedbackViewData = {
  total: number;
  averageRating: number;
  categories: { name: string; average: number; lowCount: number }[];
  mostCommonProblem: { name: string; count: number } | null;
  complaintCount: number;
  distribution: { stars: number; count: number; percent: number }[];
  rows: FeedbackRow[];
  periodLabel: string;
};

const LOW = 2;
const PAGE = 10;
const CATEGORY_FIELD: Record<string, "food" | "service" | "ordering"> = {
  Food: "food",
  Service: "service",
  "Ordering experience": "ordering",
};
const STAR_COLORS: Record<number, string> = {
  5: "#b6ff00",
  4: "#86c91a",
  3: "#4f8f12",
  2: "#f5c451",
  1: "#ff5c5c",
};

/* ------------------------------ helpers ------------------------------ */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const oneDp = (n: number) => n.toFixed(1);
const isComplaint = (r: FeedbackRow) => Math.min(r.food, r.service, r.ordering) <= LOW;

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  const row = (
    <span className="row">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} strokeWidth={1.5} aria-hidden />
      ))}
    </span>
  );
  return (
    <span className="fb-stars" style={{ ["--s" as string]: `${size}px` }} role="img" aria-label={`${oneDp(value)} out of 5 stars`}>
      <span className="off">{row}</span>
      <span className="on" style={{ width: `${pct}%` }}>
        {row}
      </span>
    </span>
  );
}

function CardHead({ icon: Icon, title, right }: { icon: LucideIcon; title: string; right?: React.ReactNode }) {
  return (
    <div className="rp-card-head">
      <h2>
        <Icon aria-hidden strokeWidth={1.75} />
        <span>{title}</span>
      </h2>
      {right}
    </div>
  );
}

/* --------------------------- detail modal ---------------------------- */

function DetailModal({
  row,
  index,
  count,
  onClose,
  onStep,
}: {
  row: FeedbackRow;
  index: number;
  count: number;
  onClose: () => void;
  onStep: (d: -1 | 1) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onStep(-1);
      if (e.key === "ArrowRight") onStep(1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onStep]);

  const lines: [string, number][] = [
    ["Food", row.food],
    ["Service", row.service],
    ["Ordering experience", row.ordering],
  ];

  return (
    <div className="rp fb-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fb-modal" role="dialog" aria-modal="true" aria-label={`Feedback from ${row.tableLabel}`}>
        <div className="fb-modal-head">
          <div>
            <h3>{row.tableLabel}</h3>
            <p>
              {row.dateText} · {row.languageName}
            </p>
          </div>
          <button ref={closeRef} type="button" className="fb-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="fb-grid">
          <div className="fb-line">
            <span className="lbl">Overall</span>
            <span className="fb-rate">
              <Stars value={row.overall} />
              <b>{oneDp(row.overall)}</b>
            </span>
          </div>
          {lines.map(([label, v]) => (
            <div key={label} className="fb-line">
              <span className="lbl">{label}</span>
              <span className="fb-rate">
                <Stars value={v} />
                <b className={v <= LOW ? "fb-low" : undefined}>{v}</b>
                <span>/ 5</span>
              </span>
            </div>
          ))}
        </div>

        {row.device && (
          <>
            <h4 className="fb-h4">On-device ratings (out of 10)</h4>
            <div className="fb-grid">
              <div className="fb-line">
                <span className="lbl">Restaurant overall</span>
                <b>{row.device.overall} / 10</b>
              </div>
              <div className="fb-line">
                <span className="lbl">Food taste</span>
                <b>{row.device.foodTaste} / 10</b>
              </div>
              <div className="fb-line">
                <span className="lbl">Ordering device</span>
                <b>{row.device.deviceUsability} / 10</b>
              </div>
              {row.device.items.map((it, i) => (
                <div key={`${it.name}-${i}`} className="fb-line">
                  <span className="lbl">{it.name}</span>
                  <b>{it.rating} / 10</b>
                </div>
              ))}
            </div>
          </>
        )}

        <h4 className="fb-h4">Customer comment</h4>
        {row.comment ? <p className="fb-comment">{row.comment}</p> : <p className="fb-comment fb-none">No comment left.</p>}

        <div className="fb-meta">
          <span>Order {row.orderId}</span>
        </div>

        <div className="fb-modal-foot">
          <button type="button" className="rp-btn" onClick={() => onStep(-1)} disabled={index <= 0} aria-label="Previous feedback">
            <ChevronLeft aria-hidden /> Previous
          </button>
          <span className="fb-count" style={{ alignSelf: "center" }}>
            {index + 1} of {count}
          </span>
          <button type="button" className="rp-btn" onClick={() => onStep(1)} disabled={index >= count - 1} aria-label="Next feedback">
            Next <ChevronRight aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ donut -------------------------------- */

const SIZE = 170;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function RatingDonut({
  data,
  activeStar,
  onPick,
}: {
  data: FeedbackViewData;
  activeStar: number | null;
  onPick: (stars: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const focusStar = hover ?? activeStar;
  const focus = data.distribution.find((d) => d.stars === focusStar);

  let acc = 0;
  const slices = data.distribution.map((d) => {
    const frac = data.total > 0 ? d.count / data.total : 0;
    const s = { ...d, dash: frac * C, offset: acc };
    acc += frac * C;
    return s;
  });

  return (
    <div className="rp-card" id="fb-distribution">
      <CardHead icon={PieChart} title="Rating Distribution" />
      {data.total === 0 ? (
        <div className="rp-empty">No feedback in this period.</div>
      ) : (
        <div className="rp-donut-wrap">
          <div className="rp-donut">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Rating distribution" onMouseLeave={() => setHover(null)}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={STROKE} />
              {slices
                .filter((s) => s.count > 0)
                .map((s) => (
                  <circle
                    key={s.stars}
                    className="seg"
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={STAR_COLORS[s.stars]}
                    strokeWidth={focusStar === s.stars ? STROKE + 4 : STROKE}
                    strokeDasharray={`${s.dash} ${C - s.dash}`}
                    strokeDashoffset={-s.offset}
                    opacity={focusStar !== null && focusStar !== s.stars ? 0.35 : 1}
                    onMouseEnter={() => setHover(s.stars)}
                    onClick={() => onPick(s.stars)}
                  >
                    <title>{`${s.stars}★: ${plural(s.count, "review")} (${s.percent}%)`}</title>
                  </circle>
                ))}
            </svg>
            <div className="rp-donut-mid">
              <strong>{focus ? `${focus.percent}%` : data.total}</strong>
              <span>{focus ? `${focus.stars}★ · ${plural(focus.count, "review")}` : plural(data.total, "review").replace(/^\d+ /, "")}</span>
            </div>
          </div>
          <ul className="rp-legend">
            {data.distribution.map((d) => (
              <li key={d.stars}>
                <button
                  type="button"
                  className={activeStar === d.stars ? "is-on" : ""}
                  aria-pressed={activeStar === d.stars}
                  onMouseEnter={() => setHover(d.stars)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onPick(d.stars)}
                  title={`Show only ${d.stars}★ reviews`}
                >
                  <span>
                    <i style={{ background: STAR_COLORS[d.stars] }} />
                    {d.stars} ★
                  </span>
                  <span className="amt">
                    {d.percent}% <span style={{ color: "var(--rp-muted)" }}>({d.count})</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="fb-note">Each review counts once, by the average of its food, service and ordering ratings, rounded. Click a slice to filter the table.</p>
    </div>
  );
}

/* ------------------------------ main view ---------------------------- */

type Quick = "all" | "complaints" | "comments";
type SortKey = "date" | "table" | "language" | "food" | "service" | "ordering";

const COLS: { key: SortKey; label: string }[] = [
  { key: "table", label: "Table" },
  { key: "date", label: "Date & Time" },
  { key: "language", label: "Language" },
  { key: "food", label: "Food" },
  { key: "service", label: "Service" },
  { key: "ordering", label: "Ordering" },
];

export function FeedbackView({ data }: { data: FeedbackViewData }) {
  const [quick, setQuick] = useState<Quick>("all");
  const [problem, setProblem] = useState<string | null>(null); // category with low ratings
  const [star, setStar] = useState<number | null>(null);
  const [lang, setLang] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Always offer the three supported customer languages, even when the
  // selected date range has no reviews in one of them. Preserve any additional
  // languages already present in stored feedback instead of hiding them.
  const languages = useMemo(() => {
    const m = new Map<string, string>([
      ["en", "English"],
      ["te", "Telugu"],
      ["hi", "Hindi"],
    ]);
    for (const r of data.rows) {
      if (!m.has(r.language)) m.set(r.language, r.languageName);
    }
    return [...m.entries()];
  }, [data.rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data.rows.filter((r) => {
      if (quick === "complaints" && !isComplaint(r)) return false;
      if (quick === "comments" && !r.comment) return false;
      if (problem && r[CATEGORY_FIELD[problem]] > LOW) return false;
      if (star !== null && Math.min(5, Math.max(1, Math.round(r.overall))) !== star) return false;
      if (lang !== "all" && r.language !== lang) return false;
      if (q && !`${r.comment ?? ""} ${r.tableLabel}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let d: number;
      switch (sort.key) {
        case "date":
          d = a.submittedAt - b.submittedAt;
          break;
        case "table":
          d = a.tableLabel.localeCompare(b.tableLabel, undefined, { numeric: true });
          break;
        case "language":
          d = a.languageName.localeCompare(b.languageName);
          break;
        default:
          d = a[sort.key] - b[sort.key];
      }
      return (d || a.submittedAt - b.submittedAt) * dir;
    });
  }, [data.rows, quick, problem, star, lang, query, sort]);

  const filtersActive = quick !== "all" || problem !== null || star !== null || lang !== "all" || query.trim() !== "";
  const resetFilters = () => {
    setQuick("all");
    setProblem(null);
    setStar(null);
    setLang("all");
    setQuery("");
    setLimit(PAGE);
  };

  const scrollToTable = () => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const apply = (fn: () => void) => {
    fn();
    setLimit(PAGE);
    scrollToTable();
  };

  const openIndex = openId ? filtered.findIndex((r) => r.id === openId) : -1;
  const openRow = openIndex >= 0 ? filtered[openIndex] : null;
  const closeModal = useCallback(() => setOpenId(null), []);
  const stepModal = useCallback(
    (d: -1 | 1) => {
      const next = filtered[openIndex + d];
      if (next) setOpenId(next.id);
    },
    [filtered, openIndex],
  );

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "table" || key === "language" ? "asc" : "desc" }));

  const empty = data.total === 0;
  const catField = (name: string) => (sort.key === CATEGORY_FIELD[name] ? true : false);

  return (
    <div className="rp-stack">
      {/* KPI row */}
      <div className="fb-kpis">
        <button
          type="button"
          className="rp-kpi"
          title="Show all reviews"
          onClick={() => apply(resetFilters)}
        >
          <span className="rp-kpi-ico">
            <Star aria-hidden strokeWidth={1.75} />
          </span>
          <span className="rp-kpi-txt">
            <p className="rp-kpi-val">
              {empty ? "—" : oneDp(data.averageRating)} <small style={{ fontSize: 13, color: "var(--rp-muted)", fontWeight: 400 }}>/ 5</small>
            </p>
            <p className="rp-kpi-lbl">Average Rating</p>
            <span className="fb-kpi-sub">
              <Stars value={empty ? 0 : data.averageRating} size={13} />
              <span className="rp-kpi-hint">{plural(data.total, "review")}</span>
            </span>
          </span>
        </button>

        <button
          type="button"
          className={`rp-kpi${quick === "complaints" ? " is-active" : ""}`}
          aria-pressed={quick === "complaints"}
          title="Show complaints only"
          onClick={() => apply(() => setQuick((q) => (q === "complaints" ? "all" : "complaints")))}
        >
          <span className="rp-kpi-ico">
            <AlertTriangle aria-hidden strokeWidth={1.75} />
          </span>
          <span className="rp-kpi-txt">
            <p className="rp-kpi-val">{data.complaintCount}</p>
            <p className="rp-kpi-lbl">Total Complaints</p>
            <p className="rp-kpi-hint">(Any rating ≤ 2★)</p>
          </span>
        </button>

        <button
          type="button"
          className={`rp-kpi${problem ? " is-active" : ""}`}
          aria-pressed={problem !== null}
          disabled={!data.mostCommonProblem}
          title={data.mostCommonProblem ? `Show low ${data.mostCommonProblem.name} ratings` : "No problems reported"}
          onClick={() =>
            data.mostCommonProblem &&
            apply(() => setProblem((p) => (p === data.mostCommonProblem!.name ? null : data.mostCommonProblem!.name)))
          }
        >
          <span className="rp-kpi-ico">
            <Tag aria-hidden strokeWidth={1.75} />
          </span>
          <span className="rp-kpi-txt">
            <p className="rp-kpi-val">{data.mostCommonProblem ? data.mostCommonProblem.name : "None"}</p>
            <p className="rp-kpi-lbl">Most Common Problem</p>
            <p className="rp-kpi-hint">
              {data.mostCommonProblem ? `(${plural(data.mostCommonProblem.count, "low rating")})` : "(No problems reported)"}
            </p>
          </span>
        </button>
      </div>

      {/* Middle section */}
      <div className="fb-row">
        <div className="rp-card" id="fb-categories">
          <CardHead icon={SlidersHorizontal} title="Rating by Category" />
          {empty ? (
            <div className="rp-empty">No feedback in this period.</div>
          ) : (
            <div className="fb-cats">
              {data.categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={`fb-cat${catField(c.name) && sort.dir === "asc" ? " is-on" : ""}`}
                  title={`Sort reviews by ${c.name} (lowest first)`}
                  onClick={() => {
                    setSort({ key: CATEGORY_FIELD[c.name], dir: "asc" });
                    scrollToTable();
                  }}
                >
                  <span>
                    {c.name}
                    <small>{plural(c.lowCount, "low rating")}</small>
                  </span>
                  <span className="fb-track" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Number(oneDp(c.average))} aria-label={`${c.name} average`}>
                    <span className="fb-fill" style={{ width: `${(c.average / 5) * 100}%` }} />
                  </span>
                  <b>{oneDp(c.average)}</b>
                </button>
              ))}
            </div>
          )}
          <p className="fb-note">Average ratings out of 5 for {data.periodLabel === "All time" ? "all time" : data.periodLabel}. Click a category to sort the table by it.</p>
        </div>

        <RatingDonut data={data} activeStar={star} onPick={(s) => apply(() => setStar((cur) => (cur === s ? null : s)))} />
      </div>

      {/* Recent feedback */}
      <div className="rp-card" id="fb-recent" ref={tableRef}>
        <CardHead
          icon={Star}
          title="Recent Feedback"
          right={
            <span className="fb-count">
              {filtered.length === data.rows.length ? plural(data.rows.length, "review") : `${filtered.length} of ${data.rows.length}`}
            </span>
          }
        />

        <div className="fb-toolbar">
          <div className="fb-seg" role="group" aria-label="Quick filter">
            {(
              [
                ["all", "All"],
                ["complaints", "Complaints"],
                ["comments", "With comments"],
              ] as [Quick, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" className={quick === k ? "is-on" : ""} aria-pressed={quick === k} onClick={() => { setQuick(k); setLimit(PAGE); }}>
                {label}
              </button>
            ))}
          </div>
          <select
            className="fb-select"
            value={lang}
            onChange={(e) => { setLang(e.target.value); setLimit(PAGE); }}
            aria-label="Filter by language"
            disabled={languages.length === 0}
          >
            <option value="all">All languages</option>
            {languages.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <input
            className="fb-input"
            type="search"
            placeholder="Search comments or table…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            aria-label="Search feedback"
          />
          <span className="fb-spacer" />
          {filtersActive && (
            <button type="button" className="rp-link" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>

        {(problem || star !== null) && (
          <div className="fb-chips">
            {problem && (
              <button type="button" className="fb-chip" onClick={() => setProblem(null)} title="Remove filter">
                Low {problem} ratings ×
              </button>
            )}
            {star !== null && (
              <button type="button" className="fb-chip" onClick={() => setStar(null)} title="Remove filter">
                {star}★ reviews ×
              </button>
            )}
          </div>
        )}

        {empty ? (
          <div className="rp-empty">No feedback has been submitted in this period. Try another date range.</div>
        ) : filtered.length === 0 ? (
          <div className="rp-empty">
            No reviews match these filters.&nbsp;
            <button type="button" className="rp-link" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="rp-tablewrap">
              <table className="rp-table fb-table">
                <thead>
                  <tr>
                    {COLS.map((c) => {
                      const on = sort.key === c.key;
                      return (
                        <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" className={on ? "is-on" : ""} onClick={() => sortBy(c.key)}>
                            {c.label}
                            <i aria-hidden>{on ? (sort.dir === "asc" ? "▲" : "▼") : ""}</i>
                          </button>
                        </th>
                      );
                    })}
                    <th scope="col">Customer Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, limit).map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open feedback from ${r.tableLabel}`}
                      onClick={() => setOpenId(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(r.id);
                        }
                      }}
                    >
                      <td>{r.tableLabel}</td>
                      <td>{r.dateText}</td>
                      <td>{r.languageName}</td>
                      {([r.food, r.service, r.ordering] as number[]).map((v, i) => (
                        <td key={i}>
                          <span className="fb-rate">
                            <Stars value={v} size={13} />
                            <span className={v <= LOW ? "fb-low" : undefined}>{v}</span>
                          </span>
                        </td>
                      ))}
                      <td className="cm">{r.comment ? <span className="fb-clamp">{r.comment}</span> : <span className="fb-none">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > limit && (
              <div className="fb-more">
                <button type="button" className="rp-btn" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({filtered.length - limit} left)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {openRow && <DetailModal row={openRow} index={openIndex} count={filtered.length} onClose={closeModal} onStep={stepModal} />}
    </div>
  );
}
