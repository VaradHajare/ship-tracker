import { useState, useEffect, useCallback, useMemo } from 'react';
import VesselMap from './components/VesselMap';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import { fetchVessels, fetchStats } from './api';
import './App.css';

const REFRESH_MS = 30_000;

export default function App() {
  const [vessels, setVessels] = useState([]);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  const loadVessels = useCallback(async () => {
    try {
      const data = await fetchVessels();
      setVessels(data.vessels || []);
      setLastUpdate(new Date());
    } catch { /* server might not be up yet */ }
    finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch { }
  }, []);

  useEffect(() => {
    loadVessels();
    loadStats();
    const interval = setInterval(() => {
      loadVessels();
      loadStats();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadVessels, loadStats]);

  // Refresh selected vessel details when vessels update
  useEffect(() => {
    if (selectedVessel) {
      const updated = vessels.find((v) => v.mmsi === selectedVessel.mmsi);
      if (updated) setSelectedVessel(updated);
    }
  }, [vessels]);

  const filteredVessels = useMemo(() => vessels.filter((v) => {
    const matchName = !filter || v.name?.toLowerCase().includes(filter.toLowerCase()) ||
      String(v.mmsi).includes(filter);
    const matchType = typeFilter === 'All' || v.typeLabel === typeFilter;
    return matchName && matchType;
  }), [vessels, filter, typeFilter]);

  const vesselTypes = useMemo(
    () => ['All', ...new Set(vessels.map((v) => v.typeLabel || 'Unknown').sort())],
    [vessels]
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <img src="/logo.png" alt="Ship Tracker" className="logo-img" />
          <h1>Ship Tracker</h1>
        </div>
        <StatsBar stats={stats} loading={loading} lastUpdate={lastUpdate} />
      </header>

      <div className="app-body">
        <main className="map-container">
          <VesselMap
            vessels={filteredVessels}
            selected={selectedVessel}
            onSelect={setSelectedVessel}
          />
        </main>

        <aside className="sidebar">
          <Sidebar
            vessels={filteredVessels}
            allVessels={vessels}
            selected={selectedVessel}
            onSelect={setSelectedVessel}
            filter={filter}
            onFilterChange={setFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            vesselTypes={vesselTypes}
            loading={loading}
          />
        </aside>
      </div>
    </div>
  );
}
