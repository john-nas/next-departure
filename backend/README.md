# Local backend

This backend proves the production-shaped boundary:

```text
Transport Victoria → Python ETL → SQLite current state → FastAPI → Vite
```

The local SQLite schema is intentionally close to a future Oracle ADW model.
The ETL writes current vehicle and stop-prediction state in transactions, while
`rt_feed_state` rejects repeated or older GTFS-Realtime snapshots by header
timestamp. SQLite WAL mode lets the ETL worker write while FastAPI reads.

## Windows setup

From this `backend` directory:

```powershell
py -3 -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python scripts/init_db.py
```

Set `GTFS_STATIC_SOURCE` to the parent GTFS directory (for example
`C:\path\to\gtfs`) or pass `--source` directly. Each branch may contain either
`google_transit.zip` or an already extracted `google_transit` folder; both
layouts are supported. Import the three relevant branches independently from
realtime:

```powershell
python scripts/import_static_gtfs.py --source C:\path\to\gtfs --branches 4,5,6
```

The importer loads stop times, service calendars, calendar exceptions and
route shapes in batches. Branch 5's `shapes.txt` is exceptionally large and is
skipped by default; opt in with `--include-coach-shapes` when that geometry is
needed for coach maps.

Folder 4 is `myki-bus` and is the regional realtime-capable branch. Folders 5
and 6 are preserved as `regional-coach` and `regional-bus` schedule-first
master data. No contracted operator names are inferred.

## ETL and API

Replay saved protobufs through the same transform/load path as live feeds:

```powershell
python scripts/replay_gtfsr.py --trip path\trip.pb --vehicle path\vehicle.pb
```

Run one live snapshot or poll continuously:

```powershell
python scripts/run_realtime_etl.py --once
python scripts/run_realtime_etl.py --live
```

In another terminal, run the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

If the Vite console shows `502 (Bad Gateway)`, check the API directly before
checking the Transport Victoria key:

```powershell
Invoke-WebRequest http://localhost:8000/api/health
```

The Vite proxy target is `http://localhost:8000`. On Windows installations
where `localhost` resolves to IPv6, start Uvicorn on that address explicitly:

```powershell
uvicorn app.main:app --host ::1 --port 8000
```

Then verify the live provider separately with `python scripts/run_realtime_etl.py
--once`. A successful run reports Trip Updates and Vehicle Positions entity
counts; a `401`/`403` there indicates a key or provider-account issue, while a
browser `502` indicates the local proxy/backend is unavailable.

Swagger is available at http://localhost:8000/docs. The initial passenger API
surface is `/api/health`, `/api/feed/status`, `/api/live/vehicles`,
`/api/routes`, `/api/routes/{route_id}/vehicles`,
`/api/routes/{route_id}/shape`, `/api/routes/{route_id}/departures`,
`/api/stops/nearby`, `/api/stops/{stop_id}/departures`, and `/api/trips/{trip_id}`.

The eventual hosted shape is Python ingestion → Object Storage/OIC → Oracle
ADW → API Gateway → Vite. The local boundaries intentionally keep that future
translation straightforward.
