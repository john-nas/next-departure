from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from ..config import get_settings
from ..database import connect

router = APIRouter()


def _iso(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def _vehicle_rows(route_id: str | None = None, mode: str | None = None) -> list[dict[str, object]]:
    settings = get_settings()
    cutoff = int(time.time()) - settings.stale_seconds
    clauses = ["v.feed_timestamp >= ?"]
    params: list[object] = [cutoff]
    if route_id:
        clauses.append("(v.route_id = ? OR t.route_id = ? OR r.route_short_name = ?)")
        params.extend([route_id, route_id, route_id])
    if mode:
        clauses.append("r.mode_class = ?")
        params.append(mode)
    where = " AND ".join(clauses)
    with connect(settings.db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT v.*, t.route_id AS trip_route_id,
                   t.trip_headsign,
                   r.route_id AS master_route_id, r.route_short_name,
                   r.route_long_name, r.mode_class,
                   next_stop.stop_name AS next_stop_name
            FROM rt_vehicle_current v
            LEFT JOIN gtfs_trip t ON t.trip_id = v.trip_id
            LEFT JOIN gtfs_route r ON r.route_id = COALESCE(t.route_id, v.route_id)
            LEFT JOIN rt_stop_time_current next_prediction
              ON next_prediction.trip_id = v.trip_id
             AND next_prediction.stop_sequence = (
                 SELECT MIN(p2.stop_sequence)
                 FROM rt_stop_time_current p2
                 WHERE p2.trip_id = v.trip_id
                   AND p2.stop_sequence > COALESCE(v.current_stop_sequence, 0)
                   AND COALESCE(p2.departure_time, p2.arrival_time) >= CAST(strftime('%s', 'now') AS INTEGER)
             )
            LEFT JOIN gtfs_stop next_stop ON next_stop.stop_id = next_prediction.stop_id
            WHERE {where}
            ORDER BY v.route_id, v.trip_id
            """,
            params,
        ).fetchall()
    now = int(time.time())
    return [
        {
            "tripId": row["trip_id"],
            "routeId": row["master_route_id"] or row["route_id"],
            "routeNumber": row["route_short_name"] or row["route_id"],
            "routeName": row["route_long_name"] or row["route_id"],
            "destination": row["trip_headsign"] or row["route_long_name"],
            "mode": row["mode_class"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "bearing": row["bearing"],
            "currentStopId": row["stop_id"],
            "currentStopSequence": row["current_stop_sequence"],
            "currentStatus": row["current_status"],
            "nextStopName": row["next_stop_name"],
            "reportedAt": _iso(row["vehicle_timestamp"] or row["feed_timestamp"]),
            "ageSeconds": max(0, now - (row["vehicle_timestamp"] or row["feed_timestamp"])),
            "stale": False,
        }
        for row in rows
    ]


@router.get("/api/live/vehicles")
def live_vehicles(
    route_id: str | None = Query(default=None),
    mode: str | None = Query(default=None),
) -> dict[str, object]:
    return {"vehicles": _vehicle_rows(route_id, mode)}


@router.get("/api/routes/{route_id}/vehicles")
def route_vehicles(route_id: str) -> dict[str, object]:
    return {"routeId": route_id, "vehicles": _vehicle_rows(route_id)}
