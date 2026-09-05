from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from typing import Iterable, Iterator

from ..database import transaction

MODE_BY_BRANCH = {"4": "myki-bus", "5": "regional-coach", "6": "regional-bus"}
BATCH_SIZE = 5_000


def _rows(payload: bytes) -> Iterator[dict[str, str]]:
    text = payload.decode("utf-8-sig", errors="replace")
    yield from csv.DictReader(io.StringIO(text))


ArchiveSource = zipfile.ZipFile | Path


def _branch_archive(source: Path, branch: str) -> Path | None:
    if source.is_dir():
        branch_dir = source / branch
        zipped = branch_dir / "google_transit.zip"
        extracted = branch_dir / "google_transit"
        if zipped.is_file():
            return zipped
        if extracted.is_dir():
            return extracted
        return None
    if source.name.lower().endswith(".zip"):
        return source
    return None


def _member_bytes(archive: ArchiveSource, name: str) -> bytes:
    if isinstance(archive, Path):
        member = archive / name
        if member.is_file():
            return member.read_bytes()
        for candidate in archive.iterdir():
            if candidate.name.lower() == name.lower() and candidate.is_file():
                return candidate.read_bytes()
        raise FileNotFoundError(f"GTFS member {name} not found in {archive}")
    with archive.open(name) as stream:
        return stream.read()


def _iter_member_rows(archive: ArchiveSource, name: str) -> Iterator[dict[str, str]]:
    if isinstance(archive, Path):
        path = archive / name
        if not path.exists():
            for candidate in archive.iterdir():
                if candidate.name.lower() == name.lower():
                    path = candidate
                    break
        if not path.is_file():
            raise FileNotFoundError(f"GTFS member {name} not found in {archive}")
        with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as stream:
            yield from csv.DictReader(stream)
        return
    with archive.open(name) as binary_stream:
        with io.TextIOWrapper(binary_stream, encoding="utf-8-sig", errors="replace", newline="") as stream:
            yield from csv.DictReader(stream)


def _archive_for_branch(source: Path, branch: str) -> tuple[ArchiveSource, bool]:
    branch_archive = _branch_archive(source, branch)
    if not branch_archive:
        raise FileNotFoundError(f"Could not find GTFS branch {branch} under {source}")
    if branch_archive.is_dir():
        return branch_archive, False
    archive = zipfile.ZipFile(branch_archive)
    nested_name = f"{branch}/google_transit.zip"
    if nested_name in archive.namelist():
        nested = zipfile.ZipFile(io.BytesIO(_member_bytes(archive, nested_name)))
        archive.close()
        return nested, True
    return archive, False


def _int_or_none(value: str | None) -> int | None:
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _float_or_none(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def gtfs_time_seconds(value: str | None) -> int | None:
    """Parse GTFS HH:MM:SS, preserving hours beyond 24:00."""
    if not value:
        return None
    parts = value.strip().split(":")
    if len(parts) != 3:
        return None
    try:
        hours, minutes, seconds = (int(part) for part in parts)
    except ValueError:
        return None
    if hours < 0 or minutes not in range(60) or seconds not in range(60):
        return None
    return hours * 3600 + minutes * 60 + seconds


def _batch_insert(connection, sql: str, rows: Iterable[tuple], batch_size: int = BATCH_SIZE) -> int:
    batch: list[tuple] = []
    count = 0
    for row in rows:
        batch.append(row)
        if len(batch) >= batch_size:
            connection.executemany(sql, batch)
            count += len(batch)
            batch.clear()
    if batch:
        connection.executemany(sql, batch)
        count += len(batch)
    return count


def import_static(
    source: str | Path,
    branches: Iterable[str],
    db_path: str | Path,
    *,
    include_coach_shapes: bool = False,
) -> dict[str, int]:
    source_path = Path(source).expanduser().resolve()
    counts = {"routes": 0, "trips": 0, "stops": 0, "stop_times": 0, "calendar": 0, "calendar_dates": 0, "shapes": 0}
    with transaction(db_path) as connection:
        for raw_branch in branches:
            branch = str(raw_branch)
            mode_class = MODE_BY_BRANCH.get(branch, "unknown")
            archive, _nested = _archive_for_branch(source_path, branch)
            try:
                # Re-importing a branch should not leave obsolete schedule rows.
                for table in ("gtfs_stop_time", "gtfs_calendar_date", "gtfs_calendar", "gtfs_shape"):
                    connection.execute(f"DELETE FROM {table} WHERE source_branch = ?", (branch,))

                route_rows = list(_iter_member_rows(archive, "routes.txt"))
                trip_rows = list(_iter_member_rows(archive, "trips.txt"))
                trip_meta = {
                    row.get("trip_id", "").strip(): (
                        row.get("route_id", "").strip(),
                        row.get("service_id", "").strip(),
                    )
                    for row in trip_rows
                    if row.get("trip_id", "").strip()
                }
                connection.executemany(
                    """
                    INSERT INTO gtfs_route
                        (route_id, source_branch, mode_class, route_short_name,
                         route_long_name, route_type, route_color, route_text_color)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(route_id) DO UPDATE SET
                        source_branch=excluded.source_branch,
                        mode_class=excluded.mode_class,
                        route_short_name=excluded.route_short_name,
                        route_long_name=excluded.route_long_name,
                        route_type=excluded.route_type,
                        route_color=excluded.route_color,
                        route_text_color=excluded.route_text_color
                    """,
                    [
                        (
                            row.get("route_id", "").strip(), branch, mode_class,
                            row.get("route_short_name", "").strip() or None,
                            row.get("route_long_name", "").strip() or None,
                            _int_or_none(row.get("route_type")),
                            row.get("route_color", "").strip() or None,
                            row.get("route_text_color", "").strip() or None,
                        )
                        for row in route_rows if row.get("route_id", "").strip()
                    ],
                )
                connection.executemany(
                    """
                    INSERT INTO gtfs_trip
                        (trip_id, route_id, service_id, shape_id, trip_headsign,
                         direction_id, wheelchair_accessible, source_branch)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(trip_id) DO UPDATE SET
                        route_id=excluded.route_id, service_id=excluded.service_id,
                        shape_id=excluded.shape_id, trip_headsign=excluded.trip_headsign,
                        direction_id=excluded.direction_id,
                        wheelchair_accessible=excluded.wheelchair_accessible,
                        source_branch=excluded.source_branch
                    """,
                    [
                        (
                            row.get("trip_id", "").strip(), row.get("route_id", "").strip(),
                            row.get("service_id", "").strip() or None,
                            row.get("shape_id", "").strip() or None,
                            row.get("trip_headsign", "").strip() or None,
                            _int_or_none(row.get("direction_id")),
                            _int_or_none(row.get("wheelchair_accessible")), branch,
                        )
                        for row in trip_rows
                        if row.get("trip_id", "").strip() and row.get("route_id", "").strip()
                    ],
                )
                stop_rows = list(_iter_member_rows(archive, "stops.txt"))
                connection.executemany(
                    """
                    INSERT INTO gtfs_stop_variant
                        (source_branch, stop_id, stop_name, stop_lat, stop_lon, wheelchair_boarding)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_branch, stop_id) DO UPDATE SET
                        stop_name=excluded.stop_name, stop_lat=excluded.stop_lat,
                        stop_lon=excluded.stop_lon, wheelchair_boarding=excluded.wheelchair_boarding
                    """,
                    [
                        (
                            branch, row.get("stop_id", "").strip(),
                            row.get("stop_name", "").strip() or None,
                            _float_or_none(row.get("stop_lat")), _float_or_none(row.get("stop_lon")),
                            _int_or_none(row.get("wheelchair_boarding")),
                        )
                        for row in stop_rows if row.get("stop_id", "").strip()
                    ],
                )
                # Keep the legacy lookup table populated for existing clients;
                # branch-aware APIs use gtfs_stop_variant.
                connection.executemany(
                    """
                    INSERT INTO gtfs_stop
                        (stop_id, stop_name, stop_lat, stop_lon, mode_class, source_branch)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(stop_id) DO UPDATE SET
                        stop_name=excluded.stop_name, stop_lat=excluded.stop_lat,
                        stop_lon=excluded.stop_lon, mode_class=excluded.mode_class,
                        source_branch=excluded.source_branch
                    """,
                    [
                        (
                            row.get("stop_id", "").strip(), row.get("stop_name", "").strip() or None,
                            _float_or_none(row.get("stop_lat")), _float_or_none(row.get("stop_lon")),
                            mode_class, branch,
                        )
                        for row in stop_rows if row.get("stop_id", "").strip()
                    ],
                )

                calendar_path = "calendar.txt"
                try:
                    calendar_rows = list(_iter_member_rows(archive, calendar_path))
                except KeyError:
                    calendar_rows = []
                connection.executemany(
                    """
                    INSERT INTO gtfs_calendar
                        (source_branch, service_id, monday, tuesday, wednesday, thursday,
                         friday, saturday, sunday, start_date, end_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_branch, service_id) DO UPDATE SET
                        monday=excluded.monday, tuesday=excluded.tuesday,
                        wednesday=excluded.wednesday, thursday=excluded.thursday,
                        friday=excluded.friday, saturday=excluded.saturday,
                        sunday=excluded.sunday, start_date=excluded.start_date,
                        end_date=excluded.end_date
                    """,
                    [
                        (
                            branch, row.get("service_id", "").strip(),
                            *(_int_or_none(row.get(day)) or 0 for day in
                              ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")),
                            row.get("start_date", "").strip(), row.get("end_date", "").strip(),
                        )
                        for row in calendar_rows if row.get("service_id", "").strip()
                    ],
                )

                try:
                    exception_rows = _iter_member_rows(archive, "calendar_dates.txt")
                    counts["calendar_dates"] += _batch_insert(
                        connection,
                        """
                        INSERT INTO gtfs_calendar_date
                            (source_branch, service_id, service_date, exception_type)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(source_branch, service_id, service_date) DO UPDATE SET
                            exception_type=excluded.exception_type
                        """,
                        (
                            (branch, row.get("service_id", "").strip(), row.get("date", "").strip(),
                             _int_or_none(row.get("exception_type")) or 0)
                            for row in exception_rows if row.get("service_id", "").strip()
                        ),
                    )
                except (KeyError, FileNotFoundError):
                    pass

                try:
                    stop_time_rows = _iter_member_rows(archive, "stop_times.txt")
                    counts["stop_times"] += _batch_insert(
                        connection,
                        """
                        INSERT INTO gtfs_stop_time
                            (source_branch, trip_id, route_id, service_id, stop_id, stop_sequence,
                             arrival_seconds, departure_seconds, stop_headsign, pickup_type,
                             drop_off_type, shape_dist_traveled)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(source_branch, trip_id, stop_sequence) DO UPDATE SET
                            route_id=excluded.route_id, service_id=excluded.service_id,
                            stop_id=excluded.stop_id, arrival_seconds=excluded.arrival_seconds,
                            departure_seconds=excluded.departure_seconds,
                            stop_headsign=excluded.stop_headsign, pickup_type=excluded.pickup_type,
                            drop_off_type=excluded.drop_off_type,
                            shape_dist_traveled=excluded.shape_dist_traveled
                        """,
                        (
                            (
                                branch, row.get("trip_id", "").strip(),
                                trip_meta.get(row.get("trip_id", "").strip(), (None, None))[0],
                                trip_meta.get(row.get("trip_id", "").strip(), (None, None))[1],
                                row.get("stop_id", "").strip(), _int_or_none(row.get("stop_sequence")) or 0,
                                gtfs_time_seconds(row.get("arrival_time")),
                                gtfs_time_seconds(row.get("departure_time")),
                                row.get("stop_headsign", "").strip() or None,
                                _int_or_none(row.get("pickup_type")), _int_or_none(row.get("drop_off_type")),
                                _float_or_none(row.get("shape_dist_traveled")),
                            )
                            for row in stop_time_rows
                            if row.get("trip_id", "").strip() and row.get("stop_id", "").strip()
                        ),
                    )
                except (KeyError, FileNotFoundError):
                    pass

                if branch == "5" and not include_coach_shapes:
                    counts["routes"] += len(route_rows)
                    counts["trips"] += len(trip_rows)
                    counts["stops"] += len(stop_rows)
                    counts["calendar"] += len(calendar_rows)
                    continue

                try:
                    shape_rows = _iter_member_rows(archive, "shapes.txt")
                    counts["shapes"] += _batch_insert(
                        connection,
                        """
                        INSERT INTO gtfs_shape
                            (source_branch, shape_id, shape_pt_lat, shape_pt_lon,
                             shape_pt_sequence, shape_dist_traveled)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(source_branch, shape_id, shape_pt_sequence) DO UPDATE SET
                            shape_pt_lat=excluded.shape_pt_lat, shape_pt_lon=excluded.shape_pt_lon,
                            shape_dist_traveled=excluded.shape_dist_traveled
                        """,
                        (
                            (
                                branch, row.get("shape_id", "").strip(),
                                _float_or_none(row.get("shape_pt_lat")) or 0.0,
                                _float_or_none(row.get("shape_pt_lon")) or 0.0,
                                _int_or_none(row.get("shape_pt_sequence")) or 0,
                                _float_or_none(row.get("shape_dist_traveled")),
                            )
                            for row in shape_rows if row.get("shape_id", "").strip()
                        ),
                    )
                except (KeyError, FileNotFoundError):
                    pass

                counts["routes"] += len(route_rows)
                counts["trips"] += len(trip_rows)
                counts["stops"] += len(stop_rows)
                counts["calendar"] += len(calendar_rows)
            finally:
                if isinstance(archive, zipfile.ZipFile):
                    archive.close()
    return counts
