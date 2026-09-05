from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.database import initialise


if __name__ == "__main__":
    settings = get_settings()
    initialise(settings.db_path)
    print(f"Initialised SQLite database at {settings.db_path}")
