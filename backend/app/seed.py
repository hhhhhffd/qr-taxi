"""Database seed script for initial data population."""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver import Driver
from app.models.location import Location
from app.models.order import Order
from app.models.order_event import OrderEvent
from app.models.setting import Setting
from app.models.user import User

logger = logging.getLogger(__name__)

TARIFF_CONFIG: dict = {
    "tariffs": {
        "econom": {"base_fare": 600, "base_km": 2, "per_km": 90, "free_wait_min": 3, "wait_per_min": 30, "car_type": "sedan"},
        "optimal": {"base_fare": 700, "base_km": 2, "per_km": 100, "free_wait_min": 3, "wait_per_min": 30, "car_type": "sedan"},
        "comfort": {"base_fare": 850, "base_km": 2, "per_km": 120, "free_wait_min": 3, "wait_per_min": 30, "car_type": "sedan"},
        "universal": {"base_fare": 750, "base_km": 2, "per_km": 100, "free_wait_min": 5, "wait_per_min": 30, "car_type": "universal"},
        "minivan": {"base_fare": 850, "base_km": 2, "per_km": 100, "free_wait_min": 5, "wait_per_min": 30, "car_type": "minivan"},
    },
    "time_surcharge_after_min": 12,
    "time_surcharge_per_min": 20,
    "max_distance_km": 30,
    "search_timeout_sec": 15,
    "driver_wait_timeout_min": 10,
    "surge_multiplier": 1.0,
}

DRIVERS_DATA: list[dict[str, str]] = [
    {"name": "Ержан", "car_model": "Toyota Camry 70", "car_color": "белый", "car_class": "econom", "rating": "4.8"},
    {"name": "Айдос", "car_model": "Chevrolet Malibu", "car_color": "чёрный", "car_class": "optimal", "rating": "4.6"},
    {"name": "Нурлан", "car_model": "Hyundai Sonata", "car_color": "серебристый", "car_class": "comfort", "rating": "4.9"},
    {"name": "Серик", "car_model": "Kia K5", "car_color": "серый", "car_class": "optimal", "rating": "4.5"},
    {"name": "Бауыржан", "car_model": "Daewoo Nexia", "car_color": "белый", "car_class": "econom", "rating": "4.3"},
    {"name": "Арман", "car_model": "Toyota Camry 55", "car_color": "чёрный", "car_class": "econom", "rating": "4.7"},
    {"name": "Дамир", "car_model": "Hyundai Sonata", "car_color": "белый", "car_class": "comfort", "rating": "5.0"},
    {"name": "Канат", "car_model": "Chevrolet Cobalt", "car_color": "серебристый", "car_class": "econom", "rating": "4.4"},
    {"name": "Тимур", "car_model": "Kia K5", "car_color": "чёрный", "car_class": "optimal", "rating": "4.6"},
    {"name": "Руслан", "car_model": "Chevrolet Malibu", "car_color": "серый", "car_class": "optimal", "rating": "4.8"},
    {"name": "Марат", "car_model": "Toyota Alphard", "car_color": "белый", "car_class": "minivan", "rating": "4.9"},
    {"name": "Асылбек", "car_model": "Chevrolet Orlando", "car_color": "серебристый", "car_class": "universal", "rating": "4.5"},
    {"name": "Болат", "car_model": "Lada Largus", "car_color": "серый", "car_class": "universal", "rating": "4.2"},
    {"name": "Талгат", "car_model": "Toyota Alphard", "car_color": "чёрный", "car_class": "minivan", "rating": "4.7"},
    {"name": "Жандос", "car_model": "Daewoo Nexia", "car_color": "серебристый", "car_class": "econom", "rating": "4.3"},
]

LOCATIONS_DATA: list[dict[str, str]] = [
    {"slug": "mega_exit1", "name": "ТРЦ Mega, Выход №1", "lat": "49.9337", "lng": "82.6098", "hint_ru": "Центральный вход, левое крыло"},
    {"slug": "mega_exit2", "name": "ТРЦ Mega, Выход №2", "lat": "49.9341", "lng": "82.6112", "hint_ru": "Вход со стороны парковки"},
    {"slug": "airport", "name": "Аэропорт", "lat": "50.0366", "lng": "82.4942", "hint_ru": "Выход из зала прилёта"},
    {"slug": "railway_station", "name": "Ж/д вокзал «Защита»", "lat": "50.0012", "lng": "82.5789", "hint_ru": "Главный вход"},
    {"slug": "forum_mall", "name": "ТРЦ Forum", "lat": "49.9478", "lng": "82.6284", "hint_ru": "Центральный вход"},
    {"slug": "irtysh_embankment", "name": "Набережная Иртыша", "lat": "49.9445", "lng": "82.6175", "hint_ru": "У лестницы к воде"},
    {"slug": "bus_station", "name": "Автовокзал", "lat": "49.9512", "lng": "82.6135", "hint_ru": "Выход к платформам"},
]

CYRILLIC_PLATE_LETTERS = "АВЕКМНОРСТУХ"

ORDER_LIFECYCLE: list[str] = [
    "searching",
    "driver_assigned",
    "driver_arriving",
    "driver_arrived",
    "ride_started",
    "ride_completed",
]


def _generate_plate() -> str:
    """Generate a random Cyrillic license plate in Kazakhstan format."""
    letter1 = random.choice(CYRILLIC_PLATE_LETTERS)
    digits = f"{random.randint(100, 999)}"
    letter2 = random.choice(CYRILLIC_PLATE_LETTERS)
    letter3 = random.choice(CYRILLIC_PLATE_LETTERS)
    letter4 = random.choice(CYRILLIC_PLATE_LETTERS)
    return f"{letter1} {digits} {letter2}{letter3}{letter4}"


def _generate_phone() -> str:
    """Generate a random Kazakhstan phone number."""
    digits = "".join(str(random.randint(0, 9)) for _ in range(7))
    return f"+7 705 {digits[:3]} {digits[3:5]} {digits[5:]}"


def _random_lat() -> Decimal:
    """Random latitude within Ust-Kamenogorsk bounds."""
    return Decimal(str(round(random.uniform(49.93, 49.96), 6)))


def _random_lng() -> Decimal:
    """Random longitude within Ust-Kamenogorsk bounds."""
    return Decimal(str(round(random.uniform(82.59, 82.63), 6)))


def _calculate_price(tariff_name: str, distance_km: float, time_min: float) -> int:
    """Calculate order price using the tariff formula from CLAUDE.md."""
    tariff = TARIFF_CONFIG["tariffs"][tariff_name]
    base_fare: int = tariff["base_fare"]
    base_km: int = tariff["base_km"]
    per_km: int = tariff["per_km"]
    surge: float = TARIFF_CONFIG["surge_multiplier"]
    time_surcharge_after: int = TARIFF_CONFIG["time_surcharge_after_min"]
    time_surcharge_per: int = TARIFF_CONFIG["time_surcharge_per_min"]

    if distance_km <= base_km:
        price = float(base_fare)
    else:
        price = float(base_fare) + (distance_km - base_km) * per_km

    if time_min > time_surcharge_after:
        price += (time_min - time_surcharge_after) * time_surcharge_per

    return max(int(price * surge), base_fare)


async def seed_database(session: AsyncSession) -> None:
    """Populate database with initial seed data. Idempotent — skips if data exists."""
    result = await session.execute(select(func.count()).select_from(Driver))
    driver_count = result.scalar_one()
    if driver_count > 0:
        logger.info("Seed data already exists, skipping")
        return

    logger.info("Seeding database...")

    # 1. Admin user
    admin = User(
        telegram_id=1,
        first_name="Admin",
        is_admin=True,
        onboarded=True,
        lang="ru",
    )
    session.add(admin)
    await session.flush()

    # 2. Drivers (15)
    drivers: list[Driver] = []
    for data in DRIVERS_DATA:
        driver = Driver(
            name=data["name"],
            car_model=data["car_model"],
            car_color=data["car_color"],
            plate=_generate_plate(),
            phone=_generate_phone(),
            rating=Decimal(data["rating"]),
            lat=_random_lat(),
            lng=_random_lng(),
            car_class=data["car_class"],
            status="available",
        )
        drivers.append(driver)
    session.add_all(drivers)
    await session.flush()

    # 3. Locations (7)
    locations: list[Location] = []
    for data in LOCATIONS_DATA:
        location = Location(
            slug=data["slug"],
            name=data["name"],
            lat=Decimal(data["lat"]),
            lng=Decimal(data["lng"]),
            hint_ru=data["hint_ru"],
            is_active=True,
        )
        locations.append(location)
    session.add_all(locations)
    await session.flush()

    # 4. Default tariff settings
    tariff_setting = Setting(key="tariffs", value=TARIFF_CONFIG)
    session.add(tariff_setting)

    # 5. Historical orders (30, all ride_completed)
    now = datetime.now(timezone.utc)
    tariff_names = list(TARIFF_CONFIG["tariffs"].keys())

    for _ in range(30):
        location = random.choice(locations)
        driver = random.choice(drivers)
        tariff_name = random.choice(tariff_names)

        # Random timestamps within last 7 days
        created = now - timedelta(days=random.uniform(0.5, 7))
        assigned = created + timedelta(seconds=random.randint(8, 15))
        arrived = assigned + timedelta(minutes=random.randint(3, 8))
        started = arrived + timedelta(minutes=random.randint(1, 3))

        # Random trip parameters
        distance_km = round(random.uniform(2, 15), 1)
        time_min = round(random.uniform(5, 25), 1)
        completed = started + timedelta(minutes=time_min)

        price = _calculate_price(tariff_name, distance_km, time_min)
        has_point_b = random.random() > 0.3

        order = Order(
            user_id=admin.id,
            driver_id=driver.id,
            location_id=location.id,
            point_a_lat=location.lat,
            point_a_lng=location.lng,
            point_a_address=location.name,
            point_b_lat=_random_lat() if has_point_b else None,
            point_b_lng=_random_lng() if has_point_b else None,
            point_b_address="ул. Казахстан, 64" if has_point_b else None,
            tariff=tariff_name,
            status="ride_completed",
            estimated_price=price,
            final_price=price + random.randint(-50, 100),
            surge_multiplier=Decimal("1.00"),
            share_token=uuid.uuid4(),
            rating=random.randint(3, 5),
            search_delay=random.randint(8, 15),
            assigned_at=assigned,
            arrived_at=arrived,
            started_at=started,
            completed_at=completed,
            created_at=created,
            updated_at=completed,
        )
        session.add(order)
        await session.flush()

        # Create order events for full lifecycle
        event_times: dict[str, datetime] = {
            "searching": created,
            "driver_assigned": assigned,
            "driver_arriving": assigned + timedelta(seconds=5),
            "driver_arrived": arrived,
            "ride_started": started,
            "ride_completed": completed,
        }
        for event_status in ORDER_LIFECYCLE:
            event = OrderEvent(
                order_id=order.id,
                status=event_status,
                meta={"source": "seed"} if event_status == "searching" else None,
                created_at=event_times[event_status],
            )
            session.add(event)

    await session.commit()
    logger.info("Seed data created: 1 admin, 15 drivers, 7 locations, 30 orders")
