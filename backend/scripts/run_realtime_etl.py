from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings, get_settings
from app.database import initialise
from app.gtfs.realtime import entity_count, feed_timestamp, fetch_feed, load_feed
from app.gtfs.repository import load_predictions, load_vehicles
from app.gtfs.transform import stop_predictions, vehicle_observations

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
LOGGER = logging.getLogger("next-departure-etl")


def _raw_path(settings: Settings, feed_type: str) -> Path:
    day = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    settings.raw_dir.joinpath(day).mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%H%M%S')
    return settings.raw_dir / day / f"{stamp}-{feed_type}.pb"


def _load_or_fetch(path: str | None, url: str, settings: Settings):
    feed = load_feed(path) if path else fetch_feed(url, settings.api_key)
    timestamp = feed_timestamp(feed)
    if timestamp is None:
        raise ValueError("GTFS-Realtime feed has no header timestamp")
    if settings.save_raw and not path:
        _raw_path(settings, "trip" if url == settings.trip_url else "vehicle").write_bytes(
            feed.SerializeToString()
        )
    return feed, timestamp


def process_once(
    settings: Settings,
    trip_file: str | None = None,
    vehicle_file: str | None = None,
) -> dict[str, bool]:
    initialise(settings.db_path)
    trip_feed, trip_timestamp = _load_or_fetch(trip_file, settings.trip_url, settings)
    vehicle_feed, vehicle_timestamp = _load_or_fetch(vehicle_file, settings.vehicle_url, settings)
    trip_loaded = load_predictions(
        str(settings.db_path),
        stop_predictions(trip_feed),
        trip_timestamp,
        entity_count(trip_feed),
    )
    vehicle_loaded = load_vehicles(
        str(settings.db_path),
        vehicle_observations(vehicle_feed),
        vehicle_timestamp,
        entity_count(vehicle_feed),
    )
    LOGGER.info(
        "Trip Updates: %s, %s entities",
        "new feed" if trip_loaded else "unchanged",
        entity_count(trip_feed),
    )
    LOGGER.info(
        "Vehicle Positions: %s, %s entities",
        "new feed" if vehicle_loaded else "unchanged",
        entity_count(vehicle_feed),
    )
    return {"trip_updates": trip_loaded, "vehicle_positions": vehicle_loaded}


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Poll and load Transport Victoria GTFS-Realtime")
    parser.add_argument("--live", action="store_true", help="poll continuously")
    parser.add_argument("--once", action="store_true", help="process one feed snapshot")
    parser.add_argument("--trip-file", help="use a local Trip Updates protobuf")
    parser.add_argument("--vehicle-file", help="use a local Vehicle Positions protobuf")
    args = parser.parse_args()
    if bool(args.trip_file) != bool(args.vehicle_file):
        parser.error("--trip-file and --vehicle-file must be supplied together")
    if args.live and (args.trip_file or args.vehicle_file):
        parser.error("--live cannot be combined with local protobuf files")
    if args.live and args.once:
        parser.error("choose --live or --once")

    if not args.live:
        process_once(settings, args.trip_file, args.vehicle_file)
        return

    LOGGER.info("Polling GTFS-Realtime every %s seconds", settings.poll_seconds)
    while True:
        try:
            process_once(settings)
        except Exception as error:  # keep a temporary network/protobuf error from killing the worker
            LOGGER.error("ETL refresh failed; current SQLite state preserved: %s", error)
        time.sleep(settings.poll_seconds)


if __name__ == "__main__":
    main()
