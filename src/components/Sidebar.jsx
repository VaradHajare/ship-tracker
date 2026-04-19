export default function Sidebar({
  vessels, selected, onSelect,
  filter, onFilterChange,
  typeFilter, onTypeFilterChange, vesselTypes,
  loading,
}) {
  return (
    <div className="sidebar-inner">
      <div className="sidebar-search">
        <input
          className="search-input"
          placeholder="Search name or MMSI…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        <select
          className="type-select"
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
        >
          {vesselTypes.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="vessel-count">
        {loading ? 'Loading…' : `${vessels.length.toLocaleString()} vessels`}
      </div>

      <ul className="vessel-list">
        {vessels.slice(0, 500).map((v) => (
          <li
            key={v.mmsi}
            className={`vessel-item ${selected?.mmsi === v.mmsi ? 'active' : ''}`}
            onClick={() => onSelect(v)}
          >
            <span className="v-dot" style={{ background: v.color || '#6b7280' }} />
            <div className="v-info">
              <div className="v-name">{v.name || `MMSI ${v.mmsi}`}</div>
              <div className="v-meta">
                {v.typeLabel || 'Unknown'}
                {v.sog != null && ` · ${Number(v.sog).toFixed(1)} kn`}
                {v.destination && ` → ${v.destination}`}
              </div>
            </div>
          </li>
        ))}
        {vessels.length > 500 && (
          <li className="vessel-item-more">+ {(vessels.length - 500).toLocaleString()} more — refine filter</li>
        )}
      </ul>
    </div>
  );
}
