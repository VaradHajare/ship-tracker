# Ship Tracker

A real-time vessel tracking application that displays live ship positions on an interactive world map using AIS (Automatic Identification System) data.

## Features

- **Live vessel tracking** — receives real-time AIS data via WebSocket from AISStream
- **Interactive map** — custom ship icons oriented by heading, rendered on a Leaflet canvas layer
- **Vessel type color coding** — Tankers (red), Cargo (blue), Passenger (purple), Sailing (green), and more
- **Search & filter** — search vessels by name or MMSI, filter by vessel type
- **Detail panel** — click any vessel to see full metadata: IMO, speed, course, draught, dimensions, destination, navigational status
- **Live stats bar** — shows total vessel count, breakdown by top vessel types, and last update time
- **Auto-refresh** — vessel data and stats update every 30 seconds

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite |
| Map | Leaflet, react-leaflet, react-leaflet-cluster |
| Backend | Node.js, Express 5 |
| Real-time data | AISStream WebSocket API |
| HTTP client | Axios |

## Project Structure

```
ship-tracker/
├── public/
│   └── logo.png            # App logo (header + browser tab)
├── src/
│   ├── components/
│   │   ├── VesselMap.jsx   # Leaflet map with canvas ship renderer
│   │   ├── Sidebar.jsx     # Searchable vessel list with type filter
│   │   └── StatsBar.jsx    # Header stats (counts by vessel type)
│   ├── App.jsx             # Root component, state management, polling
│   ├── api.js              # REST API wrappers (fetchVessels, fetchStats)
│   └── App.css             # Global styles
├── server.js               # Express server + AISStream WebSocket consumer
├── index.html
├── vite.config.js
└── .env                    # API key and port config (not committed)
```

## Getting Started

### Prerequisites

- Node.js 18+
- An API key from [AISStream.io](https://aisstream.io)

### Installation

```bash
git clone https://github.com/VaradHajare/ship-tracker.git
cd ship-tracker
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
AISSTREAM_API_KEY=your_api_key_here
PORT=3001
```

### Running the App

Start the backend server and the frontend dev server in separate terminals:

```bash
# Terminal 1 — backend (port 3001)
npm run server

# Terminal 2 — frontend (port 5173)
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/vessels` | All active vessels (optional `bbox` query param) |
| GET | `/api/vessels/:mmsi` | Single vessel by MMSI |
| GET | `/api/stats` | Vessel counts grouped by type |

## How It Works

1. The server connects to AISStream via WebSocket and receives live AIS messages.
2. Position updates (lat, lng, heading, speed, course) and static data (name, IMO, type, destination, dimensions) are merged into an in-memory store keyed by MMSI.
3. Vessels not updated within 30 minutes are automatically pruned.
4. The React frontend polls `/api/vessels` and `/api/stats` every 30 seconds and renders ships on the map as directional icons.
5. Clicking a ship on the map or in the sidebar opens a detail panel and pans the map to that vessel.

## Vessel Type Classification

| Type | Color | AIS Type Codes |
|---|---|---|
| Cargo | Blue | 70–79 |
| Tanker | Red | 80–89 |
| Passenger | Purple | 60–69 |
| Sailing | Green | 36–37 |
| Fishing | Orange | 30 |
| High Speed | Cyan | 40–49 |
| Tug / Dredger | Brown | 31–35, 50–59 |
| SAR / Military | Dark red | 55, 35 |
| Other | Dark blue | everything else |

## Build for Production

```bash
npm run build
```

The output is placed in `dist/`. Serve it with any static file host alongside the Express server.

## License

MIT
