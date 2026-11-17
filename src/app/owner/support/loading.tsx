import "@/components/reports/reports.css";
import "./support.css";

export default function Loading() {
  return (
    <div className="rp" aria-busy="true" aria-label="Loading">
      <div className="rp-skel" style={{ height: 48, width: 320, marginBottom: 16 }} />
      <div className="rp-stack">
        <div className="sp-kpis">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rp-skel" style={{ height: 84 }} />
          ))}
        </div>
        <div className="rp-skel" style={{ height: 380 }} />
      </div>
    </div>
  );
}
