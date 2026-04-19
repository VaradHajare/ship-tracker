import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function drawShip(ctx, cx, cy, headingDeg, color, size, isSelected) {
  // Draw selection ring BEFORE rotating so it stays circular
  if (isSelected) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((headingDeg || 0) - 90) * (Math.PI / 180));

  const hw = size / 2;
  const fwd = size * 0.75;
  const aft = size * 0.55;

  ctx.beginPath();
  ctx.moveTo(fwd, 0);
  ctx.lineTo(-aft, hw);
  ctx.lineTo(-aft * 0.55, 0);
  ctx.lineTo(-aft, -hw);
  ctx.closePath();

  ctx.fillStyle = isSelected ? '#ffffff' : color;
  ctx.fill();
  ctx.strokeStyle = isSelected ? color : 'rgba(0,0,0,0.55)';
  ctx.lineWidth = isSelected ? 2 : 0.8;
  ctx.stroke();

  ctx.restore();
}

// Custom Leaflet canvas layer for all ships
function CanvasShipLayer({ vessels, selected, onSelect }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const vesselRef = useRef(vessels);
  const selectedRef = useRef(selected);

  vesselRef.current = vessels;
  selectedRef.current = selected;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const zoom = map.getZoom();
    const size = zoom < 5 ? 7 : zoom < 8 ? 10 : zoom < 11 ? 13 : 16;

    // Draw unselected first, selected on top
    const sel = selectedRef.current;
    for (const v of vesselRef.current) {
      if (!v.lat || v.mmsi === sel?.mmsi) continue;
      const pt = map.latLngToContainerPoint([v.lat, v.lng]);
      if (pt.x < -20 || pt.y < -20 || pt.x > width + 20 || pt.y > height + 20) continue;
      drawShip(ctx, pt.x, pt.y, v.heading, v.color || '#0369a1', size, false);
    }
    if (sel?.lat) {
      const pt = map.latLngToContainerPoint([sel.lat, sel.lng]);
      drawShip(ctx, pt.x, pt.y, sel.heading, sel.color || '#0369a1', size + 6, true);
    }
  }, [map]);

  // Pan to vessel when selected (e.g. from sidebar)
  useEffect(() => {
    if (selected?.lat != null) {
      map.panTo([selected.lat, selected.lng], { animate: true, duration: 0.5 });
    }
  }, [selected?.mmsi, map]);

  // Setup canvas
  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:400;';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    function resize() {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redraw();
    }

    resize();
    map.on('move zoom resize moveend zoomend', redraw);
    window.addEventListener('resize', resize);

    return () => {
      map.off('move zoom resize moveend zoomend', redraw);
      window.removeEventListener('resize', resize);
      container.removeChild(canvas);
    };
  }, [map, redraw]);

  // Redraw whenever vessels or selection changes
  useEffect(() => {
    redraw();
  }, [vessels, selected, redraw]);

  // Click detection — find nearest vessel within 12px
  useEffect(() => {
    function handleClick(e) {
      const rect = map.getContainer().getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const zoom = map.getZoom();
      const hitR = zoom < 5 ? 8 : zoom < 8 ? 11 : 14;
      let nearest = null;
      let nearestD = Infinity;
      for (const v of vesselRef.current) {
        if (!v.lat) continue;
        const pt = map.latLngToContainerPoint([v.lat, v.lng]);
        const d = Math.hypot(pt.x - clickX, pt.y - clickY);
        if (d < hitR && d < nearestD) { nearestD = d; nearest = v; }
      }
      onSelect(nearest || null);
    }

    // Hover tooltip
    let tooltipEl = document.getElementById('ship-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'ship-tooltip';
      tooltipEl.style.cssText = `
        position:fixed;pointer-events:none;z-index:9999;
        background:#ffffff;color:#0f172a;
        padding:4px 9px;border-radius:5px;font-size:12px;font-family:system-ui;
        border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.12);
        white-space:nowrap;display:none;
      `;
      document.body.appendChild(tooltipEl);
    }

    function handleMouseMove(e) {
      const rect = map.getContainer().getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const zoom = map.getZoom();
      const hitR = zoom < 5 ? 8 : zoom < 8 ? 11 : 14;
      let found = null;
      let minD = Infinity;
      for (const v of vesselRef.current) {
        if (!v.lat) continue;
        const pt = map.latLngToContainerPoint([v.lat, v.lng]);
        const d = Math.hypot(pt.x - mx, pt.y - my);
        if (d < hitR && d < minD) { minD = d; found = v; }
      }
      if (found) {
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = (e.clientX + 14) + 'px';
        tooltipEl.style.top = (e.clientY - 10) + 'px';
        tooltipEl.textContent = found.name || `MMSI ${found.mmsi}`;
        map.getContainer().style.cursor = 'pointer';
      } else {
        tooltipEl.style.display = 'none';
        map.getContainer().style.cursor = '';
      }
    }

    function handleMouseOut() {
      tooltipEl.style.display = 'none';
      map.getContainer().style.cursor = '';
    }

    const container = map.getContainer();
    container.addEventListener('click', handleClick);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseOut);
    return () => {
      container.removeEventListener('click', handleClick);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseOut);
    };
  }, [map, onSelect]);

  return null;
}

function navStatusLabel(n) {
  const labels = {
    0: 'Underway (engine)', 1: 'At anchor', 2: 'Not under command',
    3: 'Restricted maneuverability', 4: 'Constrained by draught',
    5: 'Moored', 6: 'Aground', 7: 'Engaged in fishing',
    8: 'Underway (sailing)', 15: 'Not defined',
  };
  return labels[n] ?? `Status ${n}`;
}

function SelectedPanel({ vessel, onClose }) {
  if (!vessel) return null;
  const length = vessel.dimA != null ? (vessel.dimA || 0) + (vessel.dimB || 0) : null;
  const beam   = vessel.dimC != null ? (vessel.dimC || 0) + (vessel.dimD || 0) : null;

  const rows = [
    ['Name', vessel.name],
    ['MMSI', vessel.mmsi],
    ['IMO', vessel.imo],
    ['Call sign', vessel.callsign],
    ['Type', vessel.typeLabel],
    ['Speed', vessel.sog != null ? `${Number(vessel.sog).toFixed(1)} kn` : null],
    ['Course', vessel.cog != null ? `${Math.round(vessel.cog)}°` : null],
    ['Heading', vessel.heading != null ? `${Math.round(vessel.heading)}°` : null],
    ['Nav status', vessel.navStatus != null ? navStatusLabel(vessel.navStatus) : null],
    ['Destination', vessel.destination],
    ['Draught', vessel.draught ? `${vessel.draught} m` : null],
    ['Length', length ? `${length} m` : null],
    ['Beam', beam ? `${beam} m` : null],
    ['Position', vessel.lat != null ? `${vessel.lat.toFixed(4)}°, ${vessel.lng.toFixed(4)}°` : null],
  ].filter(([, v]) => v != null && v !== '' && v !== 0);

  return (
    <div className="vessel-detail-panel">
      <div className="detail-header">
        <div className="detail-dot" style={{ background: vessel.color }} />
        <div className="detail-name">{vessel.name || `MMSI ${vessel.mmsi}`}</div>
        <button className="detail-close" onClick={onClose}>×</button>
      </div>
      <table className="detail-table">
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td className="dt-label">{label}</td>
              <td className="dt-val">{String(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VesselMap({ vessels, selected, onSelect }) {
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <MapContainer center={[20, 0]} zoom={3} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd" maxZoom={19}
        />
        <CanvasShipLayer vessels={vessels} selected={selected} onSelect={onSelect} />
        <ZoomControl position="bottomleft" />
      </MapContainer>

      <SelectedPanel vessel={selected} onClose={() => onSelect(null)} />

      {vessels.length === 0 && (
        <div className="map-empty">
          <div style={{ fontSize: 36 }}>🛰️</div>
          <div>Waiting for vessel data…</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Make sure AISSTREAM_API_KEY is set in .env
          </div>
        </div>
      )}
    </div>
  );
}
