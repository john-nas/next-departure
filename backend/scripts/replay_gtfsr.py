from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.database import initialise
from app.gtfs.realtime import entity_count, feed_timestamp, load_feed
from app.gtfs.repository import load_predictions, load_vehicles
from app.gtfs.transform import stop_predictions, vehicle_observations


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Replay saved GTFS-Realtime protobuf files")
    parser.add_argument("--trip", required=True, help="Trip Updates protobuf")
    parser.add_argument("--vehicle", required=True, help="Vehicle Positions protobuf")
    parser.add_argument("--db", default=str(settings.db_path))
    args = parser.parse_args()
    trip_feed = load_feed(args.trip)
    vehicle_feed = load_feed(args.vehicle)
    trip_timestamp = feed_timestamp(trip_feed)
    vehicle_timestamp = feed_timestamp(vehicle_feed)
    if trip_timestamp is None or vehicle_timestamp is None:
        parser.error("both protobuf files must contain a feed header timestamp")
    initialise(args.db)
    trip_loaded = load_predictions(
        args.db, stop_predictions(trip_feed), trip_timestamp, entity_count(trip_feed), "snapshot"
    )
    vehicle_loaded = load_vehicles(
        args.db,
        vehicle_observations(vehicle_feed),
        vehicle_timestamp,
        entity_count(vehicle_feed),
        "snapshot",
    )
    print(f"Trip Updates: {'loaded' if trip_loaded else 'unchanged'}")
    print(f"Vehicle Positions: {'loaded' if vehicle_loaded else 'unchanged'}")


if __name__ == "__main__":
    main()
