from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VehicleObservation:
    trip_id: str
    route_id: str | None
    vehicle_id: str | None
    latitude: float | None
    longitude: float | None
    bearing: float | None
    stop_id: str | None
    current_stop_sequence: int | None
    current_status: int | None
    vehicle_timestamp: int | None


@dataclass(frozen=True)
class StopPrediction:
    trip_id: str
    route_id: str | None
    stop_id: str
    stop_sequence: int
    arrival_time: int | None
    departure_time: int | None
    arrival_delay: int | None
    departure_delay: int | None
    schedule_relationship: int | None
