import { useState, useMemo } from 'react';
import { Search, X, SlidersHorizontal, Navigation, ChevronDown } from 'lucide-react';
import { getVesselCountry } from '../utils/country';

const TYPE_COLORS = {
  'Cargo': '#1d4ed8', 'Tanker': '#b91c1c', 'Passenger': '#7c3aed',
  'Fishing': '#15803d', 'Tug/Dredger': '#b45309', 'SAR/Military': '#dc2626',
  'High Speed': '#6d28d9', 'Sailing/Leisure': '#0891b2',
  'Port/Service': '#c2410c', 'Other': '#475569',
};

function getColor(label) { return TYPE_COLORS[label] || '#475569'; }

export default function Sidebar({
  vessels, allVessels, selected, onSelect,
  filter, onFilterChange, typeFilter, onTypeFilterChange,
  vesselTypes, loading, stats,
}) {
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [showFilters, setShowFilters] = useState(false);

  const sorted = useMemo(() => {
    const list = [...vessels];
    return list.sort((a, b) => {
      let vA, vB;
      if (sortKey === 'sog')     { vA = Number(a.sog)||0; vB = Number(b.sog)||0; }
      else if (sortKey === 'updated') { vA = a.updatedAt||0; vB = b.updatedAt||0; }
      else { vA = (a.name||`MMSI ${a.mmsi}`).toLowerCase(); vB = (b.name||`MMSI ${b.mmsi}`).toLowerCase(); }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [vessels, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Top 6 types for quick filter
  const quickTypes = useMemo(() => {
    const counts = {};
    allVessels.forEach(v => {
      const t = v.typeLabel || 'Other';
      counts[t] = (counts[t] || 0) + 1;
    });
    return ['All', ...Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0])];
  }, [allVessels]);

  return (
    <div className="sidebar-root">
      {/* Search bar */}
      <div className="sb-search-area">
        <div className="sb-search-wrap">
          <Search size={14} className="sb-search-icon" />
          <input
            className="sb-search-input"
            placeholder="Search vessel, MMSI, destination…"
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
          />
          {filter && (
            <button className="sb-clear-btn" onClick={() => onFilterChange('')}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          className={`sb-filter-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(f => !f)}
          title="Filters"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Type quick-badges */}
      <div className="sb-type-scroll">
        {quickTypes.map(t => (
          <button
            key={t}
            className={`sb-type-chip ${typeFilter === t ? 'active' : ''}`}
            style={typeFilter === t && t !== 'All' ? {
              background: `${getColor(t)}15`,
              borderColor: `${getColor(t)}40`,
              color: getColor(t),
            } : {}}
            onClick={() => onTypeFilterChange(t)}
          >
            {t !== 'All' && <span className="chip-dot" style={{ background: getColor(t) }} />}
            {t}
          </button>
        ))}
      </div>

      {/* Expanded filter panel */}
      {showFilters && (
        <div className="sb-filter-panel">
          <label className="sb-filter-label">Vessel Class</label>
          <div className="sb-select-wrap">
            <select
              className="sb-select"
              value={typeFilter}
              onChange={e => onTypeFilterChange(e.target.value)}
            >
              {vesselTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            <ChevronDown size={13} className="sb-select-arrow" />
          </div>
        </div>
      )}

      {/* Sort bar */}
      <div className="sb-sort-bar">
        <span className="sb-sort-label">Sort:</span>
        {[['name','Name'],['sog','Speed'],['updated','Recent']].map(([key, label]) => (
          <button
            key={key}
            className={`sb-sort-btn ${sortKey === key ? 'active' : ''}`}
            onClick={() => toggleSort(key)}
          >
            {label}
            {sortKey === key && <span>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
          </button>
        ))}
        <span className="sb-count">
          {loading ? '…' : `${vessels.length}/${allVessels.length}`}
        </span>
      </div>

      {/* Vessel list */}
      <ul className="sb-list">
        {sorted.slice(0, 100).map(v => {
          const isSel = String(selected?.mmsi) === String(v.mmsi);
          const spd = Number(v.sog || 0);
          const spdClass = spd > 18 ? 'fast' : spd > 8 ? 'med' : spd > 0.5 ? 'slow' : 'stopped';
          const color = getColor(v.typeLabel);
          const cog = v.cog != null ? Math.round(v.cog) : 0;
          const country = getVesselCountry(v.mmsi);

          return (

            <li
              key={v.mmsi}
              className={`sb-vessel-item ${isSel ? 'selected' : ''}`}
              onClick={() => onSelect(v)}
              style={isSel ? { borderLeft: `3px solid ${color}` } : {}}
            >
              {/* Arrow rotated to heading */}
              <div
                className="sv-arrow"
                style={{ color, transform: `rotate(${cog}deg)` }}
              >
                <Navigation size={13} fill={isSel ? color : 'none'} />
              </div>

              <div className="sv-info">
                <div className="sv-top-row">
                  <span className="sv-name-wrap">
                    <span className="sv-flag" title={country.name}>{country.flag}</span>
                    <span className="sv-name">{v.name || `MMSI ${v.mmsi}`}</span>
                  </span>
                  {spd > 0.3 && (
                    <span className={`sv-speed ${spdClass}`}>
                      {spd.toFixed(1)} kn
                    </span>
                  )}
                </div>

                <div className="sv-bot-row">
                  <span className="sv-type" style={{ color }}>
                    <span className="sv-type-dot" style={{ background: color }} />
                    {v.typeLabel || 'Unknown'}
                  </span>
                  {v.destination && (
                    <span className="sv-dest">→ {v.destination}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}

        {sorted.length > 100 && (
          <li className="sb-overflow-msg">+{sorted.length - 100} more — refine search to narrow results</li>
        )}

        {sorted.length === 0 && !loading && (
          <li className="sb-empty">
            <div className="sb-empty-icon">🔍</div>
            <div className="sb-empty-text">No vessels match</div>
            <button className="sb-empty-reset" onClick={() => { onFilterChange(''); onTypeFilterChange('All'); }}>
              Clear Filters
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
