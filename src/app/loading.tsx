/** Lightweight skeleton so slow data never looks like a blank/broken page. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading view">
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div className="skeleton skeleton-kpi" key={i} />
        ))}
      </div>
      <div className="grid cols-2">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    </div>
  );
}
