import { MessageSquareText } from "lucide-react";

import "@/components/feedback/feedback.css";
import "@/components/reports/reports.css";
import { FeedbackControls, type FeedbackPeriodOption } from "@/components/feedback/feedback-controls";
import { FeedbackView, type FeedbackRow } from "@/components/feedback/feedback-view";
import { DEMO_RESTAURANT_ID, requirePermission } from "@/server/modules/auth/session";
import { getTablesDb } from "@/server/modules/data/tables-db";
import { FEEDBACK_LANGUAGE_NAMES } from "@/server/modules/feedback/i18n";
import {
  FEEDBACK_PERIODS,
  FEEDBACK_PERIOD_LABELS,
  buildFeedbackReport,
  getFeedbackRange,
  overallRating,
  parseFeedbackFilter,
} from "@/server/modules/feedback/report";
import { listFeedback } from "@/server/modules/feedback/store";

export const dynamic = "force-dynamic";

const IST = "Asia/Kolkata";

const normalizeFeedbackLanguage = (value: string | null | undefined) => {
  const raw = (value ?? "en").trim();
  const code = raw.toLowerCase().replaceAll("_", "-");
  if (["en", "eng", "english", "en-in", "en-us", "en-gb"].includes(code) || code.startsWith("en-")) return "en";
  if (["te", "tel", "telugu", "తెలుగు", "te-in"].includes(code) || code.startsWith("te-")) return "te";
  if (["hi", "hin", "hindi", "हिन्दी", "हिंदी", "hi-in"].includes(code) || code.startsWith("hi-")) return "hi";
  return raw;
};

const FEEDBACK_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  te: "Telugu",
  hi: "Hindi",
};

const currentTimestamp = () => Date.now();

const dmy = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "2-digit", month: "2-digit", year: "numeric" })
    .format(ms)
    .replaceAll("/", "-");

const iso = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

const dateTime = new Intl.DateTimeFormat("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short" });

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[]; date?: string | string[] }>;
}) {
  await requirePermission("feedback");

  const params = await searchParams;
  const filter = parseFeedbackFilter(params);
  const now = currentTimestamp();

  const [all, tables] = await Promise.all([listFeedback(), getTablesDb(DEMO_RESTAURANT_ID)]);
  const range = getFeedbackRange(filter, now);
  const report = buildFeedbackReport(all, range);
  const tableLabels = new Map(tables.map((t) => [t.id, t.label]));

  const options: FeedbackPeriodOption[] = FEEDBACK_PERIODS.map((p) => {
    const r = getFeedbackRange({ kind: "period", period: p }, now);
    const dates = !r ? "Every review" : p === "today" || p === "yesterday" ? dmy(r.start) : `${dmy(r.start)} – ${dmy(r.end)}`;
    return { value: p, label: FEEDBACK_PERIOD_LABELS[p], dates };
  });

  const current = filter.kind === "period" ? filter.period : "";
  const periodLabel =
    filter.kind === "date" ? dmy(range!.start) : FEEDBACK_PERIOD_LABELS[filter.period];
  const summary =
    filter.kind === "date"
      ? `Date • ${dmy(range!.start)}`
      : `${FEEDBACK_PERIOD_LABELS[filter.period]} • ${options.find((o) => o.value === filter.period)!.dates}`;

  const rows: FeedbackRow[] = report.feedback.map((f) => {
    const rawLanguage = f.language ?? "en";
    const language = normalizeFeedbackLanguage(rawLanguage);
    return {
      id: f.id,
      orderId: f.orderId,
      tableLabel: tableLabels.get(f.tableId) ?? `Table ${f.tableId}`,
      submittedAt: f.submittedAt,
      dateText: dateTime.format(new Date(f.submittedAt)),
      language,
      languageName:
        FEEDBACK_LANGUAGE_LABELS[language] ??
        FEEDBACK_LANGUAGE_NAMES[rawLanguage as keyof typeof FEEDBACK_LANGUAGE_NAMES] ??
        FEEDBACK_LANGUAGE_NAMES[language as keyof typeof FEEDBACK_LANGUAGE_NAMES] ??
        rawLanguage,
      food: f.foodRating,
      service: f.serviceRating,
      ordering: f.orderingRating,
      overall: overallRating(f),
      comment: f.comment,
      device: f.deviceRatings
        ? {
            overall: f.deviceRatings.overall,
            foodTaste: f.deviceRatings.foodTaste,
            deviceUsability: f.deviceRatings.deviceUsability,
            items: f.deviceRatings.items.map((i) => ({ name: i.name, rating: i.rating })),
          }
        : null,
    };
  });

  return (
    <div className="rp">
      <div className="rp-head fb-head">
        <div className="rp-title">
          <MessageSquareText aria-hidden strokeWidth={1.75} />
          <div>
            <h1>Customer Feedback</h1>
            <p>What guests say about your food, service and ordering experience.</p>
          </div>
        </div>
        <FeedbackControls
          options={options}
          current={current}
          customDate={filter.kind === "date" ? filter.date : null}
          maxDate={iso(now)}
          summary={summary}
        />
      </div>

      <FeedbackView
        key={filter.kind === "date" ? filter.date : filter.period}
        data={{
          total: report.total,
          averageRating: report.averageRating,
          categories: report.categories,
          mostCommonProblem: report.mostCommonProblem,
          complaintCount: report.complaintCount,
          distribution: report.distribution,
          rows,
          periodLabel,
        }}
      />
    </div>
  );
}