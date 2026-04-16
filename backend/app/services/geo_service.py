"""Geo service — ONLY place where [lng, lat] → [lat, lng] coordinate conversion happens.

All Aparu Maps API calls are made here with Redis caching.
"""

import hashlib
import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException
from redis.asyncio import Redis

from app.config import settings
from app.redis import cache_get, cache_set
from app.schemas.geo import GeoSearchResult, ReverseGeocodeResponse, RouteResponse

logger = logging.getLogger(__name__)

_TIMEOUT = 10.0
_APARU_ERROR_MSG = "Сервис карт временно недоступен"


def _aparu_client() -> httpx.AsyncClient:
    """Return a configured httpx client for the Aparu Maps API."""
    return httpx.AsyncClient(
        base_url=settings.APARU_API_URL,
        headers={"X-Api-Key": settings.APARU_API_KEY},
        timeout=_TIMEOUT,
    )


async def search(
    text: str,
    lat: float | None,
    lng: float | None,
    redis: Redis,
) -> list[GeoSearchResult]:
    """Forward geocode / address autocomplete via Aparu Maps API.

    Cache key: ``aparu:geo:search:{text}:{round(lat,3)}:{round(lng,3)}``, TTL 3600 s.
    """
    lat_key = round(lat, 3) if lat is not None else "none"
    lng_key = round(lng, 3) if lng is not None else "none"
    cache_key = f"geo:search:{text}:{lat_key}:{lng_key}"

    cached = await cache_get(redis, cache_key)
    if cached:
        return [GeoSearchResult(**item) for item in json.loads(cached)]

    payload: dict[str, Any] = {"text": text, "withCities": False}
    if lat is not None:
        payload["latitude"] = lat
    if lng is not None:
        payload["longitude"] = lng

    try:
        async with _aparu_client() as client:
            resp = await client.post("/api/v1/maps/geocode", json=payload)
            resp.raise_for_status()
            raw = resp.json()
    except httpx.HTTPError as exc:
        logger.error("Aparu geocode request failed: %s", exc)
        raise HTTPException(status_code=502, detail=_APARU_ERROR_MSG)

    # Aparu returns {"Results": [{Address, AdditionalInfo, Latitude, Longitude}, ...]}
    items: list[dict] = raw.get("Results", raw if isinstance(raw, list) else [])
    results: list[GeoSearchResult] = []
    for item in items:
        addr = item.get("Address", "")
        additional = item.get("AdditionalInfo", "")
        full_address = f"{addr}, {additional}" if additional else addr
        results.append(
            GeoSearchResult(
                address=full_address,
                lat=float(item.get("Latitude", item.get("latitude", 0))),
                lng=float(item.get("Longitude", item.get("longitude", 0))),
                name=addr or None,
            )
        )

    await cache_set(redis, cache_key, json.dumps([r.model_dump() for r in results]), ttl=3600)
    return results


async def reverse_geocode(lat: float, lng: float, redis: Redis) -> ReverseGeocodeResponse:
    """Reverse geocode coordinates to a human-readable address via Aparu Maps API.

    Cache key: ``aparu:geo:reverse:{round(lat,3)}:{round(lng,3)}``, TTL 86400 s.
    """
    cache_key = f"geo:reverse:{round(lat, 3)}:{round(lng, 3)}"

    cached = await cache_get(redis, cache_key)
    if cached:
        return ReverseGeocodeResponse(**json.loads(cached))

    try:
        async with _aparu_client() as client:
            resp = await client.post(
                "/api/v1/maps/reverse-geocode",
                json={"latitude": lat, "longitude": lng},
            )
            resp.raise_for_status()
            raw = resp.json()
    except httpx.HTTPError as exc:
        logger.error("Aparu reverse-geocode request failed: %s", exc)
        raise HTTPException(status_code=502, detail=_APARU_ERROR_MSG)

    # Aparu returns {"PlaceName": "...", "AreaName": "..."}
    place = raw.get("PlaceName", "")
    area = raw.get("AreaName", "")
    address = f"{place}, {area}" if place and area else place or area
    result = ReverseGeocodeResponse(
        address=address,
        name=place or None,
    )

    await cache_set(redis, cache_key, json.dumps(result.model_dump()), ttl=86400)
    return result


async def get_route(points: list[dict[str, float]], redis: Redis) -> RouteResponse:
    """Calculate a route between points via Aparu Maps API.

    **Coordinate conversion happens HERE and ONLY HERE.**
    Aparu returns ``[lng, lat]``; this method converts each coordinate to
    ``[lat, lng]`` before returning so callers always receive Leaflet-ready coords.

    Cache key: ``aparu:geo:route:{md5(points)}``, TTL 3600 s.
    """
    points_str = json.dumps(points, sort_keys=True)
    points_hash = hashlib.md5(points_str.encode()).hexdigest()
    cache_key = f"geo:route:{points_hash}"

    cached = await cache_get(redis, cache_key)
    if cached:
        return RouteResponse(**json.loads(cached))

    # Aparu API expects {latitude, longitude} keys
    aparu_points = [{"latitude": p["lat"], "longitude": p["lng"]} for p in points]

    try:
        async with _aparu_client() as client:
            resp = await client.post("/api/v1/maps/route", json={"points": aparu_points})
            resp.raise_for_status()
            raw = resp.json()
    except httpx.HTTPError as exc:
        logger.error("Aparu route request failed: %s", exc)
        raise HTTPException(status_code=502, detail=_APARU_ERROR_MSG)

    # Aparu returns {"Distance": m, "Time": ms, "Coordinates": [[lng, lat], ...], "bbox": [minLon, minLat, maxLon, maxLat]}
    # Convert [lng, lat] → [lat, lng] — this is the sole conversion point
    raw_coords: list[list[float]] = raw.get("Coordinates", raw.get("coordinates", []))
    coordinates = [[coord[1], coord[0]] for coord in raw_coords]

    # bbox: API returns [minLon, minLat, maxLon, maxLat] → convert to [[minLat, minLon], [maxLat, maxLon]] (Leaflet-ready)
    raw_bbox = raw.get("bbox", None)
    bbox: list[list[float]] | None = None
    if raw_bbox and len(raw_bbox) == 4:
        bbox = [[raw_bbox[1], raw_bbox[0]], [raw_bbox[3], raw_bbox[2]]]

    result = RouteResponse(
        distance=int(raw.get("Distance", raw.get("distance", 0))),
        time=int(raw.get("Time", raw.get("time", 0))),
        coordinates=coordinates,
        bbox=bbox,
    )

    await cache_set(redis, cache_key, json.dumps(result.model_dump()), ttl=3600)
    return result
