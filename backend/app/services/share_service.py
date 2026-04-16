"""Share service — generate and resolve public order tracking tokens."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order


async def generate_share_token(
    order_id: int,
    user_id: int,
    session: AsyncSession,
) -> str:
    """Generate a UUID share token for public order tracking.

    Idempotent — returns the existing token if one already exists on the order.

    Args:
        order_id: Primary key of the order.
        user_id: ID of the authenticated user (must be the order owner).
        session: Async SQLAlchemy session.

    Returns:
        Share token as a lower-case UUID string.

    Raises:
        HTTPException 404: Order not found.
        HTTPException 403: Caller is not the order owner.
    """
    result = await session.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден.",
        )
    if order.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа.",
        )

    if order.share_token is None:
        order.share_token = uuid.uuid4()
        await session.commit()
        await session.refresh(order)

    return str(order.share_token)


async def get_order_by_share_token(
    share_token: str,
    session: AsyncSession,
) -> Order:
    """Resolve a public share token to the corresponding Order.

    The ``driver`` relationship is eagerly loaded so the result can be
    serialised without an open session.

    Args:
        share_token: UUID string from the public tracking URL.
        session: Async SQLAlchemy session.

    Returns:
        The matching :class:`~app.models.order.Order` instance.

    Raises:
        HTTPException 404: Token is malformed or no matching order exists.
    """
    try:
        token_uuid = uuid.UUID(share_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Неверный токен.",
        ) from exc

    result = await session.execute(
        select(Order)
        .options(selectinload(Order.driver))
        .where(Order.share_token == token_uuid)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден.",
        )
    return order
