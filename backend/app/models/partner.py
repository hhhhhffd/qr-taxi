"""SQLAlchemy ORM model for the partners table (B2B ambassador QR owners)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.location import Location
    from app.models.order import Order


class Partner(Base):
    """A B2B partner (ИП, bar, club, etc.) that owns QR sticker placements.

    When a user scans a QR at a partner location, the resulting order is
    attributed to this partner for analytics and future revenue sharing.
    """

    __tablename__ = "partners"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # ИП Иванов
    bin: Mapped[str | None] = mapped_column(String(20), nullable=True)           # БИН
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now()
    )

    locations: Mapped[list["Location"]] = relationship(
        "Location", back_populates="partner", lazy="selectin"
    )
    orders: Mapped[list["Order"]] = relationship(
        "Order", back_populates="partner", foreign_keys="Order.partner_id", lazy="selectin"
    )
