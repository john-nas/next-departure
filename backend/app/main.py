from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import feed, health, routes, stops, trips, vehicles
from .config import get_settings
from .database import initialise

settings = get_settings()
initialise(settings.db_path)

app = FastAPI(
    title="Next Departure Local Transport API",
    version="0.1.0",
    description="Passenger-focused API over current GTFS-Realtime state in SQLite.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(feed.router)
app.include_router(routes.router)
app.include_router(vehicles.router)
app.include_router(stops.router)
app.include_router(trips.router)
