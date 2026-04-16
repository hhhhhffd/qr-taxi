"""SQLAlchemy ORM model for the users table."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.qr_scan import QrScan


class User(Base):
    """Represents a user: Telegram, WeChat H5, or plain web."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # nullable — web/wechat users have no telegram_id
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    # platform: telegram | wechat | web
    platform: Mapped[str] = mapped_column(String(20), default="telegram", server_default="telegram")
    wechat_openid: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lang: Mapped[str] = mapped_column(String(5), default="ru", server_default="ru")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="user", lazy="selectin")
    qr_scans: Mapped[list["QrScan"]] = relationship("QrScan", back_populates="user", lazy="selectin")
