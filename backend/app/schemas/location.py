"""Pydantic v2 schemas for location and QR scan endpoints."""

from pydantic import BaseModel


class LocationOut(BaseModel):
    """QR scan location details returned to the frontend.

    ``hint`` is resolved server-side from hint_ru/hint_kz/hint_en
    based on the requested language, with fallback to hint_ru.
    """

    id: int
    slug: str
    name: str
    lat: float
    lng: float
    hint: str
    address: str | None = None


class QrScanRequest(BaseModel):
    """Payload for recording a QR scan analytics event."""

    location_id: int
    lang: str | None = None


class QrScanOut(BaseModel):
    """Created QR scan record identifier."""

    id: int
