"""Pydantic v2 schemas for WebSocket message payloads."""

from pydantic import BaseModel


class WsStatusUpdate(BaseModel):
    """Full order state broadcast on every status transition."""

    type: str = "status_update"
    order_id: int
    status: str
    driver_id: int | None = None
    estimated_price: int | None = None
    final_price: int | None = None


class WsEtaUpdate(BaseModel):
    """ETA update sent while driver is en route."""

    type: str = "eta_update"
    order_id: int
    eta_seconds: int


class WsDriverLocation(BaseModel):
    """Driver GPS position update for live map tracking."""

    type: str = "driver_location"
    order_id: int
    lat: float
    lng: float
