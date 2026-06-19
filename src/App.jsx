import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import VesselMap from './components/VesselMap';
import Sidebar from './components/Sidebar';
import { fetchVessels, fetchStats, fetchVessel } from './api';
import { getVesselCountry } from './utils/country';
import {
  RotateCw, Compass, Radio, Anchor,
  Ship, Zap, TrendingUp, Clock, ChevronRight
} from 'lucide-react';
import './App.css';

// Poll interval: 20s is enough for vessel tracking; more frequent = more CPU
const REFRESH_MS = 20_000;
// Remove vessels unseen for more than 5 minutes
const STALE_CUTOFF_MS = 5 * 60 * 1000;

// Type colors matching server classification
const TYPE_META = {
  'Cargo':         { color: '#1d4ed8', icon: '📦' },
  'Tanker':        { color: '#b91c1c', icon: '🛢️' },
  'Passenger':     { color: '#7c3aed', icon: '🚢' },
  'Fishing':       { color: '#15803d', icon: '🎣' },
  'Tug/Dredger':   { color: '#b45309', icon: '⚓' },
  'SAR/Military':  { color: '#dc2626', icon: '🛡️' },
  'High Speed':    { color: '#6d28d9', icon: '⚡' },
  'Sailing/Leisure':{ color: '#0891b2', icon: '⛵' },
  'Port/Service':  { color: '#c2410c', icon: '🔧' },
  'Other':         { color: '#475569', icon: '🚤' },
};

function getTypeColor(label) {
  return TYPE_META[label]?.color || '#475569';
}


export default function App() {
  // vessels stored as a Map (mmsi string → vessel object) so updates merge, never replace
  const vesselMapRef = useRef(new Map());
  const [vessels, setVessels] = useState([]);
  const [selectedMmsi, setSelectedMmsi] = useState(null);
  const [selectedVesselDetails, setSelectedVesselDetails] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const detailFetchRef = useRef(null);

  // ── Selected vessel logic ──────────────────────────────────────────────────
  useEffect(() => {
    if (selectedMmsi === null) {
      setSelectedVesselDetails(null);
      detailFetchRef.current = null;
      return;
    }

    // Immediate: populate from existing map
    const basic = vesselMapRef.current.get(selectedMmsi);
    if (basic) setSelectedVesselDetails(basic);

    // Then fetch full detail (includes history) from server
    const token = Symbol();
    detailFetchRef.current = token;
    fetchVessel(selectedMmsi)
      .then((details) => {
        if (detailFetchRef.current !== token) return;
        if (details?.mmsi != null && !details.error) {
          setSelectedVesselDetails(details);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMmsi]);

  // Patch live position into selected detail on every poll cycle
  useEffect(() => {
    if (!selectedMmsi || !selectedVesselDetails) return;
    const fresh = vesselMapRef.current.get(selectedMmsi);
    if (!fresh) return;
    setSelectedVesselDetails((prev) => prev ? {
      ...prev,
      lat: fresh.lat, lng: fresh.lng,
      sog: fresh.sog, cog: fresh.cog,
      heading: fresh.heading, updatedAt: fresh.updatedAt,
    } : fresh);
  }, [vessels, selectedMmsi]); // 'vessels' triggers this when poll completes

  // ── Selection handler ──────────────────────────────────────────────────────
  const handleSelectVessel = useCallback((vessel) => {
    if (!vessel) {
      setSelectedMmsi(null);
      setSelectedVesselDetails(null);
      return;
    }
    setSelectedMmsi(String(vessel.mmsi));
  }, []);

  // ── Data fetching — MERGE strategy ────────────────────────────────────────
  // Instead of replacing the vessels array entirely (which causes Leaflet markers
  // to unmount/remount and visually disappear), we MERGE incoming data into the
  // existing map keyed by MMSI. Existing markers only get a prop update.
  const loadVessels = useCallback(async () => {
    try {
      const data = await fetchVessels();
      const incoming = data.vessels || [];

      const map = vesselMapRef.current;
      const now = Date.now();
      const seenMmsis = new Set();

      for (const v of incoming) {
        const key = String(v.mmsi);
        seenMmsis.add(key);
        // Merge: keep all enriched fields (history, imo, etc.) from previous entry,
        // but overwrite live telemetry fields from the server response.
        const prev = map.get(key);
        map.set(key, prev ? { ...prev, ...v } : v);
      }

      // Remove vessels that have not been seen for STALE_CUTOFF_MS
      for (const [key, v] of map) {
        if (!seenMmsis.has(key) && (now - (v.updatedAt || 0)) > STALE_CUTOFF_MS) {
          map.delete(key);
        }
      }

      // Convert map → stable array (same object references for unchanged vessels)
      const list = Array.from(map.values());
      setVessels(list);
      setLastUpdate(new Date());
      setConnectionStatus(incoming.length > 0
        ? (incoming.some((v) => v.isSimulated) ? 'simulated' : 'live')
        : 'live');
    } catch {
      setConnectionStatus('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await fetchStats()); } catch {}
  }, []);

  // Initial load + recurring poll — always-on, no pause
  useEffect(() => {
    let active = true;
    (async () => { if (active) await Promise.all([loadVessels(), loadStats()]); })();
    const iv = setInterval(() => { if (active) { loadVessels(); loadStats(); } }, REFRESH_MS);
    return () => { active = false; clearInterval(iv); };
  }, [loadVessels, loadStats]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredVessels = useMemo(() => {
    const q = filter.toLowerCase();
    return vessels.filter((v) => {
      const matchName = !filter
        || (v.name || '').toLowerCase().includes(q)
        || (v.destination || '').toLowerCase().includes(q)
        || String(v.mmsi).includes(q);
      const matchType = typeFilter === 'All' || v.typeLabel === typeFilter;
      return matchName && matchType;
    });
  }, [vessels, filter, typeFilter]);

  const vesselTypes = useMemo(
    () => ['All', ...new Set(vessels.map((v) => v.typeLabel || 'Unknown').sort())],
    [vessels],
  );

  const statusLabel = {
    connecting: 'Connecting…',
    live: 'AIS Live',
    simulated: 'Simulator',
    offline: 'Offline',
  }[connectionStatus] || 'Unknown';

  return (
    <div className="app">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon">
            <Compass size={20} className="compass-spin" />
          </div>
          <div>
            <div className="brand-name">MarineRadar</div>
            <div className="brand-tagline">Global Vessel Tracking</div>
          </div>
        </div>


        <div className="header-center-stats">
          <div className="hs-item">
            <span className="hs-val">{(stats?.total || 0).toLocaleString()}</span>
            <span className="hs-label">Vessels</span>
          </div>
          <div className="hs-divider" />
          <div className="hs-item">
            <span className="hs-val">{vessels.filter(v => (v.sog||0) > 0.5).length}</span>
            <span className="hs-label">Underway</span>
          </div>
          <div className="hs-divider" />
          <div className="hs-item">
            <span className="hs-val">{Object.keys(stats?.byType || {}).length}</span>
            <span className="hs-label">Types</span>
          </div>
        </div>

        <div className="header-actions">
          <div className={`status-pill ${connectionStatus}`}>
            <span className="pill-dot" />
            <Radio size={11} />
            <span>{statusLabel}</span>
          </div>

          <button
            className="action-pill"
            onClick={() => { loadVessels(); loadStats(); }}
            disabled={loading}
            title="Refresh"
          >
            <RotateCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* ═══════════════════════ BODY ═══════════════════════ */}
      <div className="app-body">

        {/* Left Panel: Sidebar list OR vessel detail */}
        <aside className="left-panel">
          <Sidebar
            vessels={filteredVessels}
            allVessels={vessels}
            selected={selectedVesselDetails}
            onSelect={handleSelectVessel}
            filter={filter}
            onFilterChange={setFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            vesselTypes={vesselTypes}
            loading={loading}
            stats={stats}
          />
        </aside>

        {/* Map fills remaining space */}
        <main className="map-area">
          <VesselMap
            vessels={filteredVessels}
            selected={selectedVesselDetails}
            onSelect={handleSelectVessel}
          />
        </main>

        {/* Right detail panel (slides in when vessel selected) */}
        {selectedVesselDetails && (
          <aside className="detail-panel">
            <VesselDetailPanel
              vessel={selectedVesselDetails}
              onClose={() => handleSelectVessel(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Right-side Vessel Detail Panel ──────────────────────────────────────────
function navStatusLabel(n) {
  return ({
    0: 'Underway (Engine)', 1: 'At Anchor', 2: 'Not Under Command',
    3: 'Restricted Maneuverability', 4: 'Constrained by Draught',
    5: 'Moored', 6: 'Aground', 7: 'Engaged in Fishing',
    8: 'Underway (Sailing)', 15: 'Undefined',
  })[n] ?? `Status ${n}`;
}

function VesselDetailPanel({ vessel, onClose }) {
  const length = vessel.dimA != null ? (vessel.dimA || 0) + (vessel.dimB || 0) : null;
  const beam = vessel.dimC != null ? (vessel.dimC || 0) + (vessel.dimD || 0) : null;
  const speed = vessel.sog != null ? Number(vessel.sog).toFixed(1) : null;
  const typeColor = getTypeColor(vessel.typeLabel);
  const country = getVesselCountry(vessel.mmsi);

  const speedKph = speed ? (parseFloat(speed) * 1.852).toFixed(1) : null;




  return (
    <div className="detail-panel-inner">
      {/* Header */}
      <div className="dp-header" style={{ borderLeft: `3px solid ${typeColor}` }}>
        <div className="dp-vessel-id">
          <div className="dp-type-badge" style={{ background: `${typeColor}18`, color: typeColor, borderColor: `${typeColor}30` }}>
            {vessel.typeLabel || 'Unknown'}
          </div>
          <h2 className="dp-name">{vessel.name || `MMSI ${vessel.mmsi}`}</h2>
          <div className="dp-sub-header">
            <span className="dp-flag">{country.flag}</span>
            <span className="dp-flag-name">{country.name}</span>
            {vessel.callsign && <span className="dp-sub-divider"> · {vessel.callsign}</span>}
          </div>
        </div>
        <button className="dp-close" onClick={onClose}>✕</button>
      </div>

      <div className="dp-content">
        {/* Live telemetry */}
        <section className="dp-section">
          <div className="dp-section-title"><Zap size={12} /> Live Telemetry</div>
          <div className="telem-grid">
            <div className="telem-card primary">
              <div className="tc-icon">🚢</div>
              <div className="tc-val">{speed ?? '—'} <span className="tc-unit">kn</span></div>
              <div className="tc-label">Speed</div>
              {speedKph && <div className="tc-sub">{speedKph} km/h</div>}
            </div>
            <div className="telem-card">
              <div className="tc-val">{vessel.cog != null ? `${Math.round(vessel.cog)}°` : '—'}</div>
              <div className="tc-label">Course</div>
            </div>
            <div className="telem-card">
              <div className="tc-val">{vessel.heading != null ? `${Math.round(vessel.heading)}°` : '—'}</div>
              <div className="tc-label">Heading</div>
            </div>
            <div className="telem-card">
              <div className="tc-val nav-status-val" style={{ color: typeColor }}>
                {vessel.navStatus != null ? navStatusLabel(vessel.navStatus).split(' ')[0] : 'Active'}
              </div>
              <div className="tc-label">Nav Status</div>
            </div>
          </div>
        </section>

        {/* Position */}
        <section className="dp-section">
          <div className="dp-section-title"><TrendingUp size={12} /> Position</div>
          <div className="pos-display">
            <div className="pos-row">
              <span className="pos-label">Latitude</span>
              <span className="pos-val">{vessel.lat != null ? `${vessel.lat.toFixed(5)}°` : '—'}</span>
            </div>
            <div className="pos-row">
              <span className="pos-label">Longitude</span>
              <span className="pos-val">{vessel.lng != null ? `${vessel.lng.toFixed(5)}°` : '—'}</span>
            </div>
          </div>
        </section>


        {/* Identifiers */}
        <section className="dp-section">
          <div className="dp-section-title"><Ship size={12} /> Identifiers</div>
          <div className="id-table">
            <div className="id-row"><span>Flag</span><span>{country.flag} &nbsp;{country.name}</span></div>
            <div className="id-row"><span>MMSI</span><span>{vessel.mmsi}</span></div>
            {vessel.imo && <div className="id-row"><span>IMO</span><span>{vessel.imo}</span></div>}
            {vessel.callsign && <div className="id-row"><span>Callsign</span><span>{vessel.callsign}</span></div>}
            {(length || beam) && (
              <div className="id-row">
                <span>Dimensions</span>
                <span>{length ? `${length}m` : '—'} × {beam ? `${beam}m` : '—'}</span>
              </div>
            )}
            {vessel.draught && <div className="id-row"><span>Draught</span><span>{vessel.draught} m</span></div>}
          </div>
        </section>



        {/* History (if available) */}
        {vessel.history && vessel.history.length > 1 && (
          <section className="dp-section">
            <div className="dp-section-title"><Clock size={12} /> Track History</div>
            <div className="history-preview">
              <div className="history-count">{vessel.history.length} position points recorded</div>
              <div className="history-bar">
                {vessel.history.slice(-20).map((_, i) => (
                  <div
                    key={i}
                    className="history-pip"
                    style={{
                      background: typeColor,
                      opacity: 0.3 + (i / vessel.history.length) * 0.7
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
