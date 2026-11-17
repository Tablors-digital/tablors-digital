import { getPeriodRange, REPORT_PERIODS, type PeriodRange } from "@/server/modules/reports/reports";
import type { Feedback } from "./store";

/**
 * Pure, period-aware feedback calculations for the owner dashboard.
 * Uses exactly the same definitions as insights.ts (overall = mean of the
 * three 1–5 ratings, complaint = any rating <= 2) but over a date range,
 * so it is deterministic and unit-testable. No store imports at runtime.
 */

export const FEEDBACK_PERIODS = [...REPORT_PERIODS, "all"] as const;
export type FeedbackPeriod = (typeof FEEDBACK_PERIODS)[number];

export const FEEDBACK_PERIOD_LABELS: Record<FeedbackPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  all: "All time",
};

export type FeedbackFilter =
  | { kind: "period"; period: FeedbackPeriod }
  | { kind: "date"; date: string }; // YYYY-MM-DD (IST day)

export const DEFAULT_FEEDBACK_PERIOD: FeedbackPeriod = "month";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOW = 2;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Start (ms) of an IST calendar day given as YYYY-MM-DD, or null if invalid. */
export function istDayStart(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return utc - IST_OFFSET_MS;
}

export function parseFeedbackFilter(params: { period?: unknown; date?: unknown }): FeedbackFilter {
  const date = first(params.date);
  if (typeof date === "string" && istDayStart(date) !== null) return { kind: "date", date };
  const period = first(params.period);
  if (typeof period === "string" && (FEEDBACK_PERIODS as readonly string[]).includes(period)) {
    return { kind: "period", period: period as FeedbackPeriod };
  }
  return { kind: "period", period: DEFAULT_FEEDBACK_PERIOD };
}

/** null = no date restriction (all time). */
export function getFeedbackRange(filter: FeedbackFilter, now: number): PeriodRange | null {
  if (filter.kind === "date") {
    const start = istDayStart(filter.date)!;
    return { start, end: start + DAY_MS };
  }
  if (filter.period === "all") return null;
  return getPeriodRange(filter.period, now);
}

export type FeedbackCategoryName = "Food" | "Service" | "Ordering experience";

export type FeedbackReport = {
  total: number;
  averageRating: number;
  categories: { name: FeedbackCategoryName; average: number; lowCount: number }[];
  mostCommonProblem: { name: FeedbackCategoryName; count: number } | null;
  complaintCount: number;
  /** Per-review overall rating (mean of the three, rounded) bucketed 5★ → 1★. */
  distribution: { stars: 1 | 2 | 3 | 4 | 5; count: number; percent: number }[];
  /** Every review in range, newest first. */
  feedback: Feedback[];
};

export const overallRating = (f: Pick<Feedback, "foodRating" | "serviceRating" | "orderingRating">) =>
  (f.foodRating + f.serviceRating + f.orderingRating) / 3;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function buildFeedbackReport(all: readonly Feedback[], range: PeriodRange | null): FeedbackReport {
  const feedback = all
    .filter((f) => !range || (f.submittedAt >= range.start && f.submittedAt < range.end))
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const categories: FeedbackReport["categories"] = [
    { name: "Food", average: avg(feedback.map((f) => f.foodRating)), lowCount: feedback.filter((f) => f.foodRating <= LOW).length },
    { name: "Service", average: avg(feedback.map((f) => f.serviceRating)), lowCount: feedback.filter((f) => f.serviceRating <= LOW).length },
    { name: "Ordering experience", average: avg(feedback.map((f) => f.orderingRating)), lowCount: feedback.filter((f) => f.orderingRating <= LOW).length },
  ];
  const worst = [...categories].sort((a, b) => b.lowCount - a.lowCount || a.average - b.average)[0];

  const counts = [0, 0, 0, 0, 0];
  for (const f of feedback) {
    const bucket = Math.min(5, Math.max(1, Math.round(overallRating(f))));
    counts[bucket - 1] += 1;
  }

  return {
    total: feedback.length,
    averageRating: avg(feedback.map(overallRating)),
    categories,
    mostCommonProblem: worst && worst.lowCount > 0 ? { name: worst.name, count: worst.lowCount } : null,
    complaintCount: feedback.filter((f) => Math.min(f.foodRating, f.serviceRating, f.orderingRating) <= LOW).length,
    distribution: ([5, 4, 3, 2, 1] as const).map((stars) => ({
      stars,
      count: counts[stars - 1],
      percent: feedback.length ? Math.round((counts[stars - 1] / feedback.length) * 100) : 0,
    })),
    feedback,
  };
}
