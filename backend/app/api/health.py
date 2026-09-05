from __future__ import annotations

from fastapi import APIRouter

from ..config import get_settings
from ..database import connect, initialise

router = APIRouter()


@router.get("/api/health")
def health() -> dict[str, object]:
    settings = get_settings()
    initialise(settings.db_path)
    with connect(settings.db_path) as connection:
        connection.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "ok", "dbPath": str(settings.db_path)}
