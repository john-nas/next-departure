from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone

from ..database import transaction
from ..models import StopPrediction, VehicleObservation


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def stored_feed_timestamp(connection: sqlite3.Connection, feed_type: str) -> int | None:
    row = connection.execute(
        "SELECT feed_timestamp FROM rt_feed_state WHERE feed_type = ?", (feed_type,)
    ).fetchone()
    return int(row["feed_timestamp"]) if row else None


def _observe_routes(
    connection: sqlite3.Connection,
    trip_ids: set[str],
    explicit_routes: dict[str, str | None],
    feed_timestamp: int,
    kind: str,
) -> None:
    observed_at = datetime.fromtimestamp(feed_timestamp, timezone.utc).isoformat().replace("+00:00", "Z")
    for trip_id in trip_ids:
        row = connection.execute(
            "SELECT route_id FROM gtfs_trip WHERE trip_id = ?", (trip_id,)
        ).fetchone()
        route_id = row["route_id"] if row else explicit_routes.get(trip_id)
        if not route_id:
            continue
        trip_increment = 1 if kind == "trip_update" else 0
        vehicle_increment = 1 if kind == "vehicle_position" else 0
        connection.execute(
            """
            INSERT INTO rt_route_observation
                (route_id, first_seen_at, last_seen_at, trip_update_seen_count,
                 vehicle_position_seen_count, last_trip_update_at,
                 last_vehicle_position_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(route_id) DO UPDATE SET
                last_seen_at=excluded.last_seen_at,
                trip_update_seen_count=rt_route_observation.trip_update_seen_count + excluded.trip_update_seen_count,
                vehicle_position_seen_count=rt_route_observation.vehicle_position_seen_count + excluded.vehicle_position_seen_count,
                last_trip_update_at=COALESCE(excluded.last_trip_update_at, rt_route_observation.last_trip_update_at),
                last_vehicle_position_at=COALESCE(excluded.last_vehicle_position_at, rt_route_observation.last_vehicle_position_at)
            """,
            (
                route_id, observed_at, observed_at, trip_increment, vehicle_increment,
                observed_at if kind == "trip_update" else None,
                observed_at if kind == "vehicle_position" else None,
            ),
        )


def load_vehicles(
    db_path: str,
    observations: list[VehicleObservation],
    feed_timestamp: int,
    entity_count: int,
    mode: str = "live",
) -> bool:
    with transaction(db_path) as connection:
        existing = stored_feed_timestamp(connection, "vehicle_positions")
        if existing is not None and feed_timestamp <= existing:
            return False
        updated_at = utc_now()
        connection.executemany(
            """
            INSERT INTO rt_vehicle_current
                (trip_id, route_id, vehicle_id, latitude, longitude, bearing,
                 stop_id, current_stop_sequence, current_status,
                 vehicle_timestamp, feed_timestamp, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(trip_id) DO UPDATE SET
                route_id=excluded.route_id,
                vehicle_id=excluded.vehicle_id,
                latitude=excluded.latitude,
                longitude=excluded.longitude,
                bearing=excluded.bearing,
                stop_id=excluded.stop_id,
                current_stop_sequence=excluded.current_stop_sequence,
                current_status=excluded.current_status,
                vehicle_timestamp=excluded.vehicle_timestamp,
                feed_timestamp=excluded.feed_timestamp,
                updated_at=excluded.updated_at
            """,
            [
                (
                    item.trip_id,
                    item.route_id,
                    item.vehicle_id,
                    item.latitude,
                    item.longitude,
                    item.bearing,
                    item.stop_id,
                    item.current_stop_sequence,
                    item.current_status,
                    item.vehicle_timestamp,
                    feed_timestamp,
                    updated_at,
                )
                for item in observations
            ],
        )
        _observe_routes(
            connection,
            {item.trip_id for item in observations},
            {item.trip_id: item.route_id for item in observations},
            feed_timestamp,
            "vehicle_position",
        )
        # The latest complete vehicle feed defines current state. Vehicles
        # absent from it should not linger indefinitely.
        connection.execute(
            "DELETE FROM rt_vehicle_current WHERE feed_timestamp < ?", (feed_timestamp,)
        )
        connection.execute(
            """
            INSERT INTO rt_feed_state(feed_type, feed_timestamp, received_at, entity_count, mode)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(feed_type) DO UPDATE SET
                feed_timestamp=excluded.feed_timestamp,
                received_at=excluded.received_at,
                entity_count=excluded.entity_count,
                mode=excluded.mode
            """,
            ("vehicle_positions", feed_timestamp, updated_at, entity_count, mode),
        )
    return True


def load_predictions(
    db_path: str,
    predictions: list[StopPrediction],
    feed_timestamp: int,
    entity_count: int,
    mode: str = "live",
) -> bool:
    with transaction(db_path) as connection:
        existing = stored_feed_timestamp(connection, "trip_updates")
        if existing is not None and feed_timestamp <= existing:
            return False
        updated_at = utc_now()
        connection.executemany(
            """
            INSERT INTO rt_stop_time_current
                (trip_id, route_id, stop_id, stop_sequence, arrival_time,
                 departure_time, arrival_delay, departure_delay,
                 schedule_relationship, feed_timestamp, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(trip_id, stop_id, stop_sequence) DO UPDATE SET
                route_id=excluded.route_id,
                arrival_time=excluded.arrival_time,
                departure_time=excluded.departure_time,
                arrival_delay=excluded.arrival_delay,
                departure_delay=excluded.departure_delay,
                schedule_relationship=excluded.schedule_relationship,
                feed_timestamp=excluded.feed_timestamp,
                updated_at=excluded.updated_at
            """,
            [
                (
                    item.trip_id,
                    item.route_id,
                    item.stop_id,
                    item.stop_sequence,
                    item.arrival_time,
                    item.departure_time,
                    item.arrival_delay,
                    item.departure_delay,
                    item.schedule_relationship,
                    feed_timestamp,
                    updated_at,
                )
                for item in predictions
            ],
        )
        _observe_routes(
            connection,
            {item.trip_id for item in predictions},
            {item.trip_id: item.route_id for item in predictions},
            feed_timestamp,
            "trip_update",
        )
        connection.execute(
            "DELETE FROM rt_stop_time_current WHERE feed_timestamp < ?", (feed_timestamp,)
        )
        connection.execute(
            """
            DELETE FROM rt_stop_time_current
            WHERE COALESCE(departure_time, arrival_time) < ?
            """,
            (int(time.time()) - 90,),
        )
        connection.execute(
            """
            INSERT INTO rt_feed_state(feed_type, feed_timestamp, received_at, entity_count, mode)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(feed_type) DO UPDATE SET
                feed_timestamp=excluded.feed_timestamp,
                received_at=excluded.received_at,
                entity_count=excluded.entity_count,
                mode=excluded.mode
            """,
            ("trip_updates", feed_timestamp, updated_at, entity_count, mode),
        )
    return True
