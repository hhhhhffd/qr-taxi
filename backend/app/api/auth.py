"""Authentication endpoints: Telegram initData validation, phone, refresh, me."""

import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    OtpRequestBody,
    OtpVerifyBody,
    PhoneRequest,
    TelegramAuthRequest,
    UserOut,
    WechatAuthBody,
)
from app.services.auth_service import (
    check_otp_rate_limit,
    create_access_token,
    create_refresh_token,
    generate_otp_async,
    validate_telegram_init_data,
    verify_otp,
    verify_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/telegram", response_model=AuthResponse)
async def auth_telegram(
    body: TelegramAuthRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Validate Telegram initData, upsert user, return JWT + user profile."""
    tg_user = validate_telegram_init_data(body.init_data, settings.BOT_TOKEN)

    telegram_id: int = tg_user["id"]
    first_name: str = tg_user.get("first_name", "")
    username: str | None = tg_user.get("username")

    # Upsert: find existing user or create new one
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=telegram_id,
            first_name=first_name,
            username=username,
            lang=body.lang,
        )
        db.add(user)
        await db.flush()
        logger.info("Created new user telegram_id=%d", telegram_id)
    else:
        # Update profile fields that may have changed in Telegram
        user.first_name = first_name
        if username is not None:
            user.username = username

    await db.commit()
    await db.refresh(user)

    # Issue tokens
    access_token = create_access_token(user.id, user.is_admin)
    refresh_token = create_refresh_token(user.id)

    # Set refresh token as httpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )

    return AuthResponse(
        access_token=access_token,
        user=UserOut.model_validate(user),
    )


@router.post("/phone", response_model=UserOut)
async def save_phone(
    body: PhoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Save phone number after Telegram.WebApp.requestContact()."""
    current_user.phone = body.phone
    current_user.onboarded = True
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Rotate JWT pair using the httpOnly refresh cookie."""
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing.",
        )

    payload = verify_token(refresh_token)

    if payload.type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
        )

    # Load user from DB to get fresh is_admin / profile data
    result = await db.execute(select(User).where(User.id == payload.sub))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    new_access = create_access_token(user.id, user.is_admin)
    new_refresh = create_refresh_token(user.id)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )

    return AuthResponse(
        access_token=new_access,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserOut:
    """Return the current authenticated user's profile."""
    return UserOut.model_validate(current_user)


@router.post("/otp/request", status_code=status.HTTP_200_OK)
async def otp_request(body: OtpRequestBody) -> dict[str, str]:
    """Generate and log an OTP for the given phone number.

    The OTP is stored in Redis for 5 minutes.  In production this endpoint
    triggers an SMS; for MVP the code is written to the application log.
    """
    await check_otp_rate_limit(body.phone)
    await generate_otp_async(body.phone)
    return {"message": "OTP отправлен"}


@router.post("/otp/verify", response_model=AuthResponse)
async def otp_verify(
    body: OtpVerifyBody,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Verify the OTP and issue a JWT pair.

    Finds an existing user by phone (platform=web) or creates a new one.
    """
    ok = await verify_otp(body.phone, body.otp)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или истёкший код.",
        )

    result = await db.execute(
        select(User).where(User.phone == body.phone, User.platform == "web")
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            phone=body.phone,
            first_name=body.first_name or body.phone,
            platform="web",
            onboarded=True,
            lang=body.lang,
        )
        db.add(user)
        await db.flush()
        logger.info("Created new web user phone=%s", body.phone)

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, user.is_admin)
    refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )

    return AuthResponse(access_token=access_token, user=UserOut.model_validate(user))


@router.post("/wechat", response_model=AuthResponse)
async def auth_wechat(
    body: WechatAuthBody,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """WeChat H5 authentication with a (possibly fake) phone number.

    In a real WeChat Mini Program the phone is verified server-side by
    exchanging a WeChat session code.  For the current H5 MVP the frontend
    supplies the phone directly after the user taps «Разрешить» in the
    imitation dialog.  The ``platform`` is set to ``wechat`` so these users
    are distinguishable in analytics.
    """
    result = await db.execute(
        select(User).where(User.phone == body.phone, User.platform == "wechat")
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            phone=body.phone,
            first_name=body.display_name or "WeChat User",
            platform="wechat",
            onboarded=True,
            lang=body.lang,
        )
        db.add(user)
        await db.flush()
        logger.info("Created new wechat user phone=%s", body.phone)

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, user.is_admin)
    refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )

    return AuthResponse(access_token=access_token, user=UserOut.model_validate(user))
