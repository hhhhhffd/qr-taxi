"""Webhook router — POST /api/bot/webhook/{secret}."""

from __future__ import annotations

import logging

from aiogram.exceptions import TelegramAPIError
from aiogram.types import Update
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import ValidationError

from app.bot.bot import bot, dp
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bot", tags=["Bot"])


@router.post("/webhook/{secret}")
async def telegram_webhook(secret: str, request: Request) -> dict[str, bool]:
    """Receive Telegram updates and forward them to aiogram dispatcher."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook secret.",
        )

    try:
        payload = await request.json()
    except ValueError as exc:
        logger.warning("Rejected non-JSON Telegram webhook payload: %s", exc)
        return {"ok": True}

    try:
        update = Update.model_validate(payload, context={"bot": bot})
    except ValidationError as exc:
        logger.warning("Rejected malformed Telegram update: %s", exc)
        return {"ok": True}

    try:
        await dp.feed_update(bot, update)
    except TelegramAPIError as exc:
        logger.warning(
            "Telegram API error while processing update_id=%s: %s",
            update.update_id,
            exc,
        )
    except Exception:
        logger.exception("Unhandled error while processing update_id=%s", update.update_id)

    return {"ok": True}
