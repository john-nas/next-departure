from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from math import cos, radians, sqrt

from fastapi import APIRouter, HTTPException, Query

from ..config import get_settings
from ..database import connect
from ..gtfs.calendar import active_service_ids, service_dates_for_window, service_timestamp

router = APIRouter()


def _iso_or_none(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def _distance_m(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    scale = 111_320.0
    x = radians(lon_b - lon_a) * cos(radians((lat_a + lat_b) / 2))
    y = radians(lat_b - lat_a)
    return sqrt(x * x + y * y) * scale


def _variant(connection, stop_id: str):
    return connection.execute(
        """
        SELECT stop_id, stop_name, stop_lat, stop_lon, source_branch
        FROM gtfs_stop_variant
        WHERE stop_id = ?
        ORDER BY source_branch
        LIMIT 1
        """,
        (stop_id,),
    ).fetchone()


def _scheduled_departures(
    connection,
    stop_id: str | None,
    now: int,
    limit: int = 200,
    route_id: str | None = None,
    direction_id: int | None = None,
    first_stop_only: bool = False,
) -> list[dict[str, object]]:
    horizon = now + 24 * 60 * 60
    start = datetime.fromtimestamp(now, timezone.utc)
    end = datetime.fromtimestamp(horizon, timezone.utc)
    service_dates = service_dates_for_window(start, end)
    active = set()
    for service_date in service_dates:
        for branch, service_id in active_service_ids(connection, service_date):
            active.add((branch, service_id, service_date))

    clauses = []
    params: list[object] = []
    if stop_id:
        clauses.append("st.stop_id = ?")
        params.append(stop_id)
    if route_id:
        clauses.append("st.route_id = ?")
        params.append(route_id)
    if direction_id is not None:
        clauses.append("t.direction_id = ?")
        params.append(direction_id)
    if first_stop_only:
        clauses.append("st.stop_sequence = (SELECT MIN(st2.stop_sequence) FROM gtfs_stop_time st2 WHERE st2.trip_id = st.trip_id)")
    where = " AND ".join(clauses) if clauses else "1 = 1"
    rows = connection.execute(
        f"""
        SELECT st.*, t.trip_headsign, t.wheelchair_accessible,
               r.route_id AS master_route_id, r.route_short_name,
               r.route_long_name, r.mode_class,
               sv.stop_name, sv.stop_lat, sv.stop_lon
        FROM gtfs_stop_time st
        JOIN gtfs_trip t ON t.trip_id = st.trip_id
        LEFT JOIN gtfs_route r ON r.route_id = st.route_id
        LEFT JOIN gtfs_stop_variant sv
          ON sv.source_branch = st.source_branch AND sv.stop_id = st.stop_id
        WHERE {where}
        """,
        params,
    ).fetchall()
    rt_clauses = []
    rt_params: list[object] = []
    if stop_id:
        rt_clauses.append("p.stop_id = ?")
        rt_params.append(stop_id)
    if route_id:
        rt_clauses.append("t.route_id = ?")
        rt_params.append(route_id)
    rt_where = " AND ".join(rt_clauses) if rt_clauses else "1 = 1"
    realtime_rows = connection.execute(
        f"""
        SELECT p.*, v.latitude AS vehicle_latitude, v.longitude AS vehicle_longitude,
               v.bearing AS vehicle_bearing, v.vehicle_timestamp,
               v.feed_timestamp AS vehicle_feed_timestamp
        FROM rt_stop_time_current p
        LEFT JOIN gtfs_trip t ON t.trip_id = p.trip_id
        LEFT JOIN rt_vehicle_current v ON v.trip_id = p.trip_id
        WHERE {rt_where}
        """,
        rt_params,
    ).fetchall()
    realtime = {(row["trip_id"], row["stop_sequence"]): row for row in realtime_rows}
    cutoff = now - get_settings().stale_seconds
    result: list[dict[str, object]] = []
    for row in rows:
        for branch, service_id, service_date in active:
            if row["source_branch"] != branch or row["service_id"] != service_id:
                continue
            scheduled_seconds = row["departure_seconds"]
            if scheduled_seconds is None:
                scheduled_seconds = row["arrival_seconds"]
            if scheduled_seconds is None:
                continue
            scheduled_at = service_timestamp(service_date, scheduled_seconds)
            if scheduled_at < now - 90 or scheduled_at > horizon:
                continue
            rt = realtime.get((row["trip_id"], row["stop_sequence"]))
            rt_fresh = rt is not None and rt["feed_timestamp"] >= cutoff
            vehicle_fresh = rt_fresh and rt["vehicle_feed_timestamp"] is not None and rt["vehicle_feed_timestamp"] >= cutoff
            expected_at = None
            delay_seconds = None
            relationship = None
            if rt_fresh:
                expected_at = rt["departure_time"] or rt["arrival_time"]
                delay_seconds = rt["departure_delay"] or rt["arrival_delay"]
                relationship = rt["schedule_relationship"]
            result.append(
                {
                    "tripId": row["trip_id"],
                    "routeId": row["master_route_id"] or row["route_id"],
                    "routeNumber": row["route_short_name"],
                    "routeName": row["route_long_name"],
                    "destination": row["trip_headsign"] or row["stop_headsign"] or row["route_long_name"],
                    "stopId": row["stop_id"],
                    "stopSequence": row["stop_sequence"],
                    "scheduledAt": _iso_or_none(scheduled_at),
                    "expectedAt": _iso_or_none(expected_at),
                    # Legacy aliases retained for the current frontend mapper.
                    "arrivalAt": _iso_or_none(expected_at or scheduled_at),
                    "departureAt": _iso_or_none(expected_at or scheduled_at),
                    "arrivalDelaySeconds": rt["arrival_delay"] if rt_fresh else None,
                    "departureDelaySeconds": delay_seconds,
                    "delaySeconds": delay_seconds,
                    "scheduleRelationship": relationship,
                    "realtime": {
                        "tripUpdate": rt_fresh,
                        "vehiclePosition": vehicle_fresh,
                    },
                    "status": (
                        "cancelled" if relationship == 1 else
                        "stale" if rt is not None and not rt_fresh else
                        "live" if rt_fresh else "timetable"
                    ),
                    "wheelchairAccessible": (
                        None if row["wheelchair_accessible"] is None
                        else bool(row["wheelchair_accessible"])
                    ),
                    "mode": row["mode_class"],
                    "feedTimestamp": rt["feed_timestamp"] if rt_fresh else None,
                    "vehicle": (
                        {
                            "latitude": rt["vehicle_latitude"],
                            "longitude": rt["vehicle_longitude"],
                            "bearing": rt["vehicle_bearing"],
                            "reportedAt": _iso_or_none(rt["vehicle_timestamp"] or rt["vehicle_feed_timestamp"]),
                        }
                        if vehicle_fresh and rt["vehicle_latitude"] is not None
                        else None
                    ),
                }
            )
    result.sort(key=lambda item: item["scheduledAt"] or "")
    return result[:limit]


@router.get("/api/stops/nearby")
def nearby_stops(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(default=10_000, ge=250, le=50_000),
    limit: int = Query(default=6, ge=1, le=20),
) -> dict[str, object]:
    settings = get_settings()
    lat_delta = radius_m / 111_320
    lon_delta = radius_m / (111_320 * max(0.2, cos(radians(lat))))
    now = int(time.time())
    with connect(settings.db_path) as connection:
        stop_rows = connection.execute(
            """
            SELECT source_branch, stop_id, stop_name, stop_lat, stop_lon
            FROM gtfs_stop_variant
            WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?
            """,
            (lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta),
        ).fetchall()
        nearest = sorted(
            ((row, _distance_m(lat, lon, row["stop_lat"], row["stop_lon"])) for row in stop_rows),
            key=lambda item: item[1],
        )[:limit]
        result = []
        for row, distance_m in nearest:
            departures = _scheduled_departures(connection, row["stop_id"], now, 5)
            result.append(
                {
                    "stopId": row["stop_id"], "stopName": row["stop_name"],
                    "latitude": row["stop_lat"], "longitude": row["stop_lon"],
                    "mode": "unknown", "distanceMeters": round(distance_m),
                    "departures": departures,
                }
            )
    return {"stops": result}


@router.get("/api/stops/{stop_id}/departures")
def stop_departures(stop_id: str) -> dict[str, object]:
    settings = get_settings()
    now = int(time.time())
    with connect(settings.db_path) as connection:
        stop = _variant(connection, stop_id)
        if not stop:
            raise HTTPException(status_code=404, detail="Stop not found")
        departures = _scheduled_departures(connection, stop_id, now)
    return {
        "stop": {
            "stopId": stop["stop_id"], "stopName": stop["stop_name"],
            "latitude": stop["stop_lat"], "longitude": stop["stop_lon"],
            "mode": "unknown",
        },
        "departures": departures,
    }
