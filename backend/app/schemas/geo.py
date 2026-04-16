"""Pydantic v2 schemas for geo/mapping endpoints."""

from pydantic import BaseModel


class GeoSearchRequest(BaseModel):
    """Forward geocode search request."""

    text: str
    latitude: float | None = None
    longitude: float | None = None


class GeoSearchResult(BaseModel):
    """Single autocomplete suggestion from the geocoder."""

    address: str
    lat: float
    lng: float
    name: str | None = None


class GeoSearchResponse(BaseModel):
    """List of geocoder suggestions."""

    results: list[GeoSearchResult]


class RouteRequest(BaseModel):
    """Route calculation request between two or more points."""

    points: list[dict[str, float]]  # [{lat, lng}, {lat, lng}]


class RouteResponse(BaseModel):
    """Calculated route — coordinates already converted to [lat, lng] by geo_service."""

    distance: int          # metres
    time: int              # milliseconds
    coordinates: list[list[float]]  # [[lat, lng], ...]
    bbox: list[list[float]] | None = None  # [[minLat, minLng], [maxLat, maxLng]] — Leaflet-ready


class ReverseGeocodeRequest(BaseModel):
    """Reverse geocode request for a coordinate pair."""

    latitude: float
    longitude: float


class ReverseGeocodeResponse(BaseModel):
    """Human-readable address for the given coordinate."""

    address: str
    name: str | None = None
