"""Order management endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.order import Order
from app.models.user import User
from app.redis import get_redis
from app.schemas.order import (
    DriverBrief,
    OrderCreateRequest,
    OrderOut,
    OrderRateRequest,
    PointOut,
)
from app.services.order_service import (
    cancel_order,
    create_order,
    get_active_order,
    rate_order,
)
from app.services.share_service import generate_share_token, get_order_by_share_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["Orders"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _fetch_order_full(order_id: int, db: AsyncSession) -> Order:
    """Fetch an order with the ``driver`` relationship eagerly loaded.

    Args:
        order_id: Primary key of the order.
        db: Async SQLAlchemy session.

    Returns:
        The :class:`~app.models.order.Order` instance.

    Raises:
        HTTPException 404: Order not found.
    """
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.driver))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден.",
        )
    return order


def _build_driver(order: Order, hide_phone: bool = False) -> DriverBrief | None:
    """Convert the order's driver relationship to :class:`DriverBrief`, or ``None``."""
    d = order.driver
    if d is None:
        return None
    return DriverBrief(
        id=d.id,
        name=d.name,
        car_model=d.car_model,
        car_color=d.car_color,
        plate=d.plate,
        phone="" if hide_phone else d.phone,
        rating=float(d.rating),
        photo_url=d.photo_url,
    )


def _order_to_out(order: Order, hide_driver_phone: bool = False) -> OrderOut:
    """Convert an :class:`~app.models.order.Order` ORM instance to :class:`OrderOut`.

    Args:
        order: ORM order with ``driver`` relationship already loaded.
        hide_driver_phone: When ``True`` the driver's phone number is redacted
            (used for public share-link responses).
    """
    point_b: PointOut | None = None
    if order.point_b_lat is not None and order.point_b_address is not None:
        point_b = PointOut(
            lat=float(order.point_b_lat),
            lng=float(order.point_b_lng),  # type: ignore[arg-type]
            address=order.point_b_address,
        )

    return OrderOut(
        id=order.id,
        status=order.status,
        point_a=PointOut(
            lat=float(order.point_a_lat),
            lng=float(order.point_a_lng),
            address=order.point_a_address,
        ),
        point_b=point_b,
        tariff=order.tariff,
        payment_method=order.payment_method,
        estimated_price=order.estimated_price,
        final_price=order.final_price,
        driver=_build_driver(order, hide_phone=hide_driver_phone),
        share_token=str(order.share_token) if order.share_token else None,
        rating=order.rating,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


# ---------------------------------------------------------------------------
# Routes — literal paths must be declared before parameterised ones
# ---------------------------------------------------------------------------


_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW_S = 60


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order_endpoint(
    body: OrderCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> OrderOut:
    """Create a new taxi order from a QR scan location.

    Returns 409 if the user already has an active order.
    Returns 404 if the location slug is unknown.
    Returns 422 if the route exceeds max distance or the tariff is invalid.
    Returns 429 if the user exceeds 5 order attempts per minute.
    """
    # Rate limiting: max 5 order creations per user per 60 s (Redis counter)
    rate_key = f"aparu:ratelimit:order:{user.id}"
    try:
        count_raw = await redis.get(rate_key)
        if count_raw is not None and int(count_raw) >= _RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком много заказов. Попробуйте через минуту.",
            )
        # Increment counter; set TTL only on first increment to preserve the window
        pipe = redis.pipeline(transaction=False)
        pipe.incr(rate_key)
        pipe.expire(rate_key, _RATE_LIMIT_WINDOW_S)
        await pipe.execute()
    except HTTPException:
        raise
    except Exception as exc:
        # Redis unavailable — skip rate limiting rather than blocking requests
        logger.warning("Rate limit check skipped (Redis unavailable): %s", exc)

    try:
        order = await create_order(user, body, db, redis)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error in create_order for user=%d: %s", user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка сервера. Попробуйте позже.",
        )

    order = await _fetch_order_full(order.id, db)
    return _order_to_out(order)


@router.get("/active", response_model=OrderOut | None)
async def get_active_order_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut | None:
    """Return the caller's currently active order, or ``null`` if none exists."""
    order = await get_active_order(user.id, db)
    if order is None:
        return None
    return _order_to_out(order)


@router.get("/track/{share_token}", response_model=OrderOut)
async def track_order(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """Public order tracking endpoint — no authentication required.

    Returns a limited :class:`OrderOut` with the driver's phone number redacted.
    """
    order = await get_order_by_share_token(share_token, db)
    return _order_to_out(order, hide_driver_phone=True)


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """Fetch a single order by ID. Only the order owner can access it."""
    order = await _fetch_order_full(order_id, db)
    if order.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа.",
        )
    return _order_to_out(order)


@router.patch("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order_endpoint(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> OrderOut:
    """Cancel an active order. Must be the order owner.

    Returns 422 if the order is already in ``ride_started`` or a terminal state.
    """
    await cancel_order(order_id, user, db, redis)
    order = await _fetch_order_full(order_id, db)
    return _order_to_out(order)


@router.post("/{order_id}/rate", response_model=OrderOut)
async def rate_order_endpoint(
    order_id: int,
    body: OrderRateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """Submit a 1–5 star rating for a completed ride."""
    await rate_order(order_id, user, body.rating, body.comment, db)
    order = await _fetch_order_full(order_id, db)
    return _order_to_out(order)


@router.post("/{order_id}/share")
async def share_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a public share token for the order tracking page.

    Idempotent — returns the same token on repeated calls.
    Response: ``{"data": {"share_token": "...", "url": "https://..."}}``.
    """
    token = await generate_share_token(order_id, user.id, db)
    url = f"https://{settings.DOMAIN}/track/{token}"
    return {"data": {"share_token": token, "url": url}}
