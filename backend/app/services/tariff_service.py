"""Tariff service — price calculation using the formula from CLAUDE.md."""

import json
import logging
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting

logger = logging.getLogger(__name__)

# Human-readable tariff names in all supported languages
_TARIFF_NAMES: dict[str, dict[str, str]] = {
    "econom":    {"ru": "Эконом",    "kz": "Эконом",    "en": "Economy",   "zh": "经济型"},
    "optimal":   {"ru": "Оптимал",   "kz": "Оптимал",   "en": "Optimal",   "zh": "标准型"},
    "comfort":   {"ru": "Комфорт",   "kz": "Комфорт",   "en": "Comfort",   "zh": "舒适型"},
    "universal": {"ru": "Универсал", "kz": "Универсал", "en": "Universal", "zh": "通用型"},
    "minivan":   {"ru": "Минивэн",   "kz": "Минивэн",   "en": "Minivan",   "zh": "商务车"},
}

_DEFAULT_CONFIG: dict[str, Any] = {
    "tariffs": {
        "econom":    {"base_fare": 600, "base_km": 2, "per_km": 90,  "car_type": "sedan"},
        "optimal":   {"base_fare": 700, "base_km": 2, "per_km": 100, "car_type": "sedan"},
        "comfort":   {"base_fare": 850, "base_km": 2, "per_km": 120, "car_type": "sedan"},
        "universal": {"base_fare": 750, "base_km": 2, "per_km": 100, "car_type": "universal"},
        "minivan":   {"base_fare": 850, "base_km": 2, "per_km": 100, "car_type": "minivan"},
    },
    "time_surcharge_after_min": 12,
    "time_surcharge_per_min": 20,
    "max_distance_km": 30,
    "search_timeout_sec": 15,
    "driver_wait_timeout_min": 10,
    "surge_multiplier": 1.0,
}


async def load_tariffs(redis: Redis, db: AsyncSession) -> dict[str, Any]:
    """Load tariff configuration from Redis cache or DB settings table.

    Tries Redis key ``aparu:config:tariffs`` first.  On cache miss *or Redis
    failure*, falls back to the ``settings`` DB table (key='tariffs') and
    tries to write the result back to Redis.  Never raises — always returns a
    valid config (at worst the built-in defaults).

    Args:
        redis: Async Redis client.
        db: Async SQLAlchemy session.

    Returns:
        Full tariff configuration dict.
    """
    # 1. Try Redis cache first
    try:
        raw = await redis.get("aparu:config:tariffs")
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis unavailable, falling back to DB for tariffs: %s", exc)

    # 2. Fall back to DB
    try:
        result = await db.execute(select(Setting).where(Setting.key == "tariffs"))
        setting = result.scalar_one_or_none()
    except Exception as exc:
        logger.error("DB unavailable for tariffs, returning built-in defaults: %s", exc)
        return _DEFAULT_CONFIG

    if setting is None:
        logger.warning("tariff config missing from DB — using built-in defaults")
        return _DEFAULT_CONFIG

    config: dict[str, Any] = setting.value

    # 3. Try to populate Redis cache (non-critical)
    try:
        await redis.set("aparu:config:tariffs", json.dumps(config))
    except Exception as exc:
        logger.warning("Failed to cache tariffs in Redis: %s", exc)

    return config


def calculate_price(
    tariff_key: str,
    distance_m: int,
    time_ms: int,
    config: dict[str, Any],
) -> int:
    """Calculate ride price in tenge using the exact formula from CLAUDE.md.

    Args:
        tariff_key: Tariff identifier (e.g. ``'econom'``).
        distance_m: Route distance in metres.
        time_ms: Route duration in milliseconds.
        config: Full tariff config dict (as returned by :func:`load_tariffs`).

    Returns:
        Estimated price as an integer in tenge (no tiyn).

    Raises:
        KeyError: If ``tariff_key`` is not found in ``config['tariffs']``.
    """
    tariff = config["tariffs"][tariff_key]
    surge_multiplier: float = float(config.get("surge_multiplier", 1.0))
    time_surcharge_after: float = float(config.get("time_surcharge_after_min", 12))
    time_surcharge_per: float = float(config.get("time_surcharge_per_min", 20))

    base_fare: int = int(tariff["base_fare"])
    base_km: float = float(tariff["base_km"])
    per_km: float = float(tariff["per_km"])

    distance_km = distance_m / 1000
    time_min = time_ms / 60000

    if distance_km <= base_km:
        price: float = base_fare
    else:
        price = base_fare + (distance_km - base_km) * per_km

    if time_min > time_surcharge_after:
        price += (time_min - time_surcharge_after) * time_surcharge_per

    return max(int(price * surge_multiplier), base_fare)


def get_tariff_list(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Return tariff list ready for frontend display.

    Args:
        config: Full tariff config dict (as returned by :func:`load_tariffs`).

    Returns:
        List of dicts with keys: ``key``, ``name_ru``, ``name_kz``, ``name_en``,
        ``base_fare``, ``per_km``, ``car_type``.
    """
    result: list[dict[str, Any]] = []
    for key, tariff in config["tariffs"].items():
        names = _TARIFF_NAMES.get(key, {"ru": key, "kz": key, "en": key})
        result.append(
            {
                "key": key,
                "name_ru": names["ru"],
                "name_kz": names["kz"],
                "name_en": names["en"],
                "name_zh": names.get("zh", names["en"]),
                "base_fare": int(tariff["base_fare"]),
                "per_km": float(tariff["per_km"]),
                "car_type": tariff.get("car_type", "sedan"),
            }
        )
    return result
