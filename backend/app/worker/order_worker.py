"""Background worker — single asyncio loop ticking every 5 s to simulate driver lifecycle."""

from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session_maker
from app.models.driver import Driver
from app.models.order import Order
from app.models.order_event import OrderEvent
from app.services.notification_service import (
    schedule_app_install_prompt,
    send_driver_arrived,
    send_driver_assigned,
    send_driver_cancelled,
    send_pre_arrival,
    send_ride_completed,
)
from app.services.order_service import transition
from app.services.tariff_service import load_tariffs

logger = logging.getLogger(__name__)

# Sedan tariffs share the same driver pool
_SEDAN_TARIFFS = {"econom", "optimal", "comfort"}
_STAGE_DELAY_SECONDS = 15
_NO_DRIVERS_PROBABILITY = 0.0


async def order_worker(app: Any) -> None:
    """Single background loop. Ticks every 5 seconds. Processes all active orders.

    The worker has NO in-memory state — on restart it reads everything from DB
    timestamps, so it is safe to kill and restart at any time.
    """
    logger.info("Order worker started")
    while True:
        await asyncio.sleep(5)
        try:
            async with async_session_maker() as session:
                redis: Redis = app.state.redis
                now = datetime.now(timezone.utc)
                await _process_searching(session, redis, now)
                await _process_arriving(session, redis, now)
                await _process_arrived(session, redis, now)
                await _process_riding(session, redis, now)
                await _process_timeouts(session, redis, now)
        except Exception as exc:
            logger.error("Worker tick failed: %s", exc)
            # NEVER crash the loop. Log and continue.


# ---------------------------------------------------------------------------
# Phase 1 — searching → driver_assigned → driver_arriving
# ---------------------------------------------------------------------------


async def _process_searching(session: AsyncSession, redis: Redis, now: datetime) -> None:
    """Assign mock drivers to orders waiting in 'searching'."""
    try:
        result = await asyncio.wait_for(
            session.execute(
                select(Order)
                .options(selectinload(Order.user))
                .where(Order.status == "searching")
            ),
            timeout=30,
        )
        orders = list(result.scalars().all())
    except Exception as exc:
        logger.error("_process_searching query failed: %s", exc)
        return

    search_timeout = _STAGE_DELAY_SECONDS

    for order in orders:
        try:
            elapsed = (now - order.created_at).total_seconds()

            # Not past simulated search delay yet
            if elapsed < order.search_delay:
                continue

            # Demo mode: keep lifecycle deterministic by default.
            if _NO_DRIVERS_PROBABILITY > 0 and random.random() < _NO_DRIVERS_PROBABILITY:
                await transition(
                    order, "no_drivers", session, redis,
                    metadata={"reason": "random"},
                )
                logger.info("order %d -> no_drivers (random)", order.id)
                continue

            # Find a matching available driver
            driver = await _find_available_driver(session, order.tariff)
            if driver is None:
                if elapsed > search_timeout:
                    await transition(
                        order, "no_drivers", session, redis,
                        metadata={"reason": "timeout"},
                    )
                    logger.info("order %d -> no_drivers (timeout)", order.id)
                continue

            # Assign driver
            driver.status = "busy"
            order.driver_id = driver.id

            meta: dict[str, Any] = {
                "arrive_delay": _STAGE_DELAY_SECONDS,
                "ride_start_delay": _STAGE_DELAY_SECONDS,
                "ride_duration": _STAGE_DELAY_SECONDS,
                "pre_arrival_notified": False,
            }

            await transition(order, "driver_assigned", session, redis, metadata=meta)
            # Immediately progress to driver_arriving
            await transition(order, "driver_arriving", session, redis)

            # Telegram notification: driver assigned
            if order.user and order.user.telegram_id:
                eta_min = max(1, meta["arrive_delay"] // 60)
                await send_driver_assigned(
                    order.user,
                    driver.name,
                    driver.car_model,
                    driver.car_color,
                    driver.plate,
                    eta_min,
                )

            logger.info("order %d -> driver_arriving (driver %d)", order.id, driver.id)

        except Exception as exc:
            logger.error("_process_searching order %d failed: %s", order.id, exc)
            try:
                await session.rollback()
            except Exception:
                return


# ---------------------------------------------------------------------------
# Phase 2 — driver_arriving → driver_arrived
# ---------------------------------------------------------------------------


async def _process_arriving(session: AsyncSession, redis: Redis, now: datetime) -> None:
    """Move 'driver_arriving' orders to 'driver_arrived' based on simulated ETA."""
    try:
        result = await asyncio.wait_for(
            session.execute(
                select(Order)
                .options(
                    selectinload(Order.user),
                    selectinload(Order.driver),
                    selectinload(Order.location),
                )
                .where(Order.status == "driver_arriving")
            ),
            timeout=30,
        )
        orders = list(result.scalars().all())
    except Exception as exc:
        logger.error("_process_arriving query failed: %s", exc)
        return

    for order in orders:
        try:
            if order.assigned_at is None:
                logger.warning("order %d in driver_arriving but assigned_at is None", order.id)
                continue

            meta = await _load_assignment_meta(session, order.id)
            if meta is None:
                logger.warning("order %d missing assignment metadata", order.id)
                continue

            arrive_delay = _STAGE_DELAY_SECONDS
            arrival_target = order.assigned_at + timedelta(seconds=arrive_delay)

            # Publish interpolated driver location for live map tracking.
            # Progress: linear interpolation from driver's initial position → point A.
            if order.driver is not None:
                elapsed_secs = (now - order.assigned_at).total_seconds()
                progress = min(1.0, max(0.0, elapsed_secs / arrive_delay))
                start_lat = float(order.driver.lat)
                start_lng = float(order.driver.lng)
                end_lat = float(order.point_a_lat)
                end_lng = float(order.point_a_lng)
                loc_msg = json.dumps({
                    "type": "driver_location",
                    "order_id": order.id,
                    "lat": round(start_lat + (end_lat - start_lat) * progress, 6),
                    "lng": round(start_lng + (end_lng - start_lng) * progress, 6),
                })
                await redis.publish(f"aparu:order:{order.id}", loc_msg)

            # Publish ETA so the client can show a live countdown.
            eta_seconds = max(0, int((arrival_target - now).total_seconds()))
            eta_msg = json.dumps({
                "type": "eta_update",
                "order_id": order.id,
                "eta_seconds": eta_seconds,
            })
            await redis.publish(f"aparu:order:{order.id}", eta_msg)

            # Pre-arrival notification ~60 s before arrival
            if not meta.get("pre_arrival_notified", False):
                seconds_left = (arrival_target - now).total_seconds()
                if seconds_left < 60:
                    if order.user and order.user.telegram_id:
                        await send_pre_arrival(order.user)
                    # Persist the notification flag
                    await _update_event_meta(
                        session, order.id, "driver_assigned",
                        {"pre_arrival_notified": True},
                    )

            # Driver has arrived
            if now >= arrival_target:
                await transition(order, "driver_arrived", session, redis)
                if order.user and order.user.telegram_id:
                    hint = ""
                    if order.location:
                        hint = order.location.hint_ru or order.location.name
                    await send_driver_arrived(order.user, hint)
                logger.info("order %d -> driver_arrived", order.id)

        except Exception as exc:
            logger.error("_process_arriving order %d failed: %s", order.id, exc)
            try:
                await session.rollback()
            except Exception:
                return


# ---------------------------------------------------------------------------
# Phase 3 — driver_arrived → ride_started
# ---------------------------------------------------------------------------


async def _process_arrived(session: AsyncSession, redis: Redis, now: datetime) -> None:
    """Start rides for 'driver_arrived' orders after simulated boarding delay."""
    try:
        result = await asyncio.wait_for(
            session.execute(
                select(Order).where(Order.status == "driver_arrived")
            ),
            timeout=30,
        )
        orders = list(result.scalars().all())
    except Exception as exc:
        logger.error("_process_arrived query failed: %s", exc)
        return

    for order in orders:
        try:
            if order.arrived_at is None:
                continue

            meta = await _load_assignment_meta(session, order.id)
            if meta is None:
                continue

            ride_start_delay = _STAGE_DELAY_SECONDS
            if (now - order.arrived_at).total_seconds() >= ride_start_delay:
                await transition(order, "ride_started", session, redis)
                logger.info("order %d -> ride_started", order.id)

        except Exception as exc:
            logger.error("_process_arrived order %d failed: %s", order.id, exc)
            try:
                await session.rollback()
            except Exception:
                return


# ---------------------------------------------------------------------------
# Phase 4 — ride_started → ride_completed
# ---------------------------------------------------------------------------


async def _process_riding(session: AsyncSession, redis: Redis, now: datetime) -> None:
    """Complete rides and release drivers."""
    try:
        result = await asyncio.wait_for(
            session.execute(
                select(Order)
                .options(selectinload(Order.user), selectinload(Order.driver))
                .where(Order.status == "ride_started")
            ),
            timeout=30,
        )
        orders = list(result.scalars().all())
    except Exception as exc:
        logger.error("_process_riding query failed: %s", exc)
        return

    config = await load_tariffs(redis, session)

    for order in orders:
        try:
            if order.started_at is None:
                continue

            meta = await _load_assignment_meta(session, order.id)
            if meta is None:
                continue

            ride_duration = _STAGE_DELAY_SECONDS
            if (now - order.started_at).total_seconds() < ride_duration:
                continue

            # Calculate final price
            if order.estimated_price:
                final_price = order.estimated_price
            else:
                tariff_cfg = config.get("tariffs", {}).get(order.tariff, {})
                final_price = int(tariff_cfg.get("base_fare", 600))

            order.final_price = final_price

            # Release driver
            if order.driver:
                order.driver.status = "available"

            await transition(
                order, "ride_completed", session, redis,
                metadata={"final_price": final_price},
            )

            if order.user and order.user.telegram_id:
                await send_ride_completed(order.user, final_price)
                schedule_app_install_prompt(order.user)

            logger.info("order %d -> ride_completed (price=%d)", order.id, final_price)

        except Exception as exc:
            logger.error("_process_riding order %d failed: %s", order.id, exc)
            try:
                await session.rollback()
            except Exception:
                return


# ---------------------------------------------------------------------------
# Phase 5 — driver_arrived timeout → cancelled
# ---------------------------------------------------------------------------


async def _process_timeouts(session: AsyncSession, redis: Redis, now: datetime) -> None:
    """Cancel 'driver_arrived' orders that exceeded the wait timeout."""
    try:
        wait_timeout = _STAGE_DELAY_SECONDS

        result = await asyncio.wait_for(
            session.execute(
                select(Order)
                .options(selectinload(Order.user), selectinload(Order.driver))
                .where(Order.status == "driver_arrived")
            ),
            timeout=30,
        )
        orders = list(result.scalars().all())
    except Exception as exc:
        logger.error("_process_timeouts query failed: %s", exc)
        return

    for order in orders:
        try:
            if order.arrived_at is None:
                continue

            if (now - order.arrived_at).total_seconds() < wait_timeout:
                continue

            order.cancelled_by = "system"
            if order.driver:
                order.driver.status = "available"

            await transition(
                order, "cancelled", session, redis,
                metadata={"cancelled_by": "system", "reason": "driver_wait_timeout"},
            )

            if order.user and order.user.telegram_id:
                await send_driver_cancelled(order.user)

            logger.info("order %d cancelled (wait timeout)", order.id)

        except Exception as exc:
            logger.error("_process_timeouts order %d failed: %s", order.id, exc)
            try:
                await session.rollback()
            except Exception:
                return


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


async def _find_available_driver(session: AsyncSession, tariff: str) -> Driver | None:
    """Pick a random available driver whose car_class matches the tariff.

    Sedan tariffs (econom/optimal/comfort) share a single driver pool.

    Args:
        session: Async SQLAlchemy session.
        tariff: Order tariff key.

    Returns:
        A :class:`Driver` or ``None``.
    """
    if tariff in _SEDAN_TARIFFS:
        cls_filter = Driver.car_class.in_(list(_SEDAN_TARIFFS))
    else:
        cls_filter = (Driver.car_class == tariff)

    result = await asyncio.wait_for(
        session.execute(
            select(Driver).where(Driver.status == "available", cls_filter)
        ),
        timeout=30,
    )
    drivers = list(result.scalars().all())
    return random.choice(drivers) if drivers else None


async def _load_assignment_meta(session: AsyncSession, order_id: int) -> dict[str, Any] | None:
    """Load timing metadata from the 'driver_assigned' order event.

    Args:
        session: Async SQLAlchemy session.
        order_id: ID of the order.

    Returns:
        Metadata dict or ``None``.
    """
    result = await asyncio.wait_for(
        session.execute(
            select(OrderEvent)
            .where(
                OrderEvent.order_id == order_id,
                OrderEvent.status == "driver_assigned",
            )
            .order_by(OrderEvent.created_at.desc())
            .limit(1)
        ),
        timeout=30,
    )
    event = result.scalar_one_or_none()
    if event is None or event.meta is None:
        return None
    return dict(event.meta)  # defensive copy


async def _update_event_meta(
    session: AsyncSession,
    order_id: int,
    event_status: str,
    updates: dict[str, Any],
) -> None:
    """Merge updates into an existing order event's metadata.

    Args:
        session: Async SQLAlchemy session.
        order_id: ID of the order.
        event_status: Status of the event to update.
        updates: Key-value pairs to merge into metadata.
    """
    result = await asyncio.wait_for(
        session.execute(
            select(OrderEvent)
            .where(
                OrderEvent.order_id == order_id,
                OrderEvent.status == event_status,
            )
            .order_by(OrderEvent.created_at.desc())
            .limit(1)
        ),
        timeout=30,
    )
    event = result.scalar_one_or_none()
    if event is not None and event.meta is not None:
        merged = {**event.meta, **updates}
        event.meta = merged  # reassign to trigger SQLAlchemy dirty flag
        await asyncio.wait_for(session.commit(), timeout=30)
