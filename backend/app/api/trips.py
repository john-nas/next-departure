from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..database import connect

router = APIRouter()


def _iso(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


@router.get("/api/trips/{trip_id}")
def trip_detail(trip_id: str) -> dict[str, object]:
    settings = get_settings()
    with connect(settings.db_path) as connection:
        trip = connection.execute(
            """
            SELECT t.*, r.route_short_name, r.route_long_name, r.mode_class,
                   r.route_color, v.latitude, v.longitude, v.bearing,
                   v.stop_id AS current_stop_id, v.current_stop_sequence,
                   v.current_status, v.vehicle_timestamp, v.feed_timestamp
            FROM gtfs_trip t
            LEFT JOIN gtfs_route r ON r.route_id = t.route_id
            LEFT JOIN rt_vehicle_current v ON v.trip_id = t.trip_id
            WHERE t.trip_id = ?
            """,
            (trip_id,),
        ).fetchone()
        predictions = connection.execute(
            """
            SELECT p.*, s.stop_name, s.stop_lat, s.stop_lon
            FROM rt_stop_time_current p
            LEFT JOIN gtfs_stop s ON s.stop_id = p.stop_id
            WHERE p.trip_id = ?
            ORDER BY p.stop_sequence
            """,
            (trip_id,),
        ).fetchall()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    vehicle = None
    if trip["vehicle_timestamp"] is not None:
        vehicle = {
            "latitude": trip["latitude"],
            "longitude": trip["longitude"],
            "bearing": trip["bearing"],
            "currentStopId": trip["current_stop_id"],
            "currentStopSequence": trip["current_stop_sequence"],
            "currentStatus": trip["current_status"],
            "reportedAt": _iso(trip["vehicle_timestamp"]),
            "feedTimestamp": trip["feed_timestamp"],
        }
    return {
        "tripId": trip["trip_id"],
        "route": {
            "routeId": trip["route_id"],
            "routeNumber": trip["route_short_name"],
            "routeName": trip["route_long_name"],
            "mode": trip["mode_class"],
            "routeColor": trip["route_color"],
        },
        "headsign": trip["trip_headsign"],
        "serviceId": trip["service_id"],
        "directionId": trip["direction_id"],
        "wheelchairAccessible": (
            None if trip["wheelchair_accessible"] is None else bool(trip["wheelchair_accessible"])
        ),
        "vehicle": vehicle,
        "predictions": [
            {
                "stopId": row["stop_id"],
                "stopName": row["stop_name"],
                "stopSequence": row["stop_sequence"],
                "arrivalAt": _iso(row["arrival_time"]),
                "departureAt": _iso(row["departure_time"]),
                "arrivalDelaySeconds": row["arrival_delay"],
                "departureDelaySeconds": row["departure_delay"],
                "scheduleRelationship": row["schedule_relationship"],
                "feedTimestamp": row["feed_timestamp"],
            }
            for row in predictions
        ],
    }
