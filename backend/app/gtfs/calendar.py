from __future__ import annotations

from datetime import date, datetime, time, timedelta
from sqlite3 import Connection
from zoneinfo import ZoneInfo

MELBOURNE = ZoneInfo("Australia/Melbourne")
WEEKDAY_COLUMNS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def parse_gtfs_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except ValueError:
        return None


def active_service_ids(
    connection: Connection,
    service_date: date,
    branches: tuple[str, ...] | None = None,
) -> set[tuple[str, str]]:
    """Return (branch, service_id) pairs active on a Melbourne calendar date."""
    branch_clause = ""
    params: list[object] = [service_date.strftime("%Y%m%d"), service_date.strftime("%Y%m%d")]
    if branches:
        placeholders = ",".join("?" for _ in branches)
        branch_clause = f" AND source_branch IN ({placeholders})"
        params.extend(branches)
    rows = connection.execute(
        f"""
        SELECT source_branch, service_id, monday, tuesday, wednesday,
               thursday, friday, saturday, sunday, start_date, end_date
        FROM gtfs_calendar
        WHERE start_date <= ? AND end_date >= ?{branch_clause}
        """,
        params,
    ).fetchall()
    active: set[tuple[str, str]] = set()
    weekday_column = WEEKDAY_COLUMNS[service_date.weekday()]
    for row in rows:
        if not row[weekday_column]:
            continue
        start = parse_gtfs_date(row["start_date"])
        end = parse_gtfs_date(row["end_date"])
        if start and end and start <= service_date <= end:
            active.add((row["source_branch"], row["service_id"]))

    exception_params: list[object] = [service_date.strftime("%Y%m%d")]
    exception_clause = ""
    if branches:
        placeholders = ",".join("?" for _ in branches)
        exception_clause = f" AND source_branch IN ({placeholders})"
        exception_params.extend(branches)
    for row in connection.execute(
        f"""
        SELECT source_branch, service_id, exception_type
        FROM gtfs_calendar_date
        WHERE service_date = ?{exception_clause}
        """,
        exception_params,
    ).fetchall():
        key = (row["source_branch"], row["service_id"])
        if row["exception_type"] == 1:
            active.add(key)
        elif row["exception_type"] == 2:
            active.discard(key)
    return active


def service_timestamp(service_date: date, seconds: int) -> int:
    """Convert a GTFS service-day offset, including >24:00, to UTC epoch seconds."""
    local_midnight = datetime.combine(service_date, time.min, tzinfo=MELBOURNE)
    return int((local_midnight + timedelta(seconds=seconds)).timestamp())


def service_dates_for_window(start: datetime, end: datetime) -> list[date]:
    local_start = start.astimezone(MELBOURNE).date()
    local_end = end.astimezone(MELBOURNE).date()
    # Include the preceding service day because a 25:00 departure belongs to
    # yesterday's GTFS service date but occurs after local midnight.
    return [local_start - timedelta(days=1), local_start, local_end]
