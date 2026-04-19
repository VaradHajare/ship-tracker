export default function StatsBar({ stats, loading, lastUpdate }) {
  const top = stats?.byType
    ? Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];

  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-value">{loading ? '—' : (stats?.total ?? 0).toLocaleString()}</span>
        <span className="stat-label">vessels</span>
      </div>
      {top.map(([type, count]) => (
        <div key={type} className="stat-item stat-type">
          <span className="stat-value">{count.toLocaleString()}</span>
          <span className="stat-label">{type}</span>
        </div>
      ))}
      {lastUpdate && (
        <div className="stat-item stat-time">
          Updated {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
