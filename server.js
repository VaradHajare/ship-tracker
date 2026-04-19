import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.AISSTREAM_API_KEY;

app.use(cors());
app.use(express.json());

// In-memory vessel store: mmsi -> vessel object
const vessels = new Map();
const STALE_MS = 30 * 60 * 1000; // remove vessels unseen for 30 minutes

// AIS ship type number -> human label + color
function classifyShip(typeNum) {
  const n = Number(typeNum) || 0;
  if (n === 30) return { label: 'Fishing',       color: '#16a34a' };
  if (n === 31 || n === 32) return { label: 'Tug/Dredger', color: '#d97706' };
  if (n === 29 || n === 35) return { label: 'SAR/Military', color: '#dc2626' };
  if (n === 36 || n === 37) return { label: 'Sailing/Leisure', color: '#0891b2' };
  if (n >= 40 && n <= 49)   return { label: 'High Speed',   color: '#7c3aed' };
  if (n >= 50 && n <= 59)   return { label: 'Port/Service', color: '#d97706' };
  if (n >= 60 && n <= 69)   return { label: 'Passenger',    color: '#7c3aed' };
  if (n >= 70 && n <= 79)   return { label: 'Cargo',        color: '#1d4ed8' };
  if (n >= 80 && n <= 89)   return { label: 'Tanker',       color: '#b91c1c' };
  return { label: 'Other', color: '#0369a1' };
}

// --- AISStream WebSocket connection ---
let ws = null;
let reconnectTimer = null;

function connectAIS() {
  if (!API_KEY || API_KEY === 'YOUR_KEY_HERE') {
    console.warn('⚠  No AISSTREAM_API_KEY set — vessel data will not stream.');
    return;
  }

  console.log('Connecting to AISStream...');
  ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.on('open', () => {
    console.log('✓ AISStream connected');
    ws.send(JSON.stringify({
      APIKey: API_KEY,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }));
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      const mmsi = msg.MetaData?.MMSI;
      if (!mmsi) return;

      const existing = vessels.get(mmsi) || { mmsi };

      if (msg.MessageType === 'PositionReport') {
        const r = msg.Message.PositionReport;
        Object.assign(existing, {
          mmsi,
          lat: r.Latitude,
          lng: r.Longitude,
          sog: r.Sog,          // speed over ground (knots)
          cog: r.Cog,          // course over ground (degrees)
          heading: r.TrueHeading === 511 ? r.Cog : r.TrueHeading,
          navStatus: r.NavigationalStatus,
          name: msg.MetaData?.ShipName?.trim() || existing.name || `MMSI ${mmsi}`,
          updatedAt: Date.now(),
        });
      }

      if (msg.MessageType === 'ShipStaticData') {
        const s = msg.Message.ShipStaticData;
        const { label, color } = classifyShip(s.Type);
        Object.assign(existing, {
          mmsi,
          name: s.Name?.trim() || existing.name || `MMSI ${mmsi}`,
          callsign: s.CallSign?.trim(),
          imo: s.ImoNumber,
          shipType: s.Type,
          typeLabel: label,
          color,
          destination: s.Destination?.trim(),
          draught: s.Draught,
          dimA: s.Dimension?.A,
          dimB: s.Dimension?.B,
          dimC: s.Dimension?.C,
          dimD: s.Dimension?.D,
          updatedAt: Date.now(),
        });
      }

      if (!existing.color) {
        const { label, color } = classifyShip(existing.shipType);
        existing.typeLabel = label;
        existing.color = color;
      }

      vessels.set(mmsi, existing);
    } catch { /* ignore parse errors */ }
  });

  ws.on('close', () => {
    console.log('AISStream disconnected — reconnecting in 5s...');
    reconnectTimer = setTimeout(connectAIS, 5000);
  });

  ws.on('error', (err) => {
    console.error('AISStream error:', err.message);
    ws.close();
  });
}

// Prune stale vessels every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [mmsi, v] of vessels) {
    if (v.updatedAt < cutoff) vessels.delete(mmsi);
  }
}, 5 * 60 * 1000);

// --- REST endpoints ---

// All vessels (optionally filtered by bounding box)
app.get('/api/vessels', (req, res) => {
  const { minLat, maxLat, minLng, maxLng } = req.query;
  let list = [...vessels.values()].filter((v) => v.lat != null && v.lng != null);

  if (minLat && maxLat && minLng && maxLng) {
    list = list.filter(
      (v) =>
        v.lat >= Number(minLat) && v.lat <= Number(maxLat) &&
        v.lng >= Number(minLng) && v.lng <= Number(maxLng)
    );
  }

  res.json({ count: list.length, vessels: list });
});

// Single vessel by MMSI
app.get('/api/vessels/:mmsi', (req, res) => {
  const v = vessels.get(Number(req.params.mmsi));
  if (!v) return res.status(404).json({ error: 'Vessel not found' });
  res.json(v);
});

// Stats
app.get('/api/stats', (req, res) => {
  const withPos = [...vessels.values()].filter((v) => v.lat != null);
  const byType = {};
  for (const v of withPos) {
    const t = v.typeLabel || 'Unknown';
    byType[t] = (byType[t] || 0) + 1;
  }
  res.json({ total: withPos.length, byType });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectAIS();
});
