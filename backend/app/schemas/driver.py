"""Pydantic v2 schemas for driver data."""

from pydantic import BaseModel


class DriverOut(BaseModel):
    """Driver record returned in admin and order contexts."""

    id: int
    name: str
    car_model: str
    car_color: str
    plate: str
    phone: str
    photo_url: str | None
    rating: float
    car_class: str
    status: str
    lat: float
    lng: float
