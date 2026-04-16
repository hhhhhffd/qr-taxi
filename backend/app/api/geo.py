"""Geo/mapping proxy endpoints — forward to Aparu Maps API with Redis caching."""

import logging

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.dependencies import get_current_user, get_current_user_optional
from app.models.user import User
from app.redis import get_redis
from app.schemas.geo import (
    GeoSearchRequest,
    GeoSearchResponse,
    ReverseGeocodeRequest,
    ReverseGeocodeResponse,
    RouteRequest,
    RouteResponse,
)
from app.services import geo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/geo", tags=["Geo"])


@router.post("/search", response_model=GeoSearchResponse)
async def geo_search(
    body: GeoSearchRequest,
    _user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> GeoSearchResponse:
    """Forward geocode / address autocomplete. Requires authentication."""
    results = await geo_service.search(body.text, body.latitude, body.longitude, redis)
    return GeoSearchResponse(results=results)


@router.post("/route", response_model=RouteResponse)
async def geo_route(
    body: RouteRequest,
    _user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> RouteResponse:
    """Calculate a route between two or more points. Requires authentication."""
    return await geo_service.get_route(body.points, redis)


@router.post("/reverse", response_model=ReverseGeocodeResponse)
async def geo_reverse(
    body: ReverseGeocodeRequest,
    _user: User | None = Depends(get_current_user_optional),
    redis: Redis = Depends(get_redis),
) -> ReverseGeocodeResponse:
    """Reverse geocode a coordinate pair to a human-readable address. Authentication optional."""
    return await geo_service.reverse_geocode(body.latitude, body.longitude, redis)
