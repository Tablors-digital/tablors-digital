import "@/components/reports/reports.css";

export default function Loading() {
  return (
    <div className="rp" aria-busy="true" aria-label="Loading reports">
      <div className="rp-skel" style={{ height: 48, width: 280, marginBottom: 16 }} />
      <div className="rp-stack">
        <div className="rp-kpis">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rp-skel" style={{ height: 84 }} />
          ))}
        </div>
        <div className="rp-row analytics">
          <div className="rp-skel" style={{ height: 250 }} />
          <div className="rp-skel" style={{ height: 250 }} />
        </div>
        <div className="rp-row middle">
          <div className="rp-skel" style={{ height: 180 }} />
          <div className="rp-skel" style={{ height: 180 }} />
        </div>
      </div>
    </div>
  );
}
