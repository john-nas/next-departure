# Next Departure

A focused React/Vite prototype for Victorian metropolitan and regional bus
departures. It combines Transport Victoria's weekly GTFS Schedule data with
GTFS-Realtime trip updates and vehicle positions, then gives the browser a
small JSON departure board rather than the full feeds.

The repository includes a genuine captured live snapshot, so the interface is
useful before credentials are configured. Captured data is clearly marked as
historical once it is more than five minutes old.

## What the prototype proves

- Static stop and route names can be joined to realtime stop predictions.
- Trip updates and vehicle positions can be joined by `trip_id`.
- Scheduled and predicted times, delay state, feed freshness, and approximate
  straight-line vehicle distance can be presented in a Vite SPA.
- Folder 4 regional Myki town buses can be selected with exact static route
  identifiers and joined to the same realtime feeds as metro buses.
- The API key remains in the Node process and never enters the browser bundle
  or generated snapshot.

The passenger flow is intentionally mobile-first: the home screen can use
device location to show nearby departures, stop detail leads with the next
five services, and route discovery starts with a small recommended set before
offering the full directory. Realtime screens use TanStack Query background
refreshes so a successful refresh updates values in place without blanking the
current view. The backend also exposes `/api/stops/nearby` for location-based
clients; the checked-in snapshot remains the offline fallback.

Transport Victoria's GTFS data does not identify the contracted bus operator.
The default scope is therefore a documented, best-effort allowlist of routes
currently confirmed by Dysons: 343, 578, 579, 580, and 582. Use the regional
refresh command for folder 4 regional Myki town buses, or the all-routes command
for an operator-agnostic snapshot.

Regional coaches (folder 5) and remaining regional buses (folder 6) are kept as
schedule-first datasets. The supplied realtime snapshot has no exact folder 5
or folder 6 identifier matches, so those services are never labelled live.
The folder 4 regional classification is derived from the official route-id
prefixes: 45/46 (Bendigo), 57 and 64–66 (Warragul/Latrobe Valley), 58 and
67–70 (Geelong), 59/81 (Ballarat/Bacchus Marsh), and 78–80
(Seymour/Kilmore/Wallan).

## Requirements

- Node.js 24 or newer
- npm
- A Transport Victoria Open Data Portal API key for live refreshes

## Run the captured prototype

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The app reads
`public/data/departures.json` and checks it again every 60 seconds.

## Refresh with live data

Copy the example environment file and place your key in `.env.local`:

```powershell
Copy-Item .env.example .env.local
npm run feed:refresh
```

Use the UUID `KeyID` shown under **My Account → Profile → API tokens**. A
browser/session JWT is not accepted by the realtime endpoints.

The `.env.local` file and static lookup cache are ignored by Git. On its first run,
the generator uses HTTP Range requests to download only the metropolitan-bus
member of the large GTFS Schedule archive (about 65 MB), then caches its stop
and route lookup locally.

For a continuously updating local prototype, run these in separate terminals:

```powershell
npm run feed:watch
npm run dev
```

`feed:watch` fetches and atomically replaces the snapshot every 60 seconds. If
a refresh fails, the last good snapshot remains available.

Other useful commands:

```powershell
# Include Metro and Regional Bus services rather than the curated route list.
npm run feed:refresh:all

# Generate the folder 4 regional Myki town-bus realtime slice.
npm run feed:refresh:regional

# Prepare or refresh the static stop/route cache by itself.
npm run feed:cache

# Include schedule-first regional coach and bus route metadata in the cache.
npm run feed:cache:regional

# Focused project validation.
npm run lint
npm run build
```

Run `node scripts/generate-departures.mjs --help` for capture-file, time-window,
and output-limit options.

## Local Python backend

The `backend/` folder adds the production-shaped local path
`Transport Victoria → Python ETL → SQLite → FastAPI → Vite` without removing
the Node snapshot generator. Follow [backend/README.md](backend/README.md) to
create the Windows virtual environment, import GTFS branches, replay protobufs,
run the ETL/API, and inspect Swagger at `/docs`. During development, Vite
proxies `/api` to `http://localhost:8000`; the frontend keeps the checked-in
snapshot as a graceful fallback when that API is unavailable.

## Data flow

```text
GTFS Schedule -----------------+
                              +-- Node generator -- departures.json -- Vite SPA
GTFS-Realtime trip/vehicle ----+
```

This boundary is deliberate: a statically deployed SPA cannot safely hold the
`KeyID` credential or efficiently parse the statewide feeds. A production
version can run the same generator on a one-minute schedule and publish the
JSON to OCI Object Storage or another static origin.

For a split deployment, set `VITE_API_BASE_URL` to the public FastAPI origin
before `npm run build`, and set the matching frontend origin(s) in the
backend's `CORS_ORIGINS` environment variable. Keep
`VIC_TRANSPORT_API_KEY` only in the backend/ETL environment; it must never be
set as a `VITE_` variable or committed to the repository.

## Data sources and attribution

- [Transport Victoria GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule)
- [Transport Victoria GTFS Realtime](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime)
- [GTFS-Realtime reference](https://gtfs.org/documentation/realtime/reference/)
- [Dysons metropolitan route announcement](https://www.dysons.com.au/news/dysons-prepared-to-power-victoria%E2%80%99s-green-bus-future)

Transport data is provided by the Victorian Department of Transport and
Planning under the [Creative Commons Attribution 4.0 International
licence](https://creativecommons.org/licenses/by/4.0/).
