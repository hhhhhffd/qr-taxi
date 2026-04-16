"""Order service — creation, status transitions, and pub/sub publishing."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.driver import Driver
from app.models.location import Location
from app.models.order import Order
from app.models.order_event import OrderEvent
from app.models.user import User
from app.schemas.order import OrderCreateRequest
from app.services.geo_service import get_route
from app.services.tariff_service import calculate_price, load_tariffs

logger = logging.getLogger(__name__)

_STAGE_DELAY_SECONDS = 15

ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "searching": ["driver_assigned", "no_drivers", "cancelled"],
    "driver_assigned": ["driver_arriving", "cancelled"],
    "driver_arriving": ["driver_arrived", "cancelled"],
    "driver_arrived": ["ride_started", "cancelled"],
    "ride_started": ["ride_completed"],
    "no_drivers": ["searching", "cancelled"],
}

# Statuses considered terminal / no active order
_INACTIVE_STATUSES = {"ride_completed", "cancelled", "no_drivers"}

# Timestamp column to update per target status
_STATUS_TIMESTAMPS: dict[str, str] = {
    "driver_assigned": "assigned_at",
    "driver_arrived": "arrived_at",
    "ride_started": "started_at",
    "ride_completed": "completed_at",
    "cancelled": "cancelled_at",
}


async def transition(
    order: Order,
    new_status: str,
    session: AsyncSession,
    redis: Redis,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Transition an order to a new status, enforcing the state machine.

    Validates the transition against :data:`ALLOWED_TRANSITIONS`, updates the
    relevant timestamp column, creates an :class:`~app.models.order_event.OrderEvent`
    audit entry, commits, and publishes a JSON message to the Redis pub/sub
    channel ``aparu:order:{order.id}``.

    Args:
        order: The ORM order instance to mutate.
        new_status: Target status string.
        session: Async SQLAlchemy session (will be committed).
        redis: Async Redis client.
        metadata: Optional extra data stored in the OrderEvent and published.

    Raises:
        HTTPException 422: If the transition is not permitted.
    """
    current = order.status
    allowed = ALLOWED_TRANSITIONS.get(current, [])
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Переход из '{current}' в '{new_status}' недопустим.",
        )

    order.status = new_status
    order.updated_at = datetime.now(timezone.utc)

    ts_field = _STATUS_TIMESTAMPS.get(new_status)
    if ts_field:
        setattr(order, ts_field, datetime.now(timezone.utc))

    event = OrderEvent(order_id=order.id, status=new_status, meta=metadata)
    session.add(event)
    await session.commit()

    payload = json.dumps(
        {"type": "status_update", "order_id": order.id, "status": new_status, "metadata": metadata}
    )
    try:
        await redis.publish(f"aparu:order:{order.id}", payload)
    except Exception as exc:
        logger.error("Redis publish failed for order %d (transition %s→%s): %s", order.id, current, new_status, exc)

    logger.info("order %d transitioned %s → %s", order.id, current, new_status)


async def get_active_order(user_id: int, session: AsyncSession) -> Order | None:
    """Return the user's currently active order, or ``None``.

    Active means status is not in ``{ride_completed, cancelled, no_drivers}``.
    The ``driver`` relationship is eagerly loaded to support serialisation.

    Args:
        user_id: ID of the user.
        session: Async SQLAlchemy session.
    """
    result = await session.execute(
        select(Order)
        .options(selectinload(Order.driver))
        .where(
            Order.user_id == user_id,
            Order.status.not_in(list(_INACTIVE_STATUSES)),
        )
        .order_by(Order.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_order(
    user: User,
    data: OrderCreateRequest,
    session: AsyncSession,
    redis: Redis,
) -> Order:
    """Create a new taxi order from a QR scan location.

    Steps:
    1. Check for an existing active order (→ 409).
    2. Load location by slug (→ 404).
    3. If point_b is provided, call the route API and calculate estimated price.
    4. Use a fixed search_delay of 15 s for mock lifecycle demo speed.
    5. Persist the order and initial OrderEvent.
    6. Publish ``searching`` event to Redis.

    Args:
        user: The authenticated user creating the order.
        data: Validated :class:`~app.schemas.order.OrderCreateRequest` payload.
        session: Async SQLAlchemy session.
        redis: Async Redis client.

    Returns:
        The newly created :class:`~app.models.order.Order` instance.
    """
    # 1. Guard: no active order
    active = await get_active_order(user.id, session)
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="У вас уже есть активный заказ.",
        )

    # 2. Resolve location
    loc_result = await session.execute(
        select(Location).where(
            Location.slug == data.location_slug,
            Location.is_active.is_(True),
        )
    )
    location = loc_result.scalar_one_or_none()
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Локация не найдена.",
        )

    # 3. Route + price (only when destination is provided)
    estimated_price: int | None = None
    if data.point_b is not None:
        config = await load_tariffs(redis, session)
        max_km: float = float(config.get("max_distance_km", 30))

        route = await get_route(
            [
                {"lat": float(location.lat), "lng": float(location.lng)},
                {"lat": data.point_b.lat, "lng": data.point_b.lng},
            ],
            redis,
        )
        if route.distance / 1000 > max_km:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Маршрут превышает максимальное расстояние {max_km} км.",
            )
        try:
            estimated_price = calculate_price(
                data.tariff, route.distance, route.time, config
            )
        except KeyError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Неизвестный тариф: {data.tariff}.",
            )

    # 4. Fixed search delay for deterministic demo timing.
    search_delay = _STAGE_DELAY_SECONDS

    # 5. Persist order + initial event
    order = Order(
        user_id=user.id,
        location_id=location.id,
        point_a_lat=location.lat,
        point_a_lng=location.lng,
        point_a_address=location.address or location.name,
        point_b_lat=data.point_b.lat if data.point_b else None,
        point_b_lng=data.point_b.lng if data.point_b else None,
        point_b_address=data.point_b.address if data.point_b else None,
        tariff=data.tariff,
        payment_method=data.payment_method,
        estimated_price=estimated_price,
        status="searching",
        search_delay=search_delay,
    )
    session.add(order)
    await session.flush()  # populate order.id before creating event

    session.add(OrderEvent(order_id=order.id, status="searching"))
    await session.commit()
    await session.refresh(order)

    # 6. Publish initial event (non-critical — worker will update via DB poll)
    try:
        await redis.publish(
            f"aparu:order:{order.id}",
            json.dumps({"type": "status_update", "order_id": order.id, "status": "searching"}),
        )
    except Exception as exc:
        logger.error("Redis publish failed for new order %d: %s", order.id, exc)

    logger.info("order created id=%d user=%d tariff=%s", order.id, user.id, order.tariff)
    return order


async def cancel_order(
    order_id: int,
    user: User,
    session: AsyncSession,
    redis: Redis,
) -> Order:
    """Cancel an order owned by the user.

    Verifies ownership and that the order is in a cancellable state.
    Releases an assigned driver back to ``available`` status if applicable.

    Args:
        order_id: Primary key of the order to cancel.
        user: The authenticated user requesting cancellation.
        session: Async SQLAlchemy session.
        redis: Async Redis client.

    Returns:
        The updated :class:`~app.models.order.Order` instance.
    """
    result = await session.execute(
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
    if order.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа.",
        )
    if order.status in ("ride_started", "ride_completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Заказ в статусе '{order.status}' нельзя отменить.",
        )

    # Release driver if one was assigned
    if order.driver_id is not None and order.status not in ("searching", "no_drivers"):
        drv_result = await session.execute(
            select(Driver).where(Driver.id == order.driver_id)
        )
        driver = drv_result.scalar_one_or_none()
        if driver is not None:
            driver.status = "available"

    order.cancelled_by = "user"
    await transition(order, "cancelled", session, redis, metadata={"cancelled_by": "user"})
    # Reload with relationships after commit
    await session.refresh(order)
    return order


async def rate_order(
    order_id: int,
    user: User,
    rating: int,
    comment: str | None,
    session: AsyncSession,
) -> Order:
    """Rate a completed order (1–5 stars).

    Args:
        order_id: Primary key of the order.
        user: The authenticated user submitting the rating.
        rating: Star rating 1–5 (validated at schema level).
        comment: Optional free-text comment.
        session: Async SQLAlchemy session.

    Returns:
        The updated :class:`~app.models.order.Order` instance.
    """
    result = await session.execute(
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
    if order.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа.",
        )
    if order.status != "ride_completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Оценить можно только завершённый заказ.",
        )
    if order.rating is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Заказ уже оценён.",
        )

    order.rating = rating
    order.rating_comment = comment
    order.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(order)

    logger.info("order %d rated %d stars by user %d", order_id, rating, user.id)
    return order
