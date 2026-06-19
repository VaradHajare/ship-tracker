import { useState, useMemo, memo, useCallback, useEffect, useRef } from 'react';
import {
  MapContainer, TileLayer, ZoomControl,
  Marker, CircleMarker, useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Navigation as NavIcon } from 'lucide-react';

// ─── Selected-vessel SVG icon (only used for ONE vessel at a time) ─────────────
// We only build the expensive DivIcon for the selected vessel.
// All other vessels use canvas-rendered CircleMarkers (zero DOM per vessel).
const SEL_ICON_CACHE = new Map();

function getSelectedIcon(vessel) {
  const heading = Math.round((vessel.heading ?? vessel.cog ?? 0) / 5) * 5;
  const color = vessel.color || '#2563eb';
  const key = `${color}|${heading}`;
  if (SEL_ICON_CACHE.has(key)) return SEL_ICON_CACHE.get(key);

  const icon = L.divIcon({
    html: `
      <div style="transform:rotate(${heading}deg);width:36px;height:36px;
          display:flex;align-items:center;justify-content:center;position:relative;">
        <svg viewBox="-2 -44 28 68" width="32" height="64"
            style="position:absolute;top:-28px;left:2px;overflow:visible;">
          <path d="M12,0 C14.5,4 18,11 18,19 L18,26 L6,26 L6,19 C6,11 9.5,4 12,0 Z"
            fill="#ffffff" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
          <rect x="9.5" y="13" width="5" height="8" rx="1"
            fill="#eff6ff" stroke="${color}" stroke-width="0.8"/>
          <rect x="11" y="16.5" width="2" height="2.5" rx="0.4" fill="${color}"/>
        </svg>
      </div>`,
    className: 'sel-ship-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  if (SEL_ICON_CACHE.size > 50) SEL_ICON_CACHE.clear(); // tiny cache, selected changes rarely
  SEL_ICON_CACHE.set(key, icon);
  return icon;
}

// ─── Tile configs ─────────────────────────────────────────────────────────────
const TILES = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri',
  },
};

// ─── Pan to vessel on selection (one-shot, not follow) ────────────────────────
// Only fires when the selected MMSI changes, never on position updates.
function MapController({ selected }) {
  const map = useMap();
  const prevMmsi = useRef(null);

  useEffect(() => {
    if (!selected?.lat || !selected?.lng) { prevMmsi.current = null; return; }
    const mmsiKey = String(selected.mmsi);
    if (prevMmsi.current === mmsiKey) return; // same vessel selected — do nothing
    prevMmsi.current = mmsiKey;

    // Zoom in to at least level 6 so the vessel is clearly visible
    const zoom = Math.max(map.getZoom(), 6);
    map.setView([selected.lat, selected.lng], zoom, { animate: true, duration: 0.75 });
  }, [selected?.mmsi]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ─── Layer controls ────────────────────────────────────────────────────────────
const MapLayerControl = memo(function MapLayerControl({ style, onStyle }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="map-layer-ctrl">
      <button className={`mlc-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <Layers size={15} />
        <span>Layers</span>
      </button>

      {open && (
        <div className="mlc-dropdown">
          <div className="mlc-group-label">Base Map</div>
          <div className="mlc-tabs">
            {Object.keys(TILES).map(k => (
              <button
                key={k}
                className={`mlc-tab ${style === k ? 'active' : ''}`}
                onClick={() => { onStyle(k); setOpen(false); }}
              >
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});


// ─── Vessel markers – memoized so they only re-render when their own data changes
// All non-selected vessels render as canvas CircleMarkers: near-zero DOM cost.
const VesselCircle = memo(function VesselCircle({ vessel, isSelected, onClick }) {
  const color = vessel.color || '#64748b';
  return (
    <CircleMarker
      center={[vessel.lat, vessel.lng]}
      radius={isSelected ? 9 : 5}
      pathOptions={{
        fillColor: color,
        fillOpacity: isSelected ? 0 : 0.82, // selected uses Marker icon instead
        color: isSelected ? color : 'rgba(255,255,255,0.55)',
        weight: isSelected ? 0 : 1,
      }}
      eventHandlers={{ click: onClick }}
    />
  );
}, (prev, next) => {
  // Only re-render if position, selection state, or color changes
  return (
    prev.vessel.lat === next.vessel.lat &&
    prev.vessel.lng === next.vessel.lng &&
    prev.vessel.color === next.vessel.color &&
    prev.isSelected === next.isSelected
  );
});

// ─── Main VesselMap ───────────────────────────────────────────────────────────
// MAX_MAP_VESSELS caps how many markers we render. Reduces load dramatically.
const MAX_MAP_VESSELS = 150;

export default function VesselMap({ vessels, selected, onSelect }) {
  const [mapStyle, setMapStyle] = useState('light');

  const tile = TILES[mapStyle] || TILES.light;
  const selMmsi = selected ? String(selected.mmsi) : null;

  // Cap the number of vessels rendered on map. Prioritize: selected first,
  // then by most recently updated (live data is more interesting).
  const renderVessels = useMemo(() => {
    const valid = vessels.filter(v => v.lat != null && v.lng != null);
    if (valid.length <= MAX_MAP_VESSELS) return valid;
    // Always include selected vessel
    const sel = selMmsi ? valid.filter(v => String(v.mmsi) === selMmsi) : [];
    const others = valid
      .filter(v => String(v.mmsi) !== selMmsi)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_MAP_VESSELS - sel.length);
    return [...sel, ...others];
  }, [vessels, selMmsi]);

  // Stable click handlers so VesselCircle doesn't re-render from handler change
  const handleClick = useCallback((v) => () => onSelect(v), [onSelect]);



  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={[25, 15]}
        zoom={3}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        preferCanvas={true}           // ← KEY: renders Path layers on Canvas, not SVG DOM
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={mapStyle}
          attribution={tile.attr}
          url={tile.url}
          maxZoom={18}
          noWrap={true}               // ← prevents tile wrapping (multiple earths)
          keepBuffer={2}              // ← reduced from 4; less pre-loading
          updateWhenZooming={false}   // ← don't fetch tiles while zoom animation runs
          updateWhenIdle={true}       // ← only fetch when user stops panning
        />



        {/* All vessels as canvas circles — essentially zero DOM cost */}
        {renderVessels.map(v => {
          const isSel = String(v.mmsi) === selMmsi;
          return (
            <VesselCircle
              key={v.mmsi}
              vessel={v}
              isSelected={isSel}
              onClick={handleClick(v)}
            />
          );
        })}

        {/* Selected vessel gets one DivIcon Marker for the ship shape + pulse ring */}
        {selected?.lat != null && selected?.lng != null && (
          <Marker
            position={[selected.lat, selected.lng]}
            icon={getSelectedIcon(selected)}
            zIndexOffset={1000}
            eventHandlers={{ click: () => onSelect(selected) }}
          />
        )}

        <MapController selected={selected} />
        <ZoomControl position="bottomright" />
      </MapContainer>

      <MapLayerControl
        style={mapStyle}
        onStyle={setMapStyle}
      />

      <div className="map-vessel-count">
        <NavIcon size={11} />
        <span>{renderVessels.length} shown{vessels.length > MAX_MAP_VESSELS ? ` of ${vessels.length}` : ''}</span>
      </div>

      {vessels.length === 0 && (
        <div className="map-empty-state">
          <div className="mes-icon">🛰️</div>
          <div className="mes-title">Scanning for vessels…</div>
          <div className="mes-sub">Awaiting AIS data</div>
        </div>
      )}
    </div>
  );
}
