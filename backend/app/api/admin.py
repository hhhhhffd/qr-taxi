"""Admin CRUD endpoints — require is_admin=True."""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from jose import jwt
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_user
from app.models.location import Location
from app.models.order import Order
from app.models.order_event import OrderEvent
from app.models.setting import Setting
from app.models.user import User
from app.redis import get_redis
from app.schemas.admin import (
    AdminLocationCreate,
    AdminLocationOut,
    AdminOrderDetail,
    AdminOrderEventOut,
    AdminOrderOut,
    AnalyticsSummary,
    HeatmapPoint,
    MetabaseEmbedOut,
    TariffUpdateRequest,
)
from app.services import geo_service, qr_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

_QR_DIR = Path("/app/static/qr")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _location_to_out(location: Location, order_count: int) -> AdminLocationOut:
    """Convert a Location ORM object to AdminLocationOut schema."""
    return AdminLocationOut(
        id=location.id,
        slug=location.slug,
        name=location.name,
        lat=float(location.lat),
        lng=float(location.lng),
        hint_ru=location.hint_ru,
        hint_kz=location.hint_kz,
        hint_en=location.hint_en,
        address=location.address,
        qr_image_url=location.qr_image_url,
        is_active=location.is_active,
        order_count=order_count,
        created_at=location.created_at,
    )


def _order_to_out(order: Order, location_name: str) -> AdminOrderOut:
    """Convert an Order ORM object to AdminOrderOut schema."""
    return AdminOrderOut(
        id=order.id,
        status=order.status,
        tariff=order.tariff,
        estimated_price=order.estimated_price,
        final_price=order.final_price,
        location_id=order.location_id,
        location_name=location_name,
        user_id=order.user_id,
        created_at=order.created_at,
        completed_at=order.completed_at,
        cancelled_at=order.cancelled_at,
    )


def _order_to_detail(order: Order, location_name: str) -> AdminOrderDetail:
    """Convert an Order ORM object (with events loaded) to AdminOrderDetail."""
    events = [
        AdminOrderEventOut(
            id=ev.id,
            status=ev.status,
            meta=ev.meta,
            created_at=ev.created_at,
        )
        for ev in sorted(order.events, key=lambda e: e.created_at)
    ]
    return AdminOrderDetail(
        id=order.id,
        status=order.status,
        tariff=order.tariff,
        estimated_price=order.estimated_price,
        final_price=order.final_price,
        location_id=order.location_id,
        location_name=location_name,
        user_id=order.user_id,
        created_at=order.created_at,
        completed_at=order.completed_at,
        cancelled_at=order.cancelled_at,
        point_a_lat=float(order.point_a_lat),
        point_a_lng=float(order.point_a_lng),
        point_a_address=order.point_a_address,
        point_b_lat=float(order.point_b_lat) if order.point_b_lat is not None else None,
        point_b_lng=float(order.point_b_lng) if order.point_b_lng is not None else None,
        point_b_address=order.point_b_address,
        driver_id=order.driver_id,
        assigned_at=order.assigned_at,
        arrived_at=order.arrived_at,
        started_at=order.started_at,
        events=events,
    )


def _build_metabase_embed() -> MetabaseEmbedOut:
    """Build a signed Metabase dashboard embed URL from environment config."""
    site_url = settings.METABASE_SITE_URL
    embed_secret = settings.METABASE_EMBED_SECRET
    dashboard_id = settings.METABASE_DASHBOARD_ID

    if not site_url or not embed_secret or dashboard_id is None:
        return MetabaseEmbedOut(
            is_configured=False,
            dashboard_url=None,
            reason=(
                "Metabase embed is not configured. "
                "Set METABASE_SITE_URL, METABASE_EMBED_SECRET and METABASE_DASHBOARD_ID."
            ),
        )

    exp = int(
        (
            datetime.now(timezone.utc)
            + timedelta(minutes=settings.METABASE_EMBED_TTL_MINUTES)
        ).timestamp()
    )
    payload = {
        "resource": {"dashboard": dashboard_id},
        "params": {},
        "exp": exp,
    }
    token = jwt.encode(payload, embed_secret, algorithm="HS256")
    dashboard_url = (
        f"{site_url.rstrip('/')}/embed/dashboard/{token}"
        "#theme=night&bordered=false&titled=false"
    )
    return MetabaseEmbedOut(
        is_configured=True,
        dashboard_url=dashboard_url,
        reason=None,
    )


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------


@router.get("/locations", summary="List all QR locations with order counts")
async def list_locations(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return all locations (including inactive) with per-location order counts."""
    locs_result = await db.execute(select(Location).order_by(Location.created_at.desc()))
    locations = locs_result.scalars().all()

    # Build order count map via a single aggregation query
    counts_result = await db.execute(
        select(Order.location_id, func.count(Order.id).label("cnt"))
        .group_by(Order.location_id)
    )
    count_map: dict[int, int] = {row.location_id: row.cnt for row in counts_result}

    data = [_location_to_out(loc, count_map.get(loc.id, 0)) for loc in locations]
    return {"data": [item.model_dump() for item in data]}


@router.post("/locations", status_code=status.HTTP_201_CREATED, summary="Create a QR location")
async def create_location(
    body: AdminLocationCreate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Create a new QR location.

    If ``address`` is omitted, it is auto-filled via reverse geocode.
    A QR PNG is generated and saved to ``/app/static/qr/{slug}.png``.
    """
    # Slug uniqueness check
    existing = await db.execute(select(Location).where(Location.slug == body.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Location with slug '{body.slug}' already exists.",
        )

    # Auto reverse-geocode if address not supplied
    address = body.address
    if not address:
        try:
            rev = await geo_service.reverse_geocode(body.lat, body.lng, redis)
            address = rev.address
        except HTTPException:
            logger.warning("Reverse geocode failed for %.6f, %.6f — leaving address blank", body.lat, body.lng)
            address = None

    # Generate QR code
    try:
        qr_service.generate_qr(body.slug, settings.DOMAIN)
        qr_image_url = f"/static/qr/{body.slug}.png"
    except Exception as exc:
        logger.error("QR generation failed for slug '%s': %s", body.slug, exc)
        qr_image_url = None

    location = Location(
        slug=body.slug,
        name=body.name,
        lat=body.lat,
        lng=body.lng,
        hint_ru=body.hint_ru,
        hint_kz=body.hint_kz,
        hint_en=body.hint_en,
        address=address,
        qr_image_url=qr_image_url,
        is_active=body.is_active,
    )
    db.add(location)
    await db.commit()
    await db.refresh(location)

    return {"data": _location_to_out(location, 0).model_dump()}


@router.put("/locations/{location_id}", summary="Update a QR location")
async def update_location(
    location_id: int,
    body: AdminLocationCreate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Update an existing QR location.

    Slug is allowed to change.  If lat/lng changed and address is not supplied,
    address is re-fetched via reverse geocode.
    """
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")

    # Check slug uniqueness if it changed
    if body.slug != location.slug:
        existing = await db.execute(select(Location).where(Location.slug == body.slug))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Location with slug '{body.slug}' already exists.",
            )

    # Re-geocode if coordinates changed and address not supplied
    address = body.address
    coords_changed = float(location.lat) != body.lat or float(location.lng) != body.lng
    if not address and coords_changed:
        try:
            rev = await geo_service.reverse_geocode(body.lat, body.lng, redis)
            address = rev.address
        except HTTPException:
            address = location.address

    # Regenerate QR if slug changed
    if body.slug != location.slug:
        try:
            qr_service.generate_qr(body.slug, settings.DOMAIN)
            location.qr_image_url = f"/static/qr/{body.slug}.png"
        except Exception as exc:
            logger.error("QR regeneration failed for slug '%s': %s", body.slug, exc)

    location.slug = body.slug
    location.name = body.name
    location.lat = body.lat
    location.lng = body.lng
    location.hint_ru = body.hint_ru
    location.hint_kz = body.hint_kz
    location.hint_en = body.hint_en
    location.address = address
    location.is_active = body.is_active

    await db.commit()
    await db.refresh(location)

    # Fetch order count
    cnt_result = await db.execute(
        select(func.count(Order.id)).where(Order.location_id == location_id)
    )
    order_count = cnt_result.scalar_one() or 0

    return {"data": _location_to_out(location, order_count).model_dump()}


@router.patch("/locations/{location_id}/toggle", summary="Toggle location active status")
async def toggle_location(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Toggle ``is_active`` for a QR location."""
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")

    location.is_active = not location.is_active
    await db.commit()
    await db.refresh(location)

    cnt_result = await db.execute(
        select(func.count(Order.id)).where(Order.location_id == location_id)
    )
    order_count = cnt_result.scalar_one() or 0

    return {"data": _location_to_out(location, order_count).model_dump()}


@router.get("/locations/{location_id}/qr", summary="Serve QR PNG for a location")
async def get_location_qr(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> FileResponse:
    """Serve the QR code PNG for a location.

    If the file is missing (e.g. not yet generated), it is regenerated on demand.
    """
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")

    qr_path = _QR_DIR / f"{location.slug}.png"
    if not qr_path.exists():
        try:
            qr_service.generate_qr(location.slug, settings.DOMAIN)
            if not location.qr_image_url:
                location.qr_image_url = f"/static/qr/{location.slug}.png"
                await db.commit()
        except Exception as exc:
            logger.error("QR generation failed for slug '%s': %s", location.slug, exc)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="QR generation failed.")

    return FileResponse(
        path=str(qr_path),
        media_type="image/png",
        filename=f"qr_{location.slug}.png",
    )


# ---------------------------------------------------------------------------
# Tariffs
# ---------------------------------------------------------------------------


@router.get("/settings/tariffs", summary="Get current tariff configuration")
async def get_tariffs(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return the current tariff configuration from Redis cache or DB."""
    from app.services.tariff_service import load_tariffs

    config = await load_tariffs(redis, db)
    return {"data": config}


@router.put("/settings/tariffs", summary="Update tariff configuration")
async def update_tariffs(
    body: TariffUpdateRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Persist updated tariff config to the DB and invalidate the Redis cache.

    The new config is immediately live: the next price calculation will use it.
    """
    new_config = body.model_dump()

    # Upsert the settings row
    result = await db.execute(select(Setting).where(Setting.key == "tariffs"))
    setting = result.scalar_one_or_none()
    if setting is None:
        setting = Setting(key="tariffs", value=new_config)
        db.add(setting)
    else:
        setting.value = new_config

    await db.commit()

    # Invalidate Redis so the next read re-populates from DB
    await redis.delete("aparu:config:tariffs")
    logger.info("Tariff config updated and Redis cache invalidated")

    return {"data": new_config}


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


@router.get("/orders", summary="List orders with optional filters")
async def list_orders(
    status_filter: str | None = Query(None, alias="status"),
    tariff: str | None = Query(None),
    location_id: int | None = Query(None),
    date_from: str | None = Query(None, description="ISO 8601 start date, e.g. 2026-01-01"),
    date_to: str | None = Query(None, description="ISO 8601 end date, e.g. 2026-01-31"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return a paginated, filtered list of orders for the admin dashboard."""
    query = select(Order).options(selectinload(Order.location))

    if status_filter:
        query = query.where(Order.status == status_filter)
    if tariff:
        query = query.where(Order.tariff == tariff)
    if location_id is not None:
        query = query.where(Order.location_id == location_id)
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            query = query.where(Order.created_at >= dt_from)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date_from format. Use ISO 8601.")
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            query = query.where(Order.created_at <= dt_to)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date_to format. Use ISO 8601.")

    query = query.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    orders = result.scalars().all()

    data = [_order_to_out(o, o.location.name if o.location else str(o.location_id)) for o in orders]
    return {"data": [item.model_dump() for item in data]}


@router.get("/orders/{order_id}", summary="Get order detail with event timeline")
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return full order detail including pickup coordinates and all events."""
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.location), selectinload(Order.events))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    location_name = order.location.name if order.location else str(order.location_id)
    return {"data": _order_to_detail(order, location_name).model_dump()}


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------


@router.get("/analytics/heatmap", summary="Pickup heatmap data")
async def get_heatmap(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return heatmap points — each location's coordinates weighted by order count."""
    result = await db.execute(
        select(
            Location.lat,
            Location.lng,
            func.count(Order.id).label("weight"),
        )
        .join(Order, Order.location_id == Location.id, isouter=True)
        .group_by(Location.id, Location.lat, Location.lng)
        .having(func.count(Order.id) > 0)
    )
    rows = result.all()

    data = [
        HeatmapPoint(lat=float(row.lat), lng=float(row.lng), weight=row.weight).model_dump()
        for row in rows
    ]
    return {"data": data}


@router.get("/analytics/summary", summary="Dashboard summary statistics")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return aggregated stats: orders today, orders this week, avg price, avg wait."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    # Orders today
    today_result = await db.execute(
        select(func.count(Order.id)).where(Order.created_at >= today_start)
    )
    total_today: int = today_result.scalar_one() or 0

    # Orders this week
    week_result = await db.execute(
        select(func.count(Order.id)).where(Order.created_at >= week_start)
    )
    total_week: int = week_result.scalar_one() or 0

    # Average final price (fall back to estimated if final is null)
    price_result = await db.execute(
        select(func.avg(func.coalesce(Order.final_price, Order.estimated_price))).where(
            Order.status == "ride_completed"
        )
    )
    avg_price_raw = price_result.scalar_one()
    avg_price: float | None = float(avg_price_raw) if avg_price_raw is not None else None

    # Average wait time (searching → driver_assigned) in seconds
    wait_result = await db.execute(
        select(func.avg(func.extract("epoch", Order.assigned_at - Order.created_at))).where(
            Order.assigned_at.is_not(None)
        )
    )
    avg_wait_raw = wait_result.scalar_one()
    avg_wait_seconds: float | None = float(avg_wait_raw) if avg_wait_raw is not None else None

    summary = AnalyticsSummary(
        total_today=total_today,
        total_week=total_week,
        avg_price=round(avg_price, 2) if avg_price is not None else None,
        avg_wait_seconds=round(avg_wait_seconds, 1) if avg_wait_seconds is not None else None,
    )
    return {"data": summary.model_dump()}


@router.get("/analytics/metabase", summary="Signed Metabase dashboard embed URL")
async def get_metabase_embed(
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Return a signed Metabase dashboard URL for secure iframe embedding."""
    embed = _build_metabase_embed()
    return {"data": embed.model_dump()}
