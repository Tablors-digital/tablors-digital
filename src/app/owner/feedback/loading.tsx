import "@/components/reports/reports.css";
import "@/components/feedback/feedback.css";

export default function Loading() {
  return (
    <div className="rp" aria-busy="true" aria-label="Loading feedback">
      <div className="rp-skel" style={{ height: 48, width: 320, marginBottom: 16 }} />
      <div className="rp-stack">
        <div className="fb-kpis">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rp-skel" style={{ height: 84 }} />
          ))}
        </div>
        <div className="fb-row">
          <div className="rp-skel" style={{ height: 240 }} />
          <div className="rp-skel" style={{ height: 240 }} />
        </div>
        <div className="rp-skel" style={{ height: 300 }} />
      </div>
    </div>
  );
}
