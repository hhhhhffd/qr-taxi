"""Authentication service — Telegram initData validation, OTP, and JWT issuance."""

import hashlib
import hmac
import json
import logging
import random
import string
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings
from app.redis import cache_get, cache_set, redis_pool
from app.schemas.auth import TokenPayload
from redis.asyncio import Redis as _Redis

logger = logging.getLogger(__name__)


_INIT_DATA_MAX_AGE_SECONDS = 86400  # 24 hours


def validate_telegram_init_data(init_data: str, bot_token: str) -> dict:
    """Validate Telegram Mini App initData HMAC and return parsed user dict.

    Follows the exact algorithm from CLAUDE.md:
    1. Parse as URL query string.
    2. Extract & remove hash.
    3. Sort remaining params alphabetically.
    4. Build data-check-string with newline separators.
    5-6. Two-step HMAC-SHA256 verification.
    7. Constant-time comparison.
    8. auth_date freshness check (max 24 h).
    """
    # a) Parse init_data as URL-encoded query string
    parsed = parse_qsl(init_data, keep_blank_values=True)

    # b) Extract "hash" value, REMOVE from params
    hash_value: str | None = None
    params: list[tuple[str, str]] = []
    for key, value in parsed:
        if key == "hash":
            hash_value = value
        else:
            params.append((key, value))

    if hash_value is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing hash in initData.",
        )

    # c) Sort remaining params ALPHABETICALLY by key
    params.sort(key=lambda p: p[0])

    # d) Build data_check_string: join sorted "key=value" with "\n"
    data_check_string = "\n".join(f"{k}={v}" for k, v in params)

    # e) secret_key = HMAC-SHA256(key=b"WebAppData", msg=bot_token)
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()

    # f) computed = HMAC-SHA256(key=secret_key, msg=data_check_string).hexdigest()
    computed = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    # g) Constant-time comparison
    if not hmac.compare_digest(computed, hash_value):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram signature.",
        )

    # i) Parse "user" JSON string from params
    user_data: dict | None = None
    for key, value in params:
        if key == "user":
            try:
                user_data = json.loads(value)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Malformed user JSON in initData.",
                ) from exc
            break

    if user_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing user data in initData.",
        )

    # h) Check auth_date freshness to prevent replay attacks
    auth_date_str: str | None = None
    for key, value in params:
        if key == "auth_date":
            auth_date_str = value
            break

    if auth_date_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth_date in initData.",
        )

    try:
        auth_date = int(auth_date_str)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth_date in initData.",
        ) from exc

    age = datetime.now(timezone.utc).timestamp() - auth_date
    if age > _INIT_DATA_MAX_AGE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram initData has expired. Please re-open the app.",
        )

    return user_data


def create_access_token(user_id: int, is_admin: bool) -> str:
    """Create a JWT access token with user claims."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "is_admin": is_admin,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    """Create a JWT refresh token with extended expiry."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_EXPIRE_DAYS
    )
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


_OTP_TTL_SECONDS = 300  # 5 minutes
_OTP_REDIS_PREFIX = "aparu:otp:"
_OTP_RATE_LIMIT_PREFIX = "aparu:otp:rl:"
_OTP_RATE_LIMIT_MAX = 5   # max 5 requests per window
_OTP_RATE_LIMIT_WINDOW = 600  # 10 minutes


async def check_otp_rate_limit(phone: str) -> None:
    """Raise HTTP 429 if the phone number has exceeded the OTP request limit.

    Allows up to 5 OTP requests per 10-minute window per phone number.

    Args:
        phone: Phone number to rate-limit.

    Raises:
        HTTPException 429: When the limit is exceeded.
    """
    key = _OTP_RATE_LIMIT_PREFIX + phone
    async with _Redis(connection_pool=redis_pool) as redis:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, _OTP_RATE_LIMIT_WINDOW)
        if count > _OTP_RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком много запросов. Попробуйте через 10 минут.",
            )


async def generate_otp_async(phone: str) -> str:
    """Generate a 6-digit OTP, store it in Redis, and log it to console.

    The OTP is keyed by ``aparu:otp:{phone}`` with a 5-minute TTL.
    In production replace the ``logger.info`` call with an SMS provider.

    Args:
        phone: Phone number used as the Redis key.

    Returns:
        The generated 6-digit OTP string.
    """
    otp = "".join(random.choices(string.digits, k=6))
    async with _Redis(connection_pool=redis_pool) as redis:
        await cache_set(redis, _OTP_REDIS_PREFIX + phone, otp, ttl=_OTP_TTL_SECONDS)
    logger.info("OTP for %s: %s", phone, otp)
    return otp


async def verify_otp(phone: str, otp: str) -> bool:
    """Check the submitted OTP against the stored value in Redis.

    Deletes the key on successful match (single-use). Returns ``False`` when
    the key is missing (expired) or the code does not match.

    Args:
        phone: E.164 phone used as Redis key.
        otp: 4-6igit code submitted by the user.

    Returns:
        ``True`` if the OTP is correct, ``False`` otherwise.
    """
    async with _Redis(connection_pool=redis_pool) as redis:
        stored = await cache_get(redis, _OTP_REDIS_PREFIX + phone)
        if stored is None:
            return False
        if not hmac.compare_digest(str(stored), otp):
            return False
        # Single-use: remove after successful verification
        await cache_set(redis, _OTP_REDIS_PREFIX + phone, "", ttl=1)
    return True


def verify_token(token: str) -> TokenPayload:
    """Decode and validate a JWT token, returning typed payload."""
    try:
        raw = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        return TokenPayload(**raw)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc
