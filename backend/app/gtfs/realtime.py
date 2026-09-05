from __future__ import annotations

from pathlib import Path
from typing import Any

import requests
from google.transit import gtfs_realtime_pb2


FeedMessage = gtfs_realtime_pb2.FeedMessage


def load_feed(path: str | Path) -> FeedMessage:
    payload = Path(path).read_bytes()
    feed = FeedMessage()
    feed.ParseFromString(payload)
    return feed


def fetch_feed(url: str, api_key: str, timeout: int = 30) -> FeedMessage:
    if not api_key:
        raise ValueError("VIC_TRANSPORT_API_KEY is required for live realtime requests")
    response = requests.get(url, headers={"KeyID": api_key}, timeout=timeout)
    response.raise_for_status()
    feed = FeedMessage()
    feed.ParseFromString(response.content)
    return feed


def has_field(message: Any, field: str) -> bool:
    try:
        return message.HasField(field)
    except (ValueError, AttributeError):
        return False


def optional_value(message: Any, field: str, default: Any = None) -> Any:
    if not message or not hasattr(message, field):
        return default
    if hasattr(message, "HasField") and not has_field(message, field):
        return default
    return getattr(message, field)


def feed_timestamp(feed: FeedMessage) -> int | None:
    value = optional_value(feed.header, "timestamp")
    return int(value) if value else None


def entity_count(feed: FeedMessage) -> int:
    return len(feed.entity)
