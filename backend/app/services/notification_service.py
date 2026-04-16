"""Notification service — send Telegram bot messages on order lifecycle events."""

from __future__ import annotations

import asyncio
import logging

from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError

from app.bot.bot import bot
from app.models.user import User

logger = logging.getLogger(__name__)

_ANDROID_APP_URL = "https://play.google.com/store/apps/details?id=kz.aparu.aparupassenger&hl=ru&pli=1"
_IOS_APP_URL = "https://apps.apple.com/kz/app/aparu-%D0%BB%D1%83%D1%87%D1%88%D0%B5-%D1%87%D0%B5%D0%BC-%D1%82%D0%B0%D0%BA%D1%81%D0%B8/id997499904"
_APP_PROMO_DELAY_SECONDS = 15


async def _send_message(chat_id: int, text: str) -> None:
    """Send a Telegram message while safely handling delivery errors."""
    try:
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            disable_web_page_preview=True,
        )
    except TelegramForbiddenError:
        logger.info("Skipping Telegram message: user blocked bot telegram_id=%d", chat_id)
    except TelegramBadRequest as exc:
        logger.warning(
            "Telegram rejected message telegram_id=%d error=%s",
            chat_id,
            exc,
        )
    except TelegramAPIError as exc:
        logger.error("Telegram API error telegram_id=%d error=%s", chat_id, exc)


async def _send_user_message(user: User, text: str) -> None:
    """Send a Telegram message to a specific user if chat id is available."""
    if user.telegram_id is None:
        return
    await _send_message(user.telegram_id, text)


def _build_app_install_text() -> str:
    return (
        "Если будет удобно, установите приложение APARU:\n"
        f"Google Play: {_ANDROID_APP_URL}\n"
        f"App Store: {_IOS_APP_URL}"
    )


async def send_driver_assigned(
    user: User,
    driver_name: str,
    car_model: str,
    car_color: str,
    plate: str,
    eta_min: int,
) -> None:
    """Notify user that a driver was assigned."""
    await _send_user_message(
        user,
        f"Водитель {driver_name} ({car_model} {car_color}, {plate}) едет к вам. ~{eta_min} мин",
    )


async def send_pre_arrival(user: User) -> None:
    """Notify user shortly before driver arrival."""
    await _send_user_message(user, "Водитель почти на месте! Пора выходить 🚕")


async def send_driver_arrived(user: User, hint: str) -> None:
    """Notify user that the driver has arrived at pickup point."""
    await _send_user_message(user, f"Водитель ждёт вас у точки: {hint}")


async def send_ride_completed(user: User, price: int) -> None:
    """Notify user that the ride is completed with final price."""
    await _send_user_message(user, f"Поездка завершена! Стоимость: {price} ₸. Спасибо!")


async def send_driver_cancelled(user: User) -> None:
    """Notify user when order is cancelled due to driver timeout."""
    await _send_user_message(user, "К сожалению, водитель отменил заказ. Попробуйте снова.")


def schedule_app_install_prompt(user: User, delay_seconds: int = _APP_PROMO_DELAY_SECONDS) -> None:
    """Schedule a soft app-install prompt after ride completion."""
    if user.telegram_id is None:
        return
    chat_id = user.telegram_id

    async def _send_later() -> None:
        await asyncio.sleep(delay_seconds)
        await _send_message(chat_id, _build_app_install_text())

    asyncio.create_task(_send_later())
