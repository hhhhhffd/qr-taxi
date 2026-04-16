"""Pydantic v2 schemas for authentication endpoints."""

from datetime import datetime

from pydantic import BaseModel


class TelegramAuthRequest(BaseModel):
    """Payload from the Telegram Mini App containing raw initData string."""

    init_data: str
    lang: str = "ru"


class PhoneRequest(BaseModel):
    """Phone number submission after Telegram.WebApp.requestContact()."""

    phone: str


class OtpRequestBody(BaseModel):
    """Request body for POST /auth/otp/request."""

    phone: str


class OtpVerifyBody(BaseModel):
    """Request body for POST /auth/otp/verify."""

    phone: str
    otp: str
    first_name: str | None = None
    lang: str = "ru"


class WechatAuthBody(BaseModel):
    """Request body for POST /auth/wechat (WeChat H5 authentication)."""

    phone: str
    display_name: str | None = None
    lang: str = "ru"


class UserOut(BaseModel):
    """Public user representation returned from /auth/me and auth responses."""

    id: int
    telegram_id: int | None  # None for web/wechat users
    platform: str
    first_name: str
    username: str | None
    phone: str | None
    lang: str
    is_admin: bool
    onboarded: bool

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    """JWT access token + user profile returned after successful authentication."""

    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenPayload(BaseModel):
    """Decoded JWT access token claims."""

    sub: int
    is_admin: bool = False
    type: str = "access"
    exp: datetime | None = None
