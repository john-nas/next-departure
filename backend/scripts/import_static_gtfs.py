from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.database import initialise
from app.gtfs.static_gtfs import import_static


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Import GTFS route, trip and stop master data")
    parser.add_argument(
        "--source",
        default=str(settings.static_source) if settings.static_source else None,
        help="GTFS directory, branch google_transit.zip, or outer gtfs.zip",
    )
    parser.add_argument("--branches", default=','.join(settings.static_branches))
    parser.add_argument("--db", default=str(settings.db_path))
    parser.add_argument(
        "--include-coach-shapes",
        action="store_true",
        help="Import the very large branch 5 shapes.txt (skipped by default)",
    )
    args = parser.parse_args()
    if not args.source:
        parser.error("--source is required (or set GTFS_STATIC_SOURCE)")
    branches = [branch.strip() for branch in args.branches.split(',') if branch.strip()]
    initialise(args.db)
    counts = import_static(
        args.source,
        branches,
        args.db,
        include_coach_shapes=args.include_coach_shapes,
    )
    print(
        f"Imported {counts['routes']} routes, {counts['trips']} trips and "
        f"{counts['stops']} stops, {counts['stop_times']} stop times, "
        f"{counts['calendar']} calendars, {counts['calendar_dates']} exceptions "
        f"and {counts['shapes']} shape points from branch(es) {', '.join(branches)}."
    )


if __name__ == "__main__":
    main()
