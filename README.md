# MarineRadar — Global Vessel Tracking

A real-time, highly-optimized vessel tracking and analysis application that displays live ship positions on an interactive world map using AIS (Automatic Identification System) data.

<img width="1903" height="912" alt="image" src="https://github.com/user-attachments/assets/6eb5c4e7-fd33-4537-b00f-4ec2d0a9dde2" />

## Features

- **AIS Live Stream** — Receives real-time AIS messages via WebSocket from AISStream.
- **Dynamic Port Simulator** — Falls back to a low-overhead mock engine simulating 25 vessels across 5 shipping corridors if no API key is specified.
- **Canvas-Optimized Map** — Uses Leaflet's canvas renderer (`preferCanvas={true}`) to plot up to 150 vessels simultaneously with near-zero DOM performance cost.
- **Flicker-Free Live Updates** — Merges incoming position updates directly into the existing map ref (`vesselMapRef`) instead of wholesale array replacement, preventing ship markers from disappearing or flashing during updates.
- **MMSI Flag State Decoder** — Extracts the vessel's flag state country and flag emoji dynamically using its Maritime Identification Digit (MID) prefix (e.g. `🇺🇸 United States (USA)`).
- **3D Material Design UI** — Features elevated panels, soft depths, micro-shadows, and slide-out drawers, separating sidebar modules from the map area.
- **Auto-Panning** — Automatically centers and zooms into a ship smoothly when selected from the sidebar.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Lucide Icons |
| **Map Rendering** | Leaflet, react-leaflet (Canvas Layer config) |
| **Backend** | Node.js, Express 5, WS (WebSockets) |
| **Real-time Source** | AISStream WebSocket API |
| **HTTP client** | Fetch API |

## Project Structure

```
ship-tracker/
├── public/
│   ├── favicon.svg         # Brand-matched vector compass tab icon
│   └── logo.png            # Desktop logo asset
├── src/
│   ├── components/
│   │   ├── VesselMap.jsx   # Map component with Canvas markers and layer controls
│   │   └── Sidebar.jsx     # Vessel search, sorting, and type-filter sidebar
│   ├── utils/
│   │   └── country.js      # MMSI-to-Flag state country translation utility
│   ├── App.jsx             # Root component, detail drawers, and polling logic
│   ├── api.js              # HTTP client REST wrappers
│   └── App.css             # Elevated 3D shadow system and responsive layout styles
├── server.js               # Node server + AIS WebSocket aggregator & mock simulator
├── index.html              # Entry template (customized brand header)
├── vite.config.js
└── .env                    # Environment keys (ignored by git)
```

## Getting Started

### Prerequisites

- Node.js 18+
- An API key from [AISStream.io](https://aisstream.io) (optional; defaults to Simulator Mode if missing)

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

Open [http://localhost:5173](http://localhost:5173) in your browser.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/vessels` | All active vessels (optionally filtered by bounding box; capped at 200) |
| `GET` | `/api/vessels/:mmsi` | Single vessel details with historical tracking |
| `GET` | `/api/stats` | Active count statistics grouped by type |
| `GET` | `/api/health` | Service uptime and connection telemetry |

## How It Works

1. **Aggregation:** The Node server connects to `wss://stream.aisstream.io` and streams global AIS packets.
2. **Telemetry Mapping:** Position and static metadata (IMO, dimensions, status) are parsed in-memory. If data goes missing, the server deterministically assigns realistic voyage start and endpoints based on the vessel's MMSI.
3. **Optimized Polling:** The client fetches updates every 20 seconds. The React reconciler updates existing Canvas circles in-place, eliminating DOM thrashing.
4. **Pruning:** To conserve memory, vessels that have not reported updates for more than 5 minutes are purged.

## License

MIT
