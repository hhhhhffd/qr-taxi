"""SQLAlchemy ORM model for the orders table."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.driver import Driver
    from app.models.location import Location
    from app.models.order_event import OrderEvent
    from app.models.partner import Partner
    from app.models.user import User


class Order(Base):
    """A taxi order created by a user from a QR scan point."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Foreign keys
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False, index=True)
    referral_driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    partner_id: Mapped[int | None] = mapped_column(ForeignKey("partners.id"), nullable=True, index=True)

    # Point A (from QR location)
    point_a_lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    point_a_lng: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    point_a_address: Mapped[str] = mapped_column(String(300), nullable=False)

    # Point B (optional destination)
    point_b_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    point_b_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    point_b_address: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Tariff / price
    tariff: Mapped[str] = mapped_column(String(20), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="cash")
    estimated_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    surge_multiplier: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("1.00"))

    # Status
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="searching", index=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(20), nullable=True)  # user|driver|system

    # Share / rating
    share_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Worker state
    search_delay: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=15)

    # Timestamps
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="orders")
    driver: Mapped["Driver | None"] = relationship("Driver", back_populates="orders", foreign_keys=[driver_id])
    referral_driver: Mapped["Driver | None"] = relationship("Driver", back_populates="referral_orders", foreign_keys=[referral_driver_id])
    location: Mapped["Location"] = relationship("Location", back_populates="orders")
    partner: Mapped["Partner | None"] = relationship("Partner", back_populates="orders", foreign_keys=[partner_id])
    events: Mapped[list["OrderEvent"]] = relationship("OrderEvent", back_populates="order", lazy="selectin")
