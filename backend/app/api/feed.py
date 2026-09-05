from __future__ import annotations

import time
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from ..config import get_settings
from ..database import connect
from ..gtfs.calendar import active_service_ids

router = APIRouter()


@router.get("/api/feed/status")
def feed_status() -> dict[str, object]:
    settings = get_settings()
    now = int(time.time())
    with connect(settings.db_path) as connection:
        rows = connection.execute(
            "SELECT feed_type, feed_timestamp, received_at, entity_count, mode FROM rt_feed_state"
        ).fetchall()
    result: dict[str, object] = {
        "staleAfterSeconds": settings.stale_seconds,
        "backendMode": "snapshot" if any(row["mode"] == "snapshot" for row in rows) else "live",
    }
    for row in rows:
        age = max(0, now - row["feed_timestamp"])
        result_key = "tripUpdates" if row["feed_type"] == "trip_updates" else "vehiclePositions"
        result[result_key] = {
            "feedTimestamp": row["feed_timestamp"],
            "receivedAt": row["received_at"],
            "entityCount": row["entity_count"],
            "ageSeconds": age,
            "stale": age > settings.stale_seconds,
            "mode": row["mode"],
        }
    for key in ("tripUpdates", "vehiclePositions"):
        result.setdefault(key, None)
    return result


@router.get("/api/feed/coverage")
def feed_coverage() -> dict[str, object]:
    """Development diagnostics for static completeness and observed realtime."""
    settings = get_settings()
    today = datetime.now(ZoneInfo("Australia/Melbourne")).date()
    with connect(settings.db_path) as connection:
        static = {}
        for branch in ("4", "5", "6"):
            active = active_service_ids(connection, today, (branch,))
            active_ids = [service_id for _, service_id in active]
            if active_ids:
                placeholders = ",".join("?" for _ in active_ids)
                active_trips = connection.execute(
                    f"SELECT COUNT(*) FROM gtfs_trip WHERE source_branch = ? AND service_id IN ({placeholders})",
                    [branch, *active_ids],
                ).fetchone()[0]
                active_stops = connection.execute(
                    f"""
                    SELECT COUNT(DISTINCT st.stop_id) FROM gtfs_stop_time st
                    WHERE st.source_branch = ? AND st.service_id IN ({placeholders})
                    """,
                    [branch, *active_ids],
                ).fetchone()[0]
            else:
                active_trips = 0
                active_stops = 0
            static[branch] = {
                "routes": connection.execute("SELECT COUNT(*) FROM gtfs_route WHERE source_branch = ?", (branch,)).fetchone()[0],
                "trips": connection.execute("SELECT COUNT(*) FROM gtfs_trip WHERE source_branch = ?", (branch,)).fetchone()[0],
                "stops": connection.execute("SELECT COUNT(*) FROM gtfs_stop_variant WHERE source_branch = ?", (branch,)).fetchone()[0],
                "activeTripsToday": active_trips,
                "activeStopsToday": active_stops,
            }
        matched_trip_updates = connection.execute(
            "SELECT COUNT(DISTINCT p.trip_id) FROM rt_stop_time_current p JOIN gtfs_trip t ON t.trip_id = p.trip_id"
        ).fetchone()[0]
        total_trip_updates = connection.execute(
            "SELECT COUNT(DISTINCT trip_id) FROM rt_stop_time_current"
        ).fetchone()[0]
        matched_vehicles = connection.execute(
            "SELECT COUNT(DISTINCT v.trip_id) FROM rt_vehicle_current v JOIN gtfs_trip t ON t.trip_id = v.trip_id"
        ).fetchone()[0]
        total_vehicles = connection.execute(
            "SELECT COUNT(DISTINCT trip_id) FROM rt_vehicle_current"
        ).fetchone()[0]
        live_routes = connection.execute(
            """
            SELECT COUNT(DISTINCT t.route_id) FROM rt_vehicle_current v
            JOIN gtfs_trip t ON t.trip_id = v.trip_id
            WHERE v.feed_timestamp >= CAST(strftime('%s', 'now') AS INTEGER) - ?
            """,
            (settings.stale_seconds,),
        ).fetchone()[0]
        observed_routes = connection.execute("SELECT COUNT(*) FROM rt_route_observation").fetchone()[0]
        observed_route_ids = {row[0] for row in connection.execute("SELECT route_id FROM rt_route_observation")}
        static_route_ids = {row[0] for row in connection.execute("SELECT route_id FROM gtfs_route")}
    return {
        "static": static,
        "realtime": {
            "tripUpdateTrips": total_trip_updates,
            "vehicleTrips": total_vehicles,
            "staticTripsMatched": matched_trip_updates,
            "staticTripsUnmatched": max(0, total_trip_updates - matched_trip_updates),
            "vehicleTripsMatched": matched_vehicles,
            "vehicleTripsUnmatched": max(0, total_vehicles - matched_vehicles),
        },
        "coverage": {
            "routesLiveNow": live_routes,
            "routesRealtimeObserved": observed_routes,
            "routesWithNoObservation": len(static_route_ids - observed_route_ids),
        },
    }
