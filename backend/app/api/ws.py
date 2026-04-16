"""WebSocket endpoint for real-time order status updates."""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session_maker
from app.models.order import Order
from app.redis import redis_pool
from app.services.auth_service import verify_token

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_driver_brief(driver, public: bool = False) -> dict | None:
    """Build a driver brief dict suitable for WebSocket messages.

    Args:
        driver: Driver ORM instance, or None.
        public: When True (share_token access), omit sensitive fields like phone.

    Returns:
        Dict with driver fields, or None if no driver.
    """
    if driver is None:
        return None
    brief = {
        "id": driver.id,
        "name": driver.name,
        "car_model": driver.car_model,
        "car_color": driver.car_color,
        "plate": driver.plate,
        "rating": float(driver.rating),
        "photo_url": driver.photo_url,
    }
    if not public:
        brief["phone"] = driver.phone
    return brief


async def _load_order(order_id: int) -> Order | None:
    """Load an order with its driver relationship from the database.

    Args:
        order_id: Primary key of the order to load.

    Returns:
        Order ORM instance with driver eagerly loaded, or None if not found.
    """
    async with async_session_maker() as session:
        result = await session.execute(
            select(Order)
            .options(selectinload(Order.driver))
            .where(Order.id == order_id)
        )
        return result.scalar_one_or_none()


def _build_status_message(order: Order, public: bool = False) -> dict:
    """Build a full ``status_update`` WebSocket message from an order.

    The frontend MUST fully overwrite local state with the first status_update
    received on (re)connect to prevent race conditions.

    Args:
        order: Order ORM instance with driver relationship already loaded.
        public: When True, sensitive driver fields (phone) are omitted.

    Returns:
        Dict conforming to the WS status_update message format.
    """
    return {
        "type": "status_update",
        "order_id": order.id,
        "status": order.status,
        "driver": _build_driver_brief(order.driver, public=public),
        "estimated_price": order.estimated_price,
        "final_price": order.final_price,
        "eta_seconds": None,  # sent separately via eta_update messages
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.websocket("/orders/{order_id}")
async def order_websocket(
    websocket: WebSocket,
    order_id: int,
    token: str | None = Query(None),
    share_token: str | None = Query(None),
) -> None:
    """WebSocket endpoint for real-time order tracking.

    Authenticates via JWT ``token`` (owner) or ``share_token`` (public link),
    sends the full current order state immediately on connect, then streams
    Redis pub/sub events (status changes, driver location) to the client.

    A ``{"type": "ping"}`` message is sent every 15 seconds to prevent
    Cloudflare Tunnel from closing idle connections.

    Close code 4001 is used for all authentication failures.

    Args:
        websocket: The WebSocket connection from Starlette.
        order_id: Primary key of the order to track.
        token: JWT access token for authenticated user.
        share_token: UUID share token for public/unauthenticated tracking.
    """
    # ------------------------------------------------------------------ #
    # 1. Accept connection first, then authenticate.                      #
    # WebSocket close codes (4001) require an accepted connection —       #
    # closing before accept sends HTTP 403 instead of a WS close frame.  #
    # ------------------------------------------------------------------ #
    await websocket.accept()

    async def reject(code: int = 4001) -> None:
        """Close with WS close code and return."""
        await websocket.close(code=code)

    order = await _load_order(order_id)
    if order is None:
        await reject(code=4004)  # 4004 = order not found
        return

    is_public = False
    if token is not None:
        try:
            payload = verify_token(token)
        except Exception:
            await reject()
            return
        if order.user_id != payload.sub:
            await reject()
            return
    elif share_token is not None:
        if order.share_token is None or str(order.share_token) != share_token:
            await reject()
            return
        is_public = True
    else:
        # Neither token provided
        await reject()
        return

    logger.info("ws connected order=%d public=%s", order_id, is_public)

    # ------------------------------------------------------------------ #
    # 3. Send full current order state as the first message               #
    # ------------------------------------------------------------------ #
    try:
        await websocket.send_json(_build_status_message(order, public=is_public))
    except WebSocketDisconnect:
        logger.info("ws disconnected immediately order=%d", order_id)
        return

    # ------------------------------------------------------------------ #
    # 4. Subscribe to Redis pub/sub channel                               #
    # ------------------------------------------------------------------ #
    redis: Redis = Redis(connection_pool=redis_pool, decode_responses=True)
    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(f"aparu:order:{order_id}")
    except Exception as exc:
        logger.error("ws failed to subscribe to Redis for order=%d: %s", order_id, exc)
        try:
            await websocket.close(code=4003)  # 4003 = internal error
        except Exception:
            pass
        await redis.aclose()
        return

    # ------------------------------------------------------------------ #
    # 5. Run three concurrent tasks                                       #
    # ------------------------------------------------------------------ #

    async def redis_listener() -> None:
        """Forward Redis pub/sub messages to the WebSocket client.

        - ``driver_location`` messages are forwarded as-is.
        - All other messages trigger a fresh DB read so the client always
          receives complete, consistent order state.
        """
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue

                if data.get("type") in ("driver_location", "eta_update"):
                    await websocket.send_json(data)
                else:
                    # Reload from DB to get updated driver/price fields
                    fresh = await _load_order(order_id)
                    if fresh is not None:
                        await websocket.send_json(_build_status_message(fresh, public=is_public))
        except (WebSocketDisconnect, RuntimeError):
            pass
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("ws redis_listener error order=%d: %s", order_id, exc)

    async def ping_task() -> None:
        """Send a ping message every 15 s to prevent Cloudflare Tunnel idle timeout."""
        try:
            while True:
                await asyncio.sleep(15)
                await websocket.send_json({"type": "ping"})
                logger.info("ws ping sent order=%d", order_id)
        except (WebSocketDisconnect, RuntimeError):
            pass
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("ws ping_task error order=%d: %s", order_id, exc)

    async def receive_task() -> None:
        """Drain incoming frames and detect client disconnect promptly.

        Without this, a silent disconnect is only noticed on the next send
        (up to 15 s away).  This task exits the moment the client closes.
        """
        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    break
        except (WebSocketDisconnect, RuntimeError):
            pass
        except asyncio.CancelledError:
            pass

    listener_task = asyncio.create_task(redis_listener())
    pinger_task = asyncio.create_task(ping_task())
    receiver_task = asyncio.create_task(receive_task())

    # ------------------------------------------------------------------ #
    # 6. Wait until any task finishes (disconnect / error)                #
    # ------------------------------------------------------------------ #
    try:
        await asyncio.wait(
            [listener_task, pinger_task, receiver_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
    except Exception:
        pass
    finally:
        # Cancel remaining tasks and clean up pub/sub
        listener_task.cancel()
        pinger_task.cancel()
        receiver_task.cancel()
        await asyncio.gather(
            listener_task, pinger_task, receiver_task, return_exceptions=True
        )
        try:
            await pubsub.unsubscribe(f"aparu:order:{order_id}")
            await pubsub.aclose()
        except Exception:
            pass
        try:
            await redis.aclose()
        except Exception:
            pass
        logger.info("ws disconnected order=%d", order_id)
