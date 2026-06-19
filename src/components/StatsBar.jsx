import { Activity } from 'lucide-react';

const TYPE_COLORS = {
  'Cargo': '#3b82f6',
  'Tanker': '#ef4444',
  'Passenger': '#a855f7',
  'Sailing/Leisure': '#10b981',
  'Fishing': '#f59e0b',
  'High Speed': '#06b6d4',
  'Tug/Dredger': '#eab308',
  'SAR/Military': '#f43f5e',
  'Other': '#94a3b8'
};

export default function StatsBar({ stats, loading, lastUpdate }) {
  const top = stats?.byType
    ? Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];

  return (
    <div className="stats-bar-new">
      <div className="stat-item-new total-vessels">
        <span className="stat-val-new">{loading && !stats ? '...' : (stats?.total ?? 0).toLocaleString()}</span>
        <span className="stat-label-new">Active Vessels</span>
      </div>
      
      <div className="stats-grid-types">
        {top.map(([type, count]) => {
          const color = TYPE_COLORS[type] || '#94a3b8';
          return (
            <div key={type} className="stat-item-new stat-type-new" style={{ '--type-color': color }}>
              <span className="stat-val-new">
                <span className="type-dot-indicator" style={{ background: color }} />
                {count.toLocaleString()}
              </span>
              <span className="stat-label-new">{type}</span>
            </div>
          );
        })}
      </div>
      
      {lastUpdate && (
        <div className="stat-time-new">
          <Activity size={10} className="pulse-icon" />
          <span>Sync: {lastUpdate.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}
