"""Main API router aggregating all sub-routers."""

from fastapi import APIRouter

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.geo import router as geo_router
from app.api.go import router as go_router
from app.api.locations import router as locations_router
from app.api.orders import router as orders_router
from app.bot.webhook import router as bot_webhook_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(geo_router)
api_router.include_router(locations_router)
api_router.include_router(orders_router)
api_router.include_router(bot_webhook_router)
api_router.include_router(admin_router)

# Platform router is mounted WITHOUT /api/ prefix in main.py
platform_router = go_router
