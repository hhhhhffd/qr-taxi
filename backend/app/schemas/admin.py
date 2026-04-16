"""Pydantic v2 schemas for admin API endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Location schemas
# ---------------------------------------------------------------------------


class AdminLocationCreate(BaseModel):
    """Payload for creating or updating a QR location via the admin API."""

    slug: str
    name: str
    lat: float
    lng: float
    hint_ru: str
    hint_kz: str | None = None
    hint_en: str | None = None
    address: str | None = None
    is_active: bool = True


class AdminLocationOut(BaseModel):
    """Location as returned by admin list/create/update endpoints."""

    id: int
    slug: str
    name: str
    lat: float
    lng: float
    hint_ru: str
    hint_kz: str | None
    hint_en: str | None
    address: str | None
    qr_image_url: str | None
    is_active: bool
    order_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Tariff schemas
# ---------------------------------------------------------------------------


class TariffConfig(BaseModel):
    """Single tariff configuration entry."""

    base_fare: int
    base_km: float
    per_km: float
    free_wait_min: int
    wait_per_min: int
    car_type: str


class TariffUpdateRequest(BaseModel):
    """Full tariff config payload for PUT /admin/settings/tariffs."""

    tariffs: dict[str, TariffConfig]
    time_surcharge_after_min: float
    time_surcharge_per_min: float
    max_distance_km: float
    search_timeout_sec: int
    driver_wait_timeout_min: int
    surge_multiplier: float


# ---------------------------------------------------------------------------
# Order schemas (admin view)
# ---------------------------------------------------------------------------


class AdminOrderEventOut(BaseModel):
    """A single order status event for the admin detail view."""

    id: int
    status: str
    meta: dict[str, Any] | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminOrderOut(BaseModel):
    """Order summary row for the admin orders list."""

    id: int
    status: str
    tariff: str
    estimated_price: int | None
    final_price: int | None
    location_id: int
    location_name: str
    user_id: int
    created_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AdminOrderDetail(AdminOrderOut):
    """Full order detail including pickup/drop-off and event timeline."""

    point_a_lat: float
    point_a_lng: float
    point_a_address: str
    point_b_lat: float | None
    point_b_lng: float | None
    point_b_address: str | None
    driver_id: int | None
    assigned_at: datetime | None
    arrived_at: datetime | None
    started_at: datetime | None
    events: list[AdminOrderEventOut]


# ---------------------------------------------------------------------------
# Filter / analytics schemas
# ---------------------------------------------------------------------------


class OrderFilter(BaseModel):
    """Filter parameters for the admin orders list."""

    status: str | None = None
    location_id: int | None = None
    tariff: str | None = None
    limit: int = 50
    offset: int = 0


class HeatmapPoint(BaseModel):
    """Heatmap data point for the analytics dashboard."""

    lat: float
    lng: float
    weight: int


class AnalyticsSummary(BaseModel):
    """Summary statistics for the admin analytics dashboard."""

    total_today: int
    total_week: int
    avg_price: float | None
    avg_wait_seconds: float | None


class MetabaseEmbedOut(BaseModel):
    """Signed Metabase embed payload for admin analytics iframe."""

    is_configured: bool
    dashboard_url: str | None
    reason: str | None = None
