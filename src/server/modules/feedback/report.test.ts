import { describe, expect, it } from "vitest";

import { buildFeedbackReport, getFeedbackRange, istDayStart, parseFeedbackFilter } from "./report";
import type { Feedback } from "./store";

const IST = 330 * 60 * 1000;
const ist = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h) - IST;
const NOW = ist(2026, 9, 16, 15); // Wed 16 Sep 2026, 3 PM IST

const fb = (id: string, at: number, food: number, service: number, ordering: number, comment: string | null = null): Feedback => ({
  id,
  orderId: id,
  tableId: "t01",
  foodRating: food,
  serviceRating: service,
  orderingRating: ordering,
  comment,
  submittedAt: at,
});

const data = [
  fb("a", ist(2026, 9, 16, 10), 5, 5, 5),
  fb("b", ist(2026, 9, 16, 12), 1, 4, 4, "cold food"),
  fb("c", ist(2026, 9, 15, 20), 3, 2, 3),
  fb("d", ist(2026, 9, 1, 9), 4, 4, 4),
  fb("e", ist(2026, 8, 30, 9), 2, 2, 2),
];

describe("parseFeedbackFilter", () => {
  it("accepts periods, valid dates, and falls back to month", () => {
    expect(parseFeedbackFilter({ period: "all" })).toEqual({ kind: "period", period: "all" });
    expect(parseFeedbackFilter({ date: "2026-09-15" })).toEqual({ kind: "date", date: "2026-09-15" });
    expect(parseFeedbackFilter({ date: "2026-02-31" })).toEqual({ kind: "period", period: "month" });
    expect(parseFeedbackFilter({ period: "bogus" })).toEqual({ kind: "period", period: "month" });
  });
});

describe("buildFeedbackReport", () => {
  it("filters by period and sorts newest first", () => {
    const today = buildFeedbackReport(data, getFeedbackRange({ kind: "period", period: "today" }, NOW));
    expect(today.feedback.map((f) => f.id)).toEqual(["b", "a"]);
    const month = buildFeedbackReport(data, getFeedbackRange({ kind: "period", period: "month" }, NOW));
    expect(month.total).toBe(4);
    const all = buildFeedbackReport(data, getFeedbackRange({ kind: "period", period: "all" }, NOW));
    expect(all.total).toBe(5);
  });

  it("supports any single IST date", () => {
    const r = buildFeedbackReport(data, getFeedbackRange({ kind: "date", date: "2026-09-15" }, NOW));
    expect(r.feedback.map((f) => f.id)).toEqual(["c"]);
    expect(istDayStart("2026-09-15")).toBe(ist(2026, 9, 15));
  });

  it("computes averages, complaints, problem and distribution from the data", () => {
    const r = buildFeedbackReport(data, getFeedbackRange({ kind: "period", period: "week" }, NOW));
    expect(r.total).toBe(3); // a, b, c
    expect(r.categories.find((c) => c.name === "Food")!.average).toBeCloseTo(3);
    expect(r.complaintCount).toBe(2); // b (food 1), c (service 2)
    expect(r.mostCommonProblem).toEqual({ name: "Food", count: 1 });
    expect(r.distribution.map((d) => d.count)).toEqual([1, 0, 2, 0, 0]); // 5★: a · 3★: b (3.0) and c (2.67 rounds to 3)
    expect(r.distribution.reduce((s, d) => s + d.count, 0)).toBe(r.total);
  });

  it("returns zeros for an empty range", () => {
    const r = buildFeedbackReport(data, getFeedbackRange({ kind: "date", date: "2026-01-01" }, NOW));
    expect(r.total).toBe(0);
    expect(r.averageRating).toBe(0);
    expect(r.mostCommonProblem).toBeNull();
  });
});
