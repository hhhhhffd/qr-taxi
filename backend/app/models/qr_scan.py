"""SQLAlchemy ORM model for the qr_scans analytics table."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.location import Location
    from app.models.user import User


class QrScan(Base):
    """Analytics record for each QR code scan event."""

    __tablename__ = "qr_scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now(), index=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lang: Mapped[str | None] = mapped_column(String(10), nullable=True)

    location: Mapped["Location"] = relationship("Location", back_populates="qr_scans")
    user: Mapped["User | None"] = relationship("User", back_populates="qr_scans")
