"""SQLAlchemy ORM model for the drivers table (mock, seeded)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order


class Driver(Base):
    """Mock driver seeded for the hackathon demo — no real driver app."""

    __tablename__ = "drivers"

    __table_args__ = (
        Index("idx_drivers_status_class", "status", "car_class"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    car_model: Mapped[str] = mapped_column(String(100), nullable=False)
    car_color: Mapped[str] = mapped_column(String(50), nullable=False)
    plate: Mapped[str] = mapped_column(String(20), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(2, 1), default=Decimal("5.0"))
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    car_class: Mapped[str] = mapped_column(String(20), nullable=False)  # econom|optimal|comfort|universal|minivan
    referral_code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="available", server_default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="driver", foreign_keys="Order.driver_id", lazy="selectin")
    referral_orders: Mapped[list["Order"]] = relationship("Order", back_populates="referral_driver", foreign_keys="Order.referral_driver_id", lazy="selectin")
