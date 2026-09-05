from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from ..config import get_settings
from ..database import connect
from ..gtfs.calendar import active_service_ids, service_dates_for_window, service_timestamp
from .stops import _scheduled_departures

router = APIRouter()


def _shape_payload(connection, route_id: str, max_points: int = 2000) -> list[dict[str, object]]:
    """Return source GTFS shape geometry, sampled only to keep map payloads small."""
    shape_ids = connection.execute(
        """
        SELECT DISTINCT source_branch, shape_id
        FROM gtfs_trip
        WHERE route_id = ? AND shape_id IS NOT NULL AND shape_id <> ''
        ORDER BY source_branch, shape_id
        LIMIT 12
        """,
        (route_id,),
    ).fetchall()
    shapes = []
    for item in shape_ids:
        points = connection.execute(
            """
            SELECT shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled
            FROM gtfs_shape
            WHERE source_branch = ? AND shape_id = ?
            ORDER BY shape_pt_sequence
            """,
            (item["source_branch"], item["shape_id"]),
        ).fetchall()
        if not points:
            continue
        # Preserve endpoints and order while bounding a statewide route response.
        stride = max(1, (len(points) + max_points - 1) // max_points)
        selected = points[::stride]
        if selected[-1] is not points[-1]:
            selected.append(points[-1])
        shapes.append({
            "sourceBranch": item["source_branch"],
            "shapeId": item["shape_id"],
            "pointCount": len(points),
            "coordinates": [[row["shape_pt_lon"], row["shape_pt_lat"]] for row in selected],
        })
    return shapes


def _iso(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def _route_payload(connection, route_row, now: int) -> dict[str, object]:
    branch = route_row["source_branch"]
    trips = connection.execute(
        """
        SELECT trip_id, service_id, trip_headsign, direction_id
        FROM gtfs_trip
        WHERE route_id = ?
        ORDER BY direction_id, trip_id
        """,
        (route_row["route_id"],),
    ).fetchall()
    active = set()
    start = datetime.fromtimestamp(now, timezone.utc)
    end = datetime.fromtimestamp(now + 24 * 60 * 60, timezone.utc)
    for service_date in service_dates_for_window(start, end):
        active.update((branch, service_id, service_date) for service_branch, service_id in active_service_ids(connection, service_date, (branch,)) if service_branch == branch)
    active_trips = [trip for trip in trips if any((branch, trip["service_id"], date) in active for date in {item[2] for item in active})]
    patterns: dict[tuple[str | None, int | None], dict[str, object]] = {}
    for trip in active_trips:
        key = (trip["trip_headsign"], trip["direction_id"])
        patterns.setdefault(key, {"headsign": trip["trip_headsign"], "directionId": trip["direction_id"]})

    representative = {}
    for trip in active_trips:
        key = (trip["trip_headsign"], trip["direction_id"])
        representative.setdefault(key, trip["trip_id"])
    stops: list[dict[str, object]] = []
    if representative:
        trip_id = next(iter(representative.values()))
        stops = [
            {
                "stopId": row["stop_id"],
                "stopName": row["stop_name"],
                "stopSequence": row["stop_sequence"],
                "latitude": row["stop_lat"],
                "longitude": row["stop_lon"],
            }
            for row in connection.execute(
                """
                SELECT st.stop_id, st.stop_sequence, sv.stop_name, sv.stop_lat, sv.stop_lon
                FROM gtfs_stop_time st
                LEFT JOIN gtfs_stop_variant sv
                  ON sv.source_branch = st.source_branch AND sv.stop_id = st.stop_id
                WHERE st.trip_id = ? ORDER BY st.stop_sequence
                """,
                (trip_id,),
            ).fetchall()
        ]

    next_services: list[dict[str, object]] = []
    for trip in active_trips[:500]:
        first_stop = connection.execute(
            """
            SELECT stop_id, stop_sequence, departure_seconds, arrival_seconds
            FROM gtfs_stop_time WHERE trip_id = ? ORDER BY stop_sequence LIMIT 1
            """,
            (trip["trip_id"],),
        ).fetchone()
        if not first_stop:
            continue
        seconds = first_stop["departure_seconds"] or first_stop["arrival_seconds"]
        if seconds is None:
            continue
        for active_branch, active_service, service_date in active:
            if active_branch != branch or active_service != trip["service_id"]:
                continue
            scheduled_at = service_timestamp(service_date, seconds)
            if now <= scheduled_at <= now + 24 * 60 * 60:
                next_services.append(
                    {
                        "tripId": trip["trip_id"],
                        "stopId": first_stop["stop_id"],
                        "stopSequence": first_stop["stop_sequence"],
                        "scheduledAt": _iso(scheduled_at),
                        "destination": trip["trip_headsign"],
                        "directionId": trip["direction_id"],
                    }
                )
    next_services.sort(key=lambda item: item["scheduledAt"] or "")

    return {
        "routeId": route_row["route_id"],
        "sourceBranch": branch,
        "mode": route_row["mode_class"],
        "routeNumber": route_row["route_short_name"],
        "routeName": route_row["route_long_name"],
        "routeColor": route_row["route_color"],
        "routeTextColor": route_row["route_text_color"],
        "patterns": list(patterns.values()),
        "stops": stops,
        "nextServices": next_services[:10],
    }


@router.get("/api/routes")
def routes(
    mode: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> dict[str, object]:
    settings = get_settings()
    clauses: list[str] = []
    params: list[object] = []
    if mode:
        clauses.append("gtfs_route.mode_class = ?")
        params.append(mode)
    if search:
        clauses.append("(gtfs_route.route_id LIKE ? OR gtfs_route.route_short_name LIKE ? OR gtfs_route.route_long_name LIKE ?)")
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connect(settings.db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT gtfs_route.route_id, gtfs_route.source_branch, gtfs_route.mode_class,
                   gtfs_route.route_short_name, gtfs_route.route_long_name,
                   gtfs_route.route_type, gtfs_route.route_color, gtfs_route.route_text_color,
                   o.first_seen_at, o.last_seen_at,
                   o.trip_update_seen_count, o.vehicle_position_seen_count,
                   o.last_trip_update_at, o.last_vehicle_position_at,
                   (SELECT COUNT(DISTINCT t.trip_id)
                    FROM gtfs_trip t JOIN rt_vehicle_current v ON v.trip_id = t.trip_id
                    WHERE t.route_id = gtfs_route.route_id
                      AND v.feed_timestamp >= CAST(strftime('%s', 'now') AS INTEGER) - ?) AS live_now
            FROM gtfs_route
            LEFT JOIN rt_route_observation o ON o.route_id = gtfs_route.route_id
            {where}
            ORDER BY gtfs_route.route_short_name, gtfs_route.route_id
            """,
            [settings.stale_seconds, *params],
        ).fetchall()
    return {
        "routes": [
            {
                "routeId": row["route_id"], "sourceBranch": row["source_branch"],
                "mode": row["mode_class"], "routeNumber": row["route_short_name"],
                "routeName": row["route_long_name"], "routeType": row["route_type"],
                "routeColor": row["route_color"], "routeTextColor": row["route_text_color"],
                "liveNow": bool(row["live_now"]),
                "vehicleRealtimeObserved": row["vehicle_position_seen_count"] is not None and row["vehicle_position_seen_count"] > 0,
                "predictionRealtimeObserved": row["trip_update_seen_count"] is not None and row["trip_update_seen_count"] > 0,
                "lastRealtimeObservedAt": row["last_seen_at"],
            }
            for row in rows
        ]
    }


@router.get("/api/routes/{route_id}")
def route_detail(route_id: str) -> dict[str, object]:
    settings = get_settings()
    with connect(settings.db_path) as connection:
        rows = connection.execute(
            """
            SELECT route_id, source_branch, mode_class, route_short_name,
                   route_long_name, route_color, route_text_color
            FROM gtfs_route
            WHERE route_id = ? OR route_short_name = ?
            ORDER BY source_branch, route_id
            """,
            (route_id, route_id),
        ).fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="Route not found")
        payload = [_route_payload(connection, row, int(time.time())) for row in rows]
    return {"routes": payload, "route": payload[0]}


@router.get("/api/routes/{route_id}/shape")
def route_shape(route_id: str) -> dict[str, object]:
    settings = get_settings()
    with connect(settings.db_path) as connection:
        routes = connection.execute(
            "SELECT route_id, source_branch FROM gtfs_route WHERE route_id = ? OR route_short_name = ? ORDER BY source_branch, route_id",
            (route_id, route_id),
        ).fetchall()
        if not routes:
            raise HTTPException(status_code=404, detail="Route not found")
        shapes = []
        for route in routes:
            shapes.extend([{**shape, "routeId": route["route_id"]} for shape in _shape_payload(connection, route["route_id"])])
    return {"routeId": route_id, "available": bool(shapes), "shapes": shapes}


@router.get("/api/routes/{route_id}/departures")
def route_departures(
    route_id: str,
    stop_id: str | None = Query(default=None),
    direction_id: int | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> dict[str, object]:
    settings = get_settings()
    now = int(time.time())
    with connect(settings.db_path) as connection:
        routes = connection.execute(
            "SELECT route_id, route_short_name, route_long_name FROM gtfs_route WHERE route_id = ? OR route_short_name = ? ORDER BY source_branch, route_id",
            (route_id, route_id),
        ).fetchall()
        if not routes:
            raise HTTPException(status_code=404, detail="Route not found")
        # A route board defaults to the first stop of each trip; callers can pass
        # stop_id for a particular boarding point.
        departures = []
        for route in routes:
            departures.extend(_scheduled_departures(
                connection, stop_id, now, limit=limit,
                route_id=route["route_id"], direction_id=direction_id,
                first_stop_only=stop_id is None,
            ))
        departures.sort(key=lambda item: item.get("scheduledAt") or "")
    return {"routeId": route_id, "departures": departures[:limit]}
