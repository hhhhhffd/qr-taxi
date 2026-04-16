"""Telegram bot command handlers: /start and contact sharing."""

from __future__ import annotations

from aiogram import Dispatcher, F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from sqlalchemy import select

from app.config import settings
from app.database import async_session_maker
from app.models.user import User

router = Router()


def _build_mini_app_url(slug: str | None = None) -> str:
    """Build Mini App URL from DOMAIN setting, optionally with slug."""
    domain = settings.DOMAIN.strip().rstrip("/")
    if not domain.startswith("https://") and not domain.startswith("http://"):
        domain = f"https://{domain}"
    if slug:
        return f"{domain}/?slug={slug}"
    return domain


def _build_start_keyboard(slug: str | None = None) -> InlineKeyboardMarkup:
    """Build inline keyboard for Mini App launch."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚕 Открыть APARU",
                    web_app=WebAppInfo(url=_build_mini_app_url(slug)),
                )
            ]
        ]
    )


@router.message(CommandStart())
async def handle_start(message: Message, command: CommandObject) -> None:
    """Send welcome text and Mini App button.

    If /start was triggered via deep-link (/start {slug}), the Mini App
    button opens directly at that location.
    """
    slug = command.args or None
    await message.answer(
        "Привет! 👋 Я бот APARU Taxi. Нажмите кнопку ниже, чтобы открыть мини-приложение и заказать поездку.",
        reply_markup=_build_start_keyboard(slug),
    )


@router.message(F.contact)
async def handle_contact(message: Message) -> None:
    """Save shared phone number to the user profile."""
    if message.contact is None or message.from_user is None:
        return

    if message.contact.user_id is not None and message.contact.user_id != message.from_user.id:
        await message.answer("Пожалуйста, отправьте свой номер через встроенную кнопку Telegram.")
        return

    async with async_session_maker() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == message.from_user.id)
        )
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                telegram_id=message.from_user.id,
                first_name=message.from_user.first_name or "",
                username=message.from_user.username,
                phone=message.contact.phone_number,
                onboarded=True,
            )
            session.add(user)
        else:
            user.phone = message.contact.phone_number
            user.onboarded = True
            if message.from_user.first_name:
                user.first_name = message.from_user.first_name
            if message.from_user.username is not None:
                user.username = message.from_user.username

        await session.commit()

    await message.answer("Спасибо! Ваш номер сохранён.")


def register_handlers(dispatcher: Dispatcher) -> None:
    """Register all bot handlers in dispatcher."""
    dispatcher.include_router(router)
