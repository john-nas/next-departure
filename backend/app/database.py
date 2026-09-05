from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS gtfs_route (
    route_id TEXT PRIMARY KEY,
    source_branch TEXT NOT NULL,
    mode_class TEXT NOT NULL,
    route_short_name TEXT,
    route_long_name TEXT,
    route_type INTEGER,
    route_color TEXT,
    route_text_color TEXT
);
CREATE INDEX IF NOT EXISTS idx_gtfs_route_mode ON gtfs_route(mode_class);

CREATE TABLE IF NOT EXISTS gtfs_trip (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    service_id TEXT,
    shape_id TEXT,
    trip_headsign TEXT,
    direction_id INTEGER,
    wheelchair_accessible INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gtfs_trip_route ON gtfs_trip(route_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_trip_service ON gtfs_trip(service_id);

CREATE TABLE IF NOT EXISTS gtfs_stop (
    stop_id TEXT PRIMARY KEY,
    stop_name TEXT,
    stop_lat REAL,
    stop_lon REAL,
    mode_class TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_id ON gtfs_stop(stop_id);

CREATE TABLE IF NOT EXISTS gtfs_stop_variant (
    source_branch TEXT NOT NULL,
    stop_id TEXT NOT NULL,
    stop_name TEXT,
    stop_lat REAL,
    stop_lon REAL,
    wheelchair_boarding INTEGER,
    PRIMARY KEY (source_branch, stop_id)
);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_variant_id ON gtfs_stop_variant(stop_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_variant_location
    ON gtfs_stop_variant(stop_lat, stop_lon);

CREATE TABLE IF NOT EXISTS gtfs_calendar (
    source_branch TEXT NOT NULL,
    service_id TEXT NOT NULL,
    monday INTEGER NOT NULL,
    tuesday INTEGER NOT NULL,
    wednesday INTEGER NOT NULL,
    thursday INTEGER NOT NULL,
    friday INTEGER NOT NULL,
    saturday INTEGER NOT NULL,
    sunday INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    PRIMARY KEY (source_branch, service_id)
);
CREATE INDEX IF NOT EXISTS idx_gtfs_calendar_service ON gtfs_calendar(service_id);

CREATE TABLE IF NOT EXISTS gtfs_calendar_date (
    source_branch TEXT NOT NULL,
    service_id TEXT NOT NULL,
    service_date TEXT NOT NULL,
    exception_type INTEGER NOT NULL,
    PRIMARY KEY (source_branch, service_id, service_date)
);
CREATE INDEX IF NOT EXISTS idx_gtfs_calendar_date_lookup
    ON gtfs_calendar_date(source_branch, service_id, service_date);

CREATE TABLE IF NOT EXISTS gtfs_stop_time (
    source_branch TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    route_id TEXT,
    service_id TEXT,
    stop_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    arrival_seconds INTEGER,
    departure_seconds INTEGER,
    stop_headsign TEXT,
    pickup_type INTEGER,
    drop_off_type INTEGER,
    shape_dist_traveled REAL,
    PRIMARY KEY (source_branch, trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_time_stop_departure
    ON gtfs_stop_time(stop_id, departure_seconds);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_time_trip_sequence
    ON gtfs_stop_time(trip_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_time_service
    ON gtfs_stop_time(source_branch, service_id, departure_seconds);

CREATE TABLE IF NOT EXISTS gtfs_shape (
    source_branch TEXT NOT NULL,
    shape_id TEXT NOT NULL,
    shape_pt_lat REAL NOT NULL,
    shape_pt_lon REAL NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    shape_dist_traveled REAL,
    PRIMARY KEY (source_branch, shape_id, shape_pt_sequence)
);
CREATE INDEX IF NOT EXISTS idx_gtfs_shape_id ON gtfs_shape(shape_id, shape_pt_sequence);

CREATE TABLE IF NOT EXISTS rt_feed_state (
    feed_type TEXT PRIMARY KEY,
    feed_timestamp INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    entity_count INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'live'
);

CREATE TABLE IF NOT EXISTS rt_vehicle_current (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT,
    vehicle_id TEXT,
    latitude REAL,
    longitude REAL,
    bearing REAL,
    stop_id TEXT,
    current_stop_sequence INTEGER,
    current_status INTEGER,
    vehicle_timestamp INTEGER,
    feed_timestamp INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rt_vehicle_route ON rt_vehicle_current(route_id);
CREATE INDEX IF NOT EXISTS idx_rt_vehicle_feed ON rt_vehicle_current(feed_timestamp);

CREATE TABLE IF NOT EXISTS rt_stop_time_current (
    trip_id TEXT NOT NULL,
    route_id TEXT,
    stop_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    arrival_time INTEGER,
    departure_time INTEGER,
    arrival_delay INTEGER,
    departure_delay INTEGER,
    schedule_relationship INTEGER,
    feed_timestamp INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (trip_id, stop_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_rt_stop_time_stop_departure
    ON rt_stop_time_current(stop_id, departure_time);
CREATE INDEX IF NOT EXISTS idx_rt_stop_time_trip
    ON rt_stop_time_current(trip_id);

CREATE TABLE IF NOT EXISTS rt_route_observation (
    route_id TEXT PRIMARY KEY,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    trip_update_seen_count INTEGER NOT NULL DEFAULT 0,
    vehicle_position_seen_count INTEGER NOT NULL DEFAULT 0,
    last_trip_update_at TEXT,
    last_vehicle_position_at TEXT
);
"""


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialise(db_path: Path | str) -> None:
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        columns = {row[1] for row in connection.execute("PRAGMA table_info(rt_feed_state)")}
        if "mode" not in columns:
            connection.execute(
                "ALTER TABLE rt_feed_state ADD COLUMN mode TEXT NOT NULL DEFAULT 'live'"
            )
        trip_columns = {row[1] for row in connection.execute("PRAGMA table_info(gtfs_trip)")}
        if "source_branch" not in trip_columns:
            connection.execute(
                "ALTER TABLE gtfs_trip ADD COLUMN source_branch TEXT NOT NULL DEFAULT ''"
            )
        stop_columns = {row[1] for row in connection.execute("PRAGMA table_info(gtfs_stop)")}
        if "source_branch" not in stop_columns:
            connection.execute(
                "ALTER TABLE gtfs_stop ADD COLUMN source_branch TEXT NOT NULL DEFAULT ''"
            )


@contextmanager
def transaction(db_path: Path | str) -> Iterator[sqlite3.Connection]:
    connection = connect(db_path)
    try:
        connection.execute("BEGIN")
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
