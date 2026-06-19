import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (!API_KEY || API_KEY === 'YOUR_KEY_HERE') {
    console.warn('⚠  No AISSTREAM_API_KEY set — starting vessel simulation mode.');
    startSimulation();
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

      const existing = vessels.get(mmsi) || { mmsi, history: [] };

      if (msg.MessageType === 'PositionReport') {
        const r = msg.Message.PositionReport;

        // Keep a history of the last 20 coordinates
        existing.history = existing.history || [];
        const lastPos = existing.history[existing.history.length - 1];
        if (!lastPos || lastPos.lat !== r.Latitude || lastPos.lng !== r.Longitude) {
          existing.history.push({ lat: r.Latitude, lng: r.Longitude, timestamp: Date.now() });
          if (existing.history.length > 20) {
            existing.history.shift();
          }
        }

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

      // Limit total vessels in memory to 400 to prevent overhead
      if (!vessels.has(mmsi) && vessels.size >= 400) {
        let oldestMmsi = null;
        let oldestTime = Infinity;
        for (const [key, val] of vessels) {
          if (!val.isSimulated && val.updatedAt < oldestTime) {
            oldestTime = val.updatedAt;
            oldestMmsi = key;
          }
        }
        if (oldestMmsi) vessels.delete(oldestMmsi);
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

// Prune stale vessels every 5 minutes (except mock vessels)
setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [mmsi, v] of vessels) {
    if (!v.isSimulated && v.updatedAt < cutoff) vessels.delete(mmsi);
  }
}, 5 * 60 * 1000);

// --- Mock Vessel Simulator ---
const SIMULATED_REGIONS = [
  { name: 'English Channel', minLat: 49.5, maxLat: 51.5, minLng: -4.0, maxLng: 2.0 },
  { name: 'Singapore Strait', minLat: 1.1, maxLat: 1.4, minLng: 103.5, maxLng: 104.5 },
  { name: 'Gibraltar Strait', minLat: 35.8, maxLat: 36.2, minLng: -6.5, maxLng: -5.0 },
  { name: 'US East Coast', minLat: 39.5, maxLat: 42.0, minLng: -74.0, maxLng: -70.0 },
  { name: 'Suez Canal / Red Sea', minLat: 27.5, maxLat: 29.8, minLng: 32.5, maxLng: 34.0 }
];

const SHIP_NAMES = [
  'OCEAN MAJESTY', 'PACIFIC TRADER', 'EVER GLORY', 'NORTH STAR',
  'BALTIC EXPLORER', 'ATLANTIC CHARGER', 'SEA BREEZE', 'MAERSK RESOLUTE',
  'ALASKAN FRONTIER', 'TOKYO MARU', 'CAPE KENNEDY', 'HONG KONG EXPRESS',
  'GLOBAL VOYAGER', 'VIKING SPIRIT', 'SOUTHERN CROSS', 'POLARIS DUO',
  'HYUNDAI RESOLUTE', 'CMA CGM MARLIN', 'MSC GENEVA', 'APL AGATE',
  'COSCO PIRAEUS', 'ONE MINATO', 'NYK DEWDROP', 'MOL EMERALD',
  'EVER ACE', 'MSC OSCAR', 'CSCL GLOBE', 'OOCL HONG KONG',
  'MADRID MAERSK', 'ALLEGRA', 'SEA PHOENIX', 'ATLANTIC LION',
  'PACIFIC EAGLE', 'ORIENT DAWN', 'SILVER MERCURY', 'BLUE MARLIN',
  'CRIMSON TIDE', 'GOLDEN GATE', 'IRON DUKE', 'JADE EMPRESS',
  'KOTA LIBERTY', 'LIBERTY SPIRIT', 'MERCURY STAR', 'NEPTUNE GLORY',
  'OCEANIC PEARL', 'PIONEER QUEST', 'QUEEN MARY', 'RIGEL STAR',
  'SAPPHIRE BAY', 'TITAN WAVE', 'ULYSSES', 'VALOR', 'WHITE FALCON',
  'XANTHE', 'YEOMAN BURN', 'ZEPHYR WIND', 'AMBER QUEEN', 'BERING SEA',
  'CRYSTAL WATERS', 'DELTA PRIDE', 'EAGLE RAY', 'FRONTIER SPIRIT',
  'GALAXY EXPRESS', 'HARBOUR MASTER', 'INDIGO OCEAN', 'JADE HARMONY',
  'KRAKEN', 'LENA RIVER', 'MARITIME PIONEER', 'NAUTILUS',
  'OCEAN BRAVE', 'PORT ROYALE', 'QUEST MERIDIAN', 'REGAL SEA',
  'SENTINEL', 'TROPIC SUN', 'UNITY', 'VANGUARD', 'WESTGATE',
  'YELLOW SEA KING', 'ZENITH STAR', 'ALPINE SPIRIT', 'BOREAL LIGHT',
];

const DESTINATIONS = [
  'ROTTERDAM', 'SINGAPORE', 'GIBRALTAR', 'NEW YORK', 'TOKYO', 'SHANGHAI',
  'SUEZ', 'PANAMA', 'LONDON', 'HAMBURG', 'HOUSTON', 'LOS ANGELES',
  'ANTWERP', 'DUBAI', 'MUMBAI', 'BUSAN', 'HONG KONG', 'PORT SAID',
  'FELIXSTOWE', 'PIRAEUS', 'VALENCIA', 'BARCELONA', 'GENOVA', 'ALGECIRAS',
];

const DEPARTURES = [
  'SINGAPORE', 'SHANGHAI', 'ROTTERDAM', 'NEW YORK', 'HONG KONG',
  'TOKYO', 'LONDON', 'LOS ANGELES', 'HAMBURG', 'MUMBAI', 'ANTWERP',
  'DUBAI', 'PANAMA', 'BUSAN', 'PIRAEUS', 'VALENCIA', 'BARCELONA'
];

const SHIP_TYPES = [30, 31, 35, 36, 40, 60, 70, 80];

let simInterval = null;

function startSimulation() {
  if (simInterval) return;
  console.log('🛰️  Generating initial mock vessels...');

  // Generate 25 simulated vessels — enough to demo, low enough to not kill CPU
  for (let i = 0; i < 25; i++) {
    const mmsi = 990000000 + i;
    const type = SHIP_TYPES[i % SHIP_TYPES.length];
    const region = SIMULATED_REGIONS[i % SIMULATED_REGIONS.length];
    const lat = region.minLat + Math.random() * (region.maxLat - region.minLat);
    const lng = region.minLng + Math.random() * (region.maxLng - region.minLng);
    const cog = Math.random() * 360;
    // Vary speed significantly by vessel type for realism
    const baseSog = type === 40 ? 25 : type === 70 ? 14 : type === 80 ? 12 : type === 30 ? 6 : 8;
    const sog = baseSog + Math.random() * 6;
    const origin = DEPARTURES[i % DEPARTURES.length];
    let destination = DESTINATIONS[i % DESTINATIONS.length];
    if (origin === destination) {
      destination = DESTINATIONS[(i + 1) % DESTINATIONS.length];
    }
    const { label, color } = classifyShip(type);

    const vessel = {
      mmsi,
      name: SHIP_NAMES[i % SHIP_NAMES.length],  // unique name (80 names for 80 ships)
      imo: 9000000 + i,
      callsign: `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i + 3) % 26))}${String.fromCharCode(65 + ((i + 7) % 26))}${(1000 + i).toString().slice(-4)}`,
      shipType: type,
      typeLabel: label,
      color,
      lat,
      lng,
      sog: parseFloat(sog.toFixed(1)),
      cog,
      heading: cog,
      origin,
      destination,
      draught: parseFloat((3 + Math.random() * 12).toFixed(1)),
      dimA: Math.floor(40 + Math.random() * 200),
      dimB: Math.floor(20 + Math.random() * 80),
      dimC: Math.floor(8 + Math.random() * 20),
      dimD: Math.floor(8 + Math.random() * 20),
      navStatus: [0, 0, 0, 0, 1, 5][Math.floor(Math.random() * 6)], // mostly underway
      history: [{ lat, lng, timestamp: Date.now() }],
      updatedAt: Date.now(),
      isSimulated: true,
    };

    vessels.set(mmsi, vessel);
  }

  // Update positions every 3 seconds for smooth movement
  simInterval = setInterval(() => {
    for (const [mmsi, v] of vessels) {
      if (!v.isSimulated) continue;

      // Slight random course drift (±0.5 deg per tick) so vessels don't move robotically
      v.cog = (v.cog + (Math.random() * 1 - 0.5) + 360) % 360;
      v.heading = v.cog;

      const rad = (v.cog * Math.PI) / 180;
      const distDeg = (v.sog * 3) / 216000; // 3-second step
      let nextLat = v.lat + Math.cos(rad) * distDeg;
      let nextLng = v.lng + Math.sin(rad) * distDeg / Math.max(0.01, Math.cos((v.lat * Math.PI) / 180));

      const region = SIMULATED_REGIONS[mmsi % SIMULATED_REGIONS.length];
      let bounce = false;

      if (nextLat < region.minLat || nextLat > region.maxLat) {
        v.cog = (360 - v.cog + 360) % 360;
        bounce = true;
      }
      if (nextLng < region.minLng || nextLng > region.maxLng) {
        v.cog = (180 - v.cog + 360) % 360;
        bounce = true;
      }

      if (bounce) {
        v.heading = v.cog;
        const newRad = (v.cog * Math.PI) / 180;
        nextLat = v.lat + Math.cos(newRad) * distDeg;
        nextLng = v.lng + Math.sin(newRad) * distDeg / Math.max(0.01, Math.cos((v.lat * Math.PI) / 180));
      }

      v.lat = nextLat;
      v.lng = nextLng;
      v.updatedAt = Date.now();

      // Record history point if moved enough
      const lastPos = v.history[v.history.length - 1];
      if (!lastPos || Math.hypot(lastPos.lat - v.lat, lastPos.lng - v.lng) > 0.00005) {
        v.history.push({ lat: v.lat, lng: v.lng, timestamp: Date.now() });
        if (v.history.length > 15) v.history.shift();
      }
    }
  }, 10000); // update every 10 seconds — smooth enough, low CPU
}

// Helper to ensure all vessels have realistic, non-empty, and non-matching starting & ending routes
function enrichVoyageData(v) {
  if (!v) return v;
  const hash = Number(v.mmsi || 0);
  const DEPARTURES_LIST = ['SINGAPORE', 'SHANGHAI', 'ROTTERDAM', 'NEW YORK', 'HOUSTON', 'TOKYO', 'LONDON', 'MUMBAI', 'HAMBURG', 'DUBAI', 'GENOA', 'ANTWERP'];
  const ARRIVALS_LIST = ['ROTTERDAM', 'SINGAPORE', 'NEW YORK', 'TOKYO', 'SHANGHAI', 'LONDON', 'DUBAI', 'MUMBAI', 'HAMBURG', 'LOS ANGELES', 'PIRAEUS', 'PANAMA'];

  const clean = (val) => {
    if (!val) return '';
    const l = val.toLowerCase();
    if (l.includes('unreported') || l.includes('unknown') || l.includes('at sea') || l.trim() === '') return '';
    return val.trim();
  };

  const currentOrigin = clean(v.origin);
  const currentDest = clean(v.destination);

  if (!currentOrigin) {
    v.origin = DEPARTURES_LIST[hash % DEPARTURES_LIST.length];
  } else {
    v.origin = currentOrigin;
  }

  if (!currentDest) {
    let dest = ARRIVALS_LIST[(hash + 3) % ARRIVALS_LIST.length];
    if (dest === v.origin) dest = ARRIVALS_LIST[(hash + 4) % ARRIVALS_LIST.length];
    v.destination = dest;
  } else {
    v.destination = currentDest;
  }
  return v;
}

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

  list.forEach(enrichVoyageData);

  // Omit history for general list queries to save bandwidth
  // Cap at 200 vessels to prevent huge JSON payloads
  const optimizedList = list.slice(0, 200).map(v => {
    const copy = { ...v };
    delete copy.history;
    return copy;
  });


  res.json({ count: optimizedList.length, vessels: optimizedList });
});

// Single vessel by MMSI – coerce to Number since Map keys are Numbers
app.get('/api/vessels/:mmsi', (req, res) => {
  const mmsiNum = Number(req.params.mmsi);
  const v = vessels.get(mmsiNum) || vessels.get(req.params.mmsi);
  if (!v) return res.status(404).json({ error: 'Vessel not found' });
  enrichVoyageData(v);
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

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    vessels: vessels.size,
    streaming: ws && ws.readyState === WebSocket.OPEN,
    simulated: !!simInterval
  });
});

// Static files in production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback wildcard routing for Single Page App
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Ship Tracker API Server. Frontend build not found.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectAIS();
});
