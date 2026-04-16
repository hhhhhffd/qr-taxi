"""SQLAlchemy ORM model for the locations table (QR scan points)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.partner import Partner
    from app.models.qr_scan import QrScan


class Location(Base):
    """Physical QR code placement point (mall exit, airport, etc.)."""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    hint_ru: Mapped[str] = mapped_column(String(200), nullable=False)
    hint_kz: Mapped[str | None] = mapped_column(String(200), nullable=True)
    hint_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    qr_image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    partner_id: Mapped[int | None] = mapped_column(ForeignKey("partners.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="location", lazy="selectin")
    qr_scans: Mapped[list["QrScan"]] = relationship("QrScan", back_populates="location", lazy="selectin")
    partner: Mapped["Partner | None"] = relationship("Partner", back_populates="locations")
