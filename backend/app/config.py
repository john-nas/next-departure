from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_DIR / ".env.local")


def _path_from_env(name: str, default: Path) -> Path:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    path = Path(raw)
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


def _int_from_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    db_path: Path
    trip_url: str
    vehicle_url: str
    api_key: str
    stale_seconds: int
    poll_seconds: int
    save_raw: bool
    raw_dir: Path
    static_source: Path | None
    static_branches: tuple[str, ...]
    cors_origins: tuple[str, ...]


def get_settings() -> Settings:
    raw_source = os.getenv("GTFS_STATIC_SOURCE", "").strip()
    branches = tuple(
        branch.strip()
        for branch in os.getenv("GTFS_STATIC_BRANCHES", "4,5,6").split(",")
        if branch.strip()
    )
    return Settings(
        db_path=_path_from_env("GTFS_DB_PATH", BACKEND_DIR / "data" / "gtfs.db"),
        trip_url=os.getenv(
            "GTFS_RT_TRIP_URL",
            "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates",
        ),
        vehicle_url=os.getenv(
            "GTFS_RT_VEHICLE_URL",
            "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions",
        ),
        api_key=os.getenv("VIC_TRANSPORT_API_KEY", "").strip(),
        stale_seconds=max(1, _int_from_env("GTFS_RT_STALE_SECONDS", 300)),
        poll_seconds=max(1, _int_from_env("GTFS_RT_POLL_SECONDS", 30)),
        save_raw=os.getenv("GTFS_SAVE_RAW", "false").lower() in {"1", "true", "yes"},
        raw_dir=_path_from_env("GTFS_RAW_DIR", BACKEND_DIR / "data" / "raw"),
        static_source=Path(raw_source).expanduser().resolve() if raw_source else None,
        static_branches=branches or ("4",),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if origin.strip()
        ),
    )
