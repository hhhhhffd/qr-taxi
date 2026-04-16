"""Pydantic v2 schemas for order endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

#: Allowed tariff identifiers (matches ``drivers.car_class`` column values).
ALLOWED_TARIFFS: frozenset[str] = frozenset({"econom", "optimal", "comfort", "universal", "minivan"})


class PointB(BaseModel):
    """Optional destination point provided by the user."""

    lat: float
    lng: float
    address: str


class PointOut(BaseModel):
    """Coordinate + address pair returned in order details."""

    lat: float
    lng: float
    address: str


class OrderCreateRequest(BaseModel):
    """Request body for creating a new order."""

    location_slug: str
    point_b: PointB | None = None
    tariff: str
    payment_method: str = "cash"

    @field_validator("tariff")
    @classmethod
    def validate_tariff(cls, v: str) -> str:
        """Reject unknown tariff identifiers early to avoid runtime KeyError."""
        if v not in ALLOWED_TARIFFS:
            allowed = ", ".join(sorted(ALLOWED_TARIFFS))
            raise ValueError(f"Недопустимый тариф '{v}'. Допустимые значения: {allowed}.")
        return v


class DriverBrief(BaseModel):
    """Minimal driver info embedded in order responses."""

    id: int
    name: str
    car_model: str
    car_color: str
    plate: str
    phone: str
    rating: float
    photo_url: str | None


class OrderOut(BaseModel):
    """Full order representation returned to the frontend."""

    id: int
    status: str
    point_a: PointOut
    point_b: PointOut | None
    tariff: str
    payment_method: str
    estimated_price: int | None
    final_price: int | None
    driver: DriverBrief | None
    share_token: str | None
    rating: int | None
    created_at: datetime
    updated_at: datetime


class OrderRateRequest(BaseModel):
    """Rating submission after ride completion."""

    rating: int = Field(ge=1, le=5)
    comment: str | None = None
