"use client";

import "@/components/reports/reports.css";
import "@/components/feedback/feedback.css";

export default function FeedbackError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rp" role="alert">
      <div className="rp-card fb-error">
        <h1 style={{ margin: 0, fontSize: 20, color: "#fff" }}>Customer Feedback</h1>
        <p>Something went wrong while loading feedback.</p>
        <button type="button" className="rp-btn is-on" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
