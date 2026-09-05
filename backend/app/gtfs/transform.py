from __future__ import annotations

from typing import Any, Iterable

from .realtime import FeedMessage, has_field, optional_value
from ..models import StopPrediction, VehicleObservation


def _text(message: Any, field: str) -> str | None:
    value = optional_value(message, field)
    return str(value).strip() if value not in (None, "") else None


def _number(message: Any, field: str) -> int | None:
    value = optional_value(message, field)
    return int(value) if value is not None else None


def vehicle_observations(feed: FeedMessage) -> list[VehicleObservation]:
    observations: list[VehicleObservation] = []
    for entity in feed.entity:
        if not has_field(entity, "vehicle"):
            continue
        vehicle = entity.vehicle
        trip = vehicle.trip if has_field(vehicle, "trip") else None
        position = vehicle.position if has_field(vehicle, "position") else None
        trip_id = _text(trip, "trip_id")
        if not trip_id:
            continue
        observations.append(
            VehicleObservation(
                trip_id=trip_id,
                route_id=_text(trip, "route_id"),
                vehicle_id=_text(vehicle.vehicle, "id") if has_field(vehicle, "vehicle") else None,
                latitude=float(position.latitude) if position and has_field(position, "latitude") else None,
                longitude=float(position.longitude) if position and has_field(position, "longitude") else None,
                bearing=float(position.bearing) if position and has_field(position, "bearing") else None,
                stop_id=_text(vehicle, "stop_id"),
                current_stop_sequence=_number(vehicle, "current_stop_sequence"),
                current_status=_number(vehicle, "current_status"),
                vehicle_timestamp=_number(vehicle, "timestamp"),
            )
        )
    return observations


def stop_predictions(feed: FeedMessage) -> list[StopPrediction]:
    predictions: list[StopPrediction] = []
    for entity in feed.entity:
        if not has_field(entity, "trip_update"):
            continue
        trip_update = entity.trip_update
        trip = trip_update.trip if has_field(trip_update, "trip") else None
        trip_id = _text(trip, "trip_id")
        if not trip_id:
            continue
        route_id = _text(trip, "route_id")
        for update in trip_update.stop_time_update:
            stop_id = _text(update, "stop_id")
            sequence = _number(update, "stop_sequence")
            if not stop_id or sequence is None:
                continue
            arrival = update.arrival if has_field(update, "arrival") else None
            departure = update.departure if has_field(update, "departure") else None
            predictions.append(
                StopPrediction(
                    trip_id=trip_id,
                    route_id=route_id,
                    stop_id=stop_id,
                    stop_sequence=sequence,
                    arrival_time=_number(arrival, "time") if arrival else None,
                    departure_time=_number(departure, "time") if departure else None,
                    arrival_delay=_number(arrival, "delay") if arrival else None,
                    departure_delay=_number(departure, "delay") if departure else None,
                    schedule_relationship=_number(update, "schedule_relationship"),
                )
            )
    return predictions
