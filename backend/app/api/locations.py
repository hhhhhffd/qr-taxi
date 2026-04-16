"""Location and QR scan endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user_optional
from app.models.location import Location
from app.models.qr_scan import QrScan
from app.models.user import User
from app.schemas.location import LocationOut, QrScanOut, QrScanRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Locations"])

# Language keys mapped to the corresponding hint column name on Location
_HINT_ATTRS: dict[str, str] = {
    "ru": "hint_ru",
    "kz": "hint_kz",
    "en": "hint_en",
}


@router.get("/locations/{slug}", response_model=LocationOut)
async def get_location(
    slug: str,
    lang: str = "ru",
    db: AsyncSession = Depends(get_db),
) -> LocationOut:
    """Fetch an active QR scan location by slug.

    The ``hint`` field in the response is resolved by ``lang`` with fallback to
    ``hint_ru``.  Returns 404 if the slug is unknown or the location is inactive.
    """
    result = await db.execute(
        select(Location).where(Location.slug == slug, Location.is_active.is_(True))
    )
    location = result.scalar_one_or_none()
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Локация не найдена.")

    # Resolve hint by language; fall back to hint_ru when the translation is absent
    attr = _HINT_ATTRS.get(lang, "hint_ru")
    hint: str = getattr(location, attr) or location.hint_ru

    return LocationOut(
        id=location.id,
        slug=location.slug,
        name=location.name,
        lat=float(location.lat),
        lng=float(location.lng),
        hint=hint,
        address=location.address,
    )


@router.post("/qr-scans", response_model=QrScanOut, status_code=status.HTTP_201_CREATED)
async def record_qr_scan(
    body: QrScanRequest,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> QrScanOut:
    """Record a QR scan analytics event. Authentication optional.

    Stores the scan with location, optional user, language, and User-Agent for
    heatmap and funnel analytics in Metabase.
    """
    loc_result = await db.execute(select(Location).where(Location.id == body.location_id))
    location = loc_result.scalar_one_or_none()
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Локация не найдена.")

    scan = QrScan(
        location_id=body.location_id,
        user_id=user.id if user else None,
        user_agent=request.headers.get("user-agent"),
        lang=body.lang,
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    logger.info("qr_scan recorded id=%d location_id=%d", scan.id, scan.location_id)
    return QrScanOut(id=scan.id)
