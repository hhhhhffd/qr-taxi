"""aiogram 3 Bot and Dispatcher setup and lifecycle helpers."""

from __future__ import annotations

import logging

from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramAPIError
from fastapi import FastAPI

from app.bot.handlers import register_handlers
from app.config import settings

logger = logging.getLogger(__name__)

bot = Bot(token=settings.BOT_TOKEN)
dp = Dispatcher()
register_handlers(dp)


def _build_webhook_url() -> str:
    """Build Telegram webhook URL from app settings."""
    domain = settings.DOMAIN.removeprefix("https://").removeprefix("http://").strip("/")
    return f"https://{domain}/api/bot/webhook/{settings.WEBHOOK_SECRET}"


async def setup_webhook(app: FastAPI) -> None:
    """Register webhook URL in Telegram."""
    webhook_url = _build_webhook_url()
    app.state.telegram_bot = bot
    app.state.telegram_dispatcher = dp
    try:
        await bot.set_webhook(
            url=webhook_url,
            allowed_updates=dp.resolve_used_update_types(),
        )
        logger.info("Telegram webhook configured url=%s", webhook_url)
    except TelegramAPIError as exc:
        logger.error("Failed to configure Telegram webhook: %s", exc)


async def shutdown_bot() -> None:
    """Delete webhook and close bot HTTP session."""
    try:
        await bot.delete_webhook(drop_pending_updates=False)
    except TelegramAPIError as exc:
        logger.warning("Failed to delete Telegram webhook: %s", exc)
    await bot.session.close()
