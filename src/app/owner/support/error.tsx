"use client";

import "@/components/reports/reports.css";
import "@/components/feedback/feedback.css";

// An error page cannot know the saved language, so it says the same thing in all three.
export default function SupportError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rp" role="alert">
      <div className="rp-card fb-error">
        <h1 style={{ margin: 0, fontSize: 20, color: "#fff" }}>Support · సపోర్ట్ · सहायता</h1>
        <p>Something went wrong while loading support tickets.</p>
        <p>సపోర్ట్ టికెట్లను లోడ్ చేయడంలో ఏదో తప్పు జరిగింది.</p>
        <p>सहायता टिकट लोड करते समय कुछ गड़बड़ हो गई।</p>
        <button type="button" className="rp-btn is-on" onClick={reset}>
          Try again · మళ్లీ ప్రయత్నించండి · फिर कोशिश करें
        </button>
      </div>
    </div>
  );
}
